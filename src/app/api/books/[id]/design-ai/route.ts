import { NextResponse } from "next/server";
import { z } from "zod";
import { api, apiBook, HttpError } from "@/server/api";
import { rateLimit } from "@/server/rateLimit";
import { container } from "@/server/container";
import { idParams } from "@/server/input";
import { AssistantError } from "@/modules/assistant";
import { completeDesignAi, designAiAllowance, failDesignAi, reserveDesignAi } from "@/server/designAiStore";
import { designAiPacks } from "@/server/designAiPacks";
import { renderCoverPreview, renderPagesPreview } from "@/modules/production";
import { photoPalette } from "@/server/photoPalette";
import { describeCover, describePages, describeTemplate, designTier, runDesignAi, runDesignReview, runDesignVariants, type Ask, type CoverState, type DesignAiInput, type DesignBookContext, type DesignTarget, type PagesState } from "@/lib/book/design-ai";
import { parseCoverDesign, type CoverDesign } from "@/lib/book/cover-design";
import { coverNames } from "@/lib/book/cover-names";
import { getFormat } from "@/lib/book/formats";
import { getInteriorDesign, isInteriorId, parseInteriorStyle } from "@/lib/book/interiors";
import { getCoverTemplate, isKnownCover } from "@/lib/book/covers";
import { bookKind } from "@/lib/content/kinds";
import { getLocale, getMessages } from "@/i18n/server";

export const maxDuration = 120;

const common = {
  mode: z.enum(["edit", "create", "variants", "review"]).default("edit"),
  prompt: z.string().trim().max(500),
  history: z.array(z.object({ prompt: z.string().max(500), reply: z.string().max(600) })).max(4).default([]),
};
const body = z.discriminatedUnion("target", [
  z.object({
    target: z.literal("pages"),
    ...common,
    state: z.object({ interior: z.string().max(40), style: z.record(z.string(), z.unknown()) }),
    chapters: z.array(z.object({ key: z.string().max(90), title: z.string().max(120) })).max(60).default([]),
  }),
  z.object({
    target: z.literal("cover"),
    ...common,
    state: z.object({ template: z.string().max(40), design: z.record(z.string(), z.unknown()) }),
  }),
]);

/** Остаток лимита ИИ-дизайнера, пакеты запросов и подсказки под книгу — редактор показывает их до первой просьбы. */
export const GET = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = idParams(await params, "id");
  const { user, book } = await apiBook(req, id);
  const photos = await container().authoring.queries.photos(book.id);
  // Тема и наличие фото — для подсказок-идей под эту книгу.
  return NextResponse.json({ allowance: await designAiAllowance(user.id), packs: await designAiPacks(), theme: book.theme, hasPhotos: photos.length > 0 });
});

/** Готовое оформление для редактора: страницы — стиль и настройки, обложка — шаблон и слои (только фото этой книги). */
function patchOf(target: DesignTarget, state: PagesState | CoverState, own: Set<string>) {
  if (target === "pages") {
    const s = state as PagesState;
    return { interior: s.interior, interiorStyle: s.style };
  }
  const s = state as CoverState;
  const design: CoverDesign = { ...s.design, layers: s.design.layers.map((l) => (l.kind === "image" && l.photoId && !own.has(l.photoId) ? { ...l, photoId: null } : l)) };
  return { coverTemplate: s.template, coverDesign: design };
}

/**
 * Просьба к ИИ-дизайнеру: правка, три варианта или оценка — для страниц или обложки. Состояние — из редактора (ещё не
 * обязательно сохранено); ответ — готовое оформление (или варианты, или советы с оформлением), которое редактор
 * применяет с отменой и сохраняет сам. Любой режим — один запрос. Лимит: 5 бесплатных на клиента, дальше — купленные;
 * без них — 402 designAiLimit, и редактор предлагает пакеты.
 */
export const POST = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = idParams(await params, "id");
  const { user, book } = await apiBook(req, id, { editable: true });
  const input = body.parse(await req.json());
  if (input.mode === "edit" && input.prompt.length < 2) throw new HttpError(400, "badRequest");
  // «Придумать» и «3 варианта» — Opus, рисунки и оценка — Sonnet, мелкие правки — Haiku.
  const tier = designTier(input.mode, input.prompt);
  const designer = tier === "max" ? container().assistant.designerMax : tier === "pro" ? container().assistant.designerPro : container().assistant.designer;
  if (!(await designer.configured())) throw new HttpError(503, "designAiOff");
  // Защита от очереди кликов: не чаще раза в 5 секунд (лимит считается отдельно).
  if (!(await rateLimit(`design-ai:${user.id}`, 1, 5_000))) throw new HttpError(429, "writeAiRate");

  const format = getFormat(book.format);
  const [ui, m] = await Promise.all([getLocale(), getMessages()]);
  const allPhotos = await container().authoring.queries.photos(book.id);
  const ordered = [...allPhotos.filter((p) => p.id === book.coverPhotoId), ...allPhotos.filter((p) => p.id !== book.coverPhotoId)];
  const photos = ordered.map((p) => ({ id: p.id, width: p.width, height: p.height }));
  const own = new Set(photos.map((p) => p.id));
  const texts = { title: book.title, subtitle: book.subtitle ?? "", names: coverNames(book) };

  let state: PagesState | CoverState;
  let other: string;
  if (input.target === "pages") {
    state = { interior: isInteriorId(input.state.interior) ? input.state.interior : getInteriorDesign(book.interior).id, style: parseInteriorStyle(input.state.style) };
    const savedCover = parseCoverDesign(book.coverDesign);
    other = savedCover ? describeCover({ template: book.coverTemplate, design: savedCover }) : describeTemplate(book.coverTemplate, getCoverTemplate(book.coverTemplate).mood);
  } else {
    const design = parseCoverDesign(input.state.design);
    if (!design) throw new HttpError(400, "badRequest");
    state = { template: isKnownCover(input.state.template) ? input.state.template : book.coverTemplate, design };
    other = describePages({ interior: getInteriorDesign(book.interior).id, style: parseInteriorStyle(book.interiorStyle) });
  }
  const occasion = book.occasion ? ((m.common.occasions as Record<string, { label: string } | undefined>)[book.occasion]?.label ?? book.occasion) : null;
  const ctx: DesignBookContext = {
    title: book.title,
    kind: bookKind(book.theme),
    theme: book.theme,
    occasion,
    recipient: book.recipientName || undefined,
    author: book.authorName || undefined,
    language: book.language,
    format,
    ui,
    chapters: input.target === "pages" ? input.chapters : undefined,
    photos: input.target === "cover" ? photos : undefined,
    palette: await photoPalette(ordered),
    other,
    texts,
  };

  const reserved = await reserveDesignAi({ userId: user.id, bookId: book.id, target: input.target, prompt: input.prompt || `(${input.mode})` });
  // Лимит и купленные кончились — редактор сам покажет пакеты (GET).
  if (!reserved) throw new HttpError(402, "designAiLimit");

  const ask: Ask = async (r) => {
    const res = await designer.ask(r);
    return { text: res.text, usage: { inputTokens: res.usage.input, outputTokens: res.usage.output, cacheReadTokens: res.usage.cacheRead, cacheWriteTokens: res.usage.cacheWrite } };
  };
  // Осмотр глазами (не для мелких правок и не для оценки): оформление рисуется той же вёрсткой, что идёт в печать
  // (обложка или лист первых страниц), и модель правит недостатки, которые видно только на картинке. Нет растра
  // или вёрстка не вышла — осмотра нет.
  let bundle: ReturnType<ReturnType<typeof container>["authoring"]["queries"]["bundle"]> | null = null;
  const preview =
    tier !== "fast" && input.mode !== "review"
      ? async (s: PagesState | CoverState) => {
          bundle ??= container().authoring.queries.bundle(book.id);
          const b = await bundle;
          if (!b) return null;
          if (input.target === "cover") {
            const cs = s as CoverState;
            return renderCoverPreview({ ...b, book: { ...b.book, coverTemplate: cs.template, coverDesign: cs.design as unknown as Record<string, unknown> } } as Parameters<typeof renderCoverPreview>[0]);
          }
          const ps = s as PagesState;
          return renderPagesPreview({ ...b, book: { ...b.book, interior: ps.interior, interiorStyle: ps.style } } as Parameters<typeof renderPagesPreview>[0]);
        }
      : undefined;
  const run: DesignAiInput<DesignTarget> = { target: input.target, mode: input.mode === "create" ? "create" : "edit", request: input.prompt, state, book: ctx, history: input.history, layout: { texts, photos }, preview };
  try {
    const done = async (log: { reply: string; ops: unknown[]; errors: string[]; usage: Record<string, number> }, payload: Record<string, unknown>) => {
      await completeDesignAi(reserved.id, log);
      return NextResponse.json({ mode: input.mode, ...payload, allowance: await designAiAllowance(user.id), source: reserved.source });
    };
    if (input.mode === "variants") {
      const res = await runDesignVariants(ask, run);
      return done(
        { reply: res.reply, ops: res.variants.map((v) => ({ name: v.name, ops: v.ops })), errors: res.variants.flatMap((v) => v.errors), usage: res.usage },
        { reply: res.reply, variants: res.variants.map((v) => ({ name: v.name, idea: v.idea, patch: patchOf(input.target, v.state, own) })) },
      );
    }
    if (input.mode === "review") {
      const res = await runDesignReview(ask, run);
      return done(
        { reply: `${res.score}/10 ${res.summary}`, ops: res.tips.map((t) => ({ title: t.title, ops: t.ops })), errors: [], usage: res.usage },
        { score: res.score, summary: res.summary, strengths: res.strengths, tips: res.tips.map((t) => ({ title: t.title, why: t.why, ops: t.state ? t.ops : [], patch: t.state ? patchOf(input.target, t.state, own) : null })) },
      );
    }
    const res = await runDesignAi(ask, run);
    return done({ reply: res.reply, ops: res.ops, errors: res.errors, usage: res.usage }, { reply: res.reply, concept: res.concept, changed: res.changed, patch: patchOf(input.target, res.state, own) });
  } catch (err) {
    await failDesignAi(reserved.id, err instanceof Error ? err.message : String(err));
    if (err instanceof HttpError) throw err;
    if (!AssistantError.is(err)) throw err;
    console.error("[design-ai]", err.message);
    throw new HttpError(err.code === "notConfigured" ? 503 : 502, err.code === "notConfigured" ? "designAiOff" : "designAiBusy");
  }
});
