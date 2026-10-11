import { NextResponse } from "next/server";
import { z } from "zod";
import { api, apiBook, HttpError } from "@/server/api";
import { rateLimit } from "@/server/rateLimit";
import { container } from "@/server/container";
import { AssistantError } from "@/modules/assistant";
import { isLocale } from "@/i18n/config";

export const maxDuration = 120;

const schema = z.object({ text: z.string().min(1).max(20_000), ui: z.string().optional() });

/**
 * AI-корректор: запятые, грамматика, опечатки в ответе. Модель — из «Интеграций» → «Проверка текста».
 * Лимиты на пользователя: у бесплатных моделей общий дневной лимит запросов.
 */
export const POST = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const { user, book } = await apiBook(req, id);
  const { text, ui } = schema.parse(await req.json());
  const proofreader = container().assistant.proofreader;
  if (!(await proofreader.configured())) throw new HttpError(503, "proofreadOff");
  if (!(await rateLimit(`proofread:${user.id}`, 10, 600_000)) || !(await rateLimit(`proofread-day:${user.id}`, 80, 86_400_000))) throw new HttpError(429, "proofreadRate");
  try {
    const issues = await proofreader.check(text, book.language, isLocale(ui) ? ui : book.language);
    return NextResponse.json({ issues });
  } catch (err) {
    if (!AssistantError.is(err)) throw err;
    console.error("[proofread]", err.message);
    throw new HttpError(err.code === "notConfigured" ? 503 : 502, err.code === "notConfigured" ? "proofreadOff" : "proofreadBusy");
  }
});
