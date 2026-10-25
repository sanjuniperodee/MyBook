import { NextResponse } from "next/server";
import { z } from "zod";
import { api, apiBook, HttpError } from "@/server/api";
import { rateLimit } from "@/server/rateLimit";
import { clientAiLimits } from "@/server/clientAiLimits";
import { container } from "@/server/container";
import { AssistantError, rewriteModes } from "@/modules/assistant";
import { bookKind } from "@/lib/content/kinds";
import { idParams } from "@/server/input";

export const maxDuration = 120;

const schema = z
  .object({ text: z.string().trim().min(1).max(12_000), mode: z.enum(rewriteModes), prompt: z.string().trim().max(500).optional() })
  .refine((v) => v.mode !== "custom" || !!v.prompt, { path: ["prompt"] });

/**
 * AI-помощник при письме: оформить, улучшить, сделать больше или короче, переписать по просьбе автора.
 * Свои провайдер, модель, флажок и лимиты — «Интеграции» → AI → «AI-помощник при письме у клиента» (пока там пусто — как у
 * корректора).
 */
export const POST = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = idParams(await params, "id");
  const { user, book } = await apiBook(req, id);
  const { text, mode, prompt } = schema.parse(await req.json());
  const writer = container().assistant.writer;
  if (!(await writer.configured())) throw new HttpError(503, "writeAiOff");
  const limits = (await clientAiLimits()).writer;
  if (!(await rateLimit(`write-ai:${user.id}`, limits.perTenMin, 600_000)) || !(await rateLimit(`write-ai-day:${user.id}`, limits.perDay, 86_400_000))) throw new HttpError(429, "writeAiRate");
  try {
    const result = await writer.rewrite(text, mode, book.language, { kind: bookKind(book.theme), instruction: prompt });
    return NextResponse.json({ text: result });
  } catch (err) {
    if (!AssistantError.is(err)) throw err;
    console.error("[write-ai]", err.message);
    throw new HttpError(err.code === "notConfigured" ? 503 : 502, err.code === "notConfigured" ? "writeAiOff" : "proofreadBusy");
  }
});
