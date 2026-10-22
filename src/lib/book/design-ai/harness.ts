/**
 * Harness ИИ-дизайнера для Claude Haiku: запрос → ответ JSON → операции применяются к оформлению → проверки → при
 * замечаниях один круг исправления (модели показывают, что не применилось и почему, и она отвечает заново по тому же
 * исходному оформлению). Сеть — только через ask (порт LanguageModel), поэтому логику проверяют тесты с подставной
 * моделью, а прогон на настоящей — scripts/design-ai-eval.ts.
 */
import type { BookFormat } from "../formats";
import { applyCoverOps, applyPagesOps, changed, DESIGN_OPS, designAiSchema, MAX_OPS, type CoverState, type DesignOp, type DesignTarget, type PagesState } from "./ops";
import { systemPrompt, userPrompt, type DesignBookContext } from "./prompts";

/** Модель Claude для дизайнера — Haiku: быстрый и дешёвый, а проверки и исправление держат качество. */
export const DESIGN_AI_MODEL = "claude-haiku-5-5";

/** Сколько раз спрашиваем модель за одну просьбу клиента: ответ и одно исправление. */
export const MAX_ATTEMPTS = 2;

export interface AskResult {
  text: string;
  usage?: { inputTokens?: number; outputTokens?: number; cacheReadTokens?: number; cacheWriteTokens?: number };
}

export type Ask = (req: { system: string; user: string; effort: "low" | "medium"; schema: Record<string, unknown>; cachePrefix: string }) => Promise<AskResult>;

export type DesignState<T extends DesignTarget> = T extends "pages" ? PagesState : CoverState;

export interface DesignAiResult<T extends DesignTarget> {
  reply: string;
  state: DesignState<T>;
  ops: DesignOp[];
  /** Что так и не применилось (после исправления) — для журнала и честного ответа. */
  errors: string[];
  changed: boolean;
  attempts: number;
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number };
}

function parseAnswer(text: string): { reply: string; ops: DesignOp[] } | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      raw = JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
  if (!raw || typeof raw !== "object") return null;
  const o = raw as { reply?: unknown; ops?: unknown };
  const ops = Array.isArray(o.ops)
    ? o.ops
        .filter((x): x is DesignOp => !!x && typeof x === "object" && (DESIGN_OPS as readonly string[]).includes((x as DesignOp).op))
        .map((x) => ({ op: x.op, path: String(x.path ?? ""), value: typeof x.value === "string" ? x.value : JSON.stringify(x.value ?? "") }))
        .slice(0, MAX_OPS)
    : [];
  return { reply: typeof o.reply === "string" ? o.reply.trim().slice(0, 600) : "", ops };
}

/**
 * Просьба клиента → новое оформление. state — текущее (из редактора, ещё не обязательно сохранённое), request — текст
 * клиента. Ничего не сохраняет: результат применяет редактор (с отменой), он же сохраняет.
 */
export async function runDesignAi<T extends DesignTarget>(ask: Ask, input: { target: T; request: string; state: DesignState<T>; book: DesignBookContext }): Promise<DesignAiResult<T>> {
  const system = systemPrompt(input.target);
  const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  const apply = (ops: DesignOp[]) =>
    input.target === "pages" ? applyPagesOps(input.state as PagesState, ops) : applyCoverOps(input.state as CoverState, ops, input.book.format as BookFormat);
  let retry: { ops: unknown; errors: string[] } | undefined;
  let last: { reply: string; ops: DesignOp[]; state: DesignState<T>; errors: string[] } | null = null;
  let attempts = 0;
  while (attempts < MAX_ATTEMPTS) {
    attempts++;
    const res = await ask({ system, user: userPrompt(input.target, input.book, input.state, input.request, retry), effort: "medium", schema: designAiSchema as unknown as Record<string, unknown>, cachePrefix: system });
    usage.inputTokens += res.usage?.inputTokens ?? 0;
    usage.outputTokens += res.usage?.outputTokens ?? 0;
    usage.cacheReadTokens += res.usage?.cacheReadTokens ?? 0;
    usage.cacheWriteTokens += res.usage?.cacheWriteTokens ?? 0;
    const answer = parseAnswer(res.text);
    if (!answer) {
      retry = { ops: [], errors: ["ответ не JSON по схеме"] };
      continue;
    }
    const applied = apply(answer.ops);
    last = { reply: answer.reply, ops: answer.ops, state: applied.state as DesignState<T>, errors: applied.errors };
    if (!applied.errors.length) break;
    retry = { ops: answer.ops, errors: applied.errors };
  }
  if (!last) return { reply: "", state: input.state, ops: [], errors: retry?.errors ?? ["нет ответа"], changed: false, attempts, usage };
  return { ...last, changed: changed(last.state, input.state), attempts, usage };
}
