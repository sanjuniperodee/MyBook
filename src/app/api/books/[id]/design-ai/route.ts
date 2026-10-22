import { NextResponse } from "next/server";
import { z } from "zod";
import { api, apiBook, HttpError } from "@/server/api";
import { rateLimit } from "@/server/rateLimit";
import { container } from "@/server/container";
import { idParams } from "@/server/input";
import { AssistantError } from "@/modules/assistant";
import { completeDesignAi, designAiAllowance, failDesignAi, reserveDesignAi } from "@/server/designAiStore";
import { designAiPacks } from "@/server/designAiPacks";
import { runDesignAi, type Ask, type CoverState, type PagesState } from "@/lib/book/design-ai";
import { parseCoverDesign } from "@/lib/book/cover-design";
import { getFormat } from "@/lib/book/formats";
import { getInteriorDesign, isInteriorId, parseInteriorStyle } from "@/lib/book/interiors";
import { isKnownCover } from "@/lib/book/covers";
import { bookKind } from "@/lib/content/kinds";
import { getLocale } from "@/i18n/server";

export const maxDuration = 120;

const body = z.discriminatedUnion("target", [
  z.object({
    target: z.literal("pages"),
    prompt: z.string().trim().min(2).max(500),
    state: z.object({ interior: z.string().max(40), style: z.record(z.string(), z.unknown()) }),
    chapters: z.array(z.object({ key: z.string().max(90), title: z.string().max(120) })).max(60).default([]),
  }),
  z.object({
    target: z.literal("cover"),
    prompt: z.string().trim().min(2).max(500),
    state: z.object({ template: z.string().max(40), design: z.record(z.string(), z.unknown()) }),
  }),
]);

/** Остаток лимита ИИ-дизайнера и пакеты запросов — редактор показывает их до того, как клиент что-то отправит. */
export const GET = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = idParams(await params, "id");
  const { user } = await apiBook(req, id);
  return NextResponse.json({ allowance: await designAiAllowance(user.id), packs: await designAiPacks() });
});

/**
 * Просьба к ИИ-дизайнеру: оформление страниц или обложка. Состояние — из редактора (ещё не обязательно сохранено);
 * ответ — новое состояние, которое редактор применяет с отменой и сохраняет сам. Лимит: 5 бесплатных на клиента, дальше —
 * купленные запросы; без них — 402 designAiLimit, и редактор предлагает пакеты.
 */
export const POST = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = idParams(await params, "id");
  const { user, book } = await apiBook(req, id, { editable: true });
  const input = body.parse(await req.json());
  const designer = container().assistant.designer;
  if (!(await designer.configured())) throw new HttpError(503, "designAiOff");
  // Защита от очереди кликов: не чаще раза в 5 секунд (дневной лимит считается отдельно).
  if (!(await rateLimit(`design-ai:${user.id}`, 1, 5_000))) throw new HttpError(429, "writeAiRate");

  const format = getFormat(book.format);
  const ui = await getLocale();
  const reserved = await reserveDesignAi({ userId: user.id, bookId: book.id, target: input.target, prompt: input.prompt });
  // Лимит и купленные кончились — редактор сам покажет пакеты (GET).
  if (!reserved) throw new HttpError(402, "designAiLimit");

  const ask: Ask = async (r) => {
    const res = await designer.ask(r);
    return { text: res.text, usage: { inputTokens: res.usage.input, outputTokens: res.usage.output, cacheReadTokens: res.usage.cacheRead, cacheWriteTokens: res.usage.cacheWrite } };
  };
  const ctx = { title: book.title, kind: bookKind(book.theme), language: book.language, format, ui };
  try {
    if (input.target === "pages") {
      const state: PagesState = { interior: isInteriorId(input.state.interior) ? input.state.interior : getInteriorDesign(book.interior).id, style: parseInteriorStyle(input.state.style) };
      const res = await runDesignAi(ask, { target: "pages", request: input.prompt, state, book: { ...ctx, chapters: input.chapters } });
      await completeDesignAi(reserved.id, { reply: res.reply, ops: res.ops, errors: res.errors, usage: res.usage });
      return NextResponse.json({ reply: res.reply, changed: res.changed, interior: res.state.interior, interiorStyle: res.state.style, allowance: await designAiAllowance(user.id), source: reserved.source });
    }
    const photos = (await container().authoring.queries.photos(book.id)).map((p) => ({ id: p.id, width: p.width, height: p.height }));
    const design = parseCoverDesign(input.state.design);
    if (!design) throw new HttpError(400, "badRequest");
    const state: CoverState = { template: isKnownCover(input.state.template) ? input.state.template : book.coverTemplate, design };
    const res = await runDesignAi(ask, { target: "cover", request: input.prompt, state, book: { ...ctx, photos } });
    // Фото слоёв — только фото этой книги (модель могла придумать id).
    const own = new Set(photos.map((p) => p.id));
    const safe = { ...res.state.design, layers: res.state.design.layers.map((l) => (l.kind === "image" && l.photoId && !own.has(l.photoId) ? { ...l, photoId: null } : l)) };
    await completeDesignAi(reserved.id, { reply: res.reply, ops: res.ops, errors: res.errors, usage: res.usage });
    return NextResponse.json({ reply: res.reply, changed: res.changed, coverTemplate: res.state.template, coverDesign: safe, allowance: await designAiAllowance(user.id), source: reserved.source });
  } catch (err) {
    await failDesignAi(reserved.id, err instanceof Error ? err.message : String(err));
    if (err instanceof HttpError) throw err;
    if (!AssistantError.is(err)) throw err;
    console.error("[design-ai]", err.message);
    throw new HttpError(err.code === "notConfigured" ? 503 : 502, err.code === "notConfigured" ? "designAiOff" : "designAiBusy");
  }
});
