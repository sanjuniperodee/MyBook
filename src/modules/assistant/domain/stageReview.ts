/**
 * Разбор этапа сделки по свежей переписке («ИИ ведёт этапы»): где сделка на самом деле, почему, дословная цитата и номер
 * сообщения, откуда она; выдал ли магазин заказ. Решает, менять ли этап, не модель, а правило aiStageDecision.
 */
import { transcriptLine, type AiMessage } from "./prompts";

/** Этап воронки для модели: номер в списке, название и что он значит (по роли этапа, а не по названию). */
export interface ReviewStage {
  n: number;
  name: string;
  about: string;
}

export interface StageReview {
  /** Номер этапа из списка; null — оставить как есть. */
  stage: number | null;
  confidence: number;
  reason: string;
  quote: string;
  /** Номер сообщения переписки с цитатой. */
  message: number | null;
  lostReason: string | null;
  /** Клиент получил заказ (книгу на руки) — цитата и номер сообщения. */
  delivered: { quote: string; message: number | null } | null;
  /** Кто из сотрудников ведёт переписку от магазина (номер из списка), с цитатой, где он назван. */
  manager: { n: number; quote: string; message: number | null } | null;
}

/** Переписка с номерами сообщений [n] — модель ссылается на номер, а сервер проверяет цитату в этом сообщении. */
export function numberedTranscript(messages: AiMessage[]): string {
  return messages
    .map((m, i) => {
      const line = transcriptLine(m);
      return line ? `[${i + 1}] ${line}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

export function stageReviewPrompt(stages: ReviewStage[], current: string, reasons: string[], today: string, order: string | null, staff: string[] = []): string {
  return [
    `Ты ведёшь воронку продаж магазина персональных книг MyBooks (Казахстан). Сегодня ${today}. Менеджеры забывают двигать сделки — по переписке определи, на каком этапе сделка на самом деле.`,
    `Этапы воронки по порядку:\n${stages.map((s) => `${s.n}. «${s.name}» — ${s.about}`).join("\n")}`,
    `Сейчас сделка на этапе «${current}».`,
    order ? `По сделке оформлен заказ: ${order}.` : "",
    "Отвечай только JSON по схеме.",
    "stage — номер этапа, где сделка должна быть сейчас; 0 — если текущий этап верный или по переписке не понять. Опирайся только на то, что прямо сказано в переписке; не меняй этап по догадке.",
    "Клиент сказал «подумаю», «посоветуюсь», «напишу позже» — это не отказ. Отказ — только если клиент ясно отказался.",
    `lost_reason — только для этапа отказа, строго одно из: ${reasons.map((r) => `«${r}»`).join(", ")}. Иначе пустая строка.`,
    "confidence — насколько ты уверен, от 0 до 1. reason — коротко по-русски для менеджера, почему (до 120 знаков), обычными словами: без названий полей ответа и без рассуждений о схеме.",
    "quote — дословная цитата из одного сообщения переписки (как написано, без пересказа, до 200 знаков), на которой основан вывод; message — номер этого сообщения в квадратных скобках. Без смены этапа — пустая строка и 0.",
    "delivered — true, только если по переписке клиент уже получил книгу на руки (забрал, доставили, «получила»); delivered_quote и delivered_message — цитата и номер сообщения. Иначе false, пустая строка и 0.",
    staff.length
      ? `С телефона магазина пишут разные сотрудники: ${staff.map((n, i) => `${i + 1}. ${n}`).join("; ")}. manager — номер сотрудника, который ведёт эту переписку сейчас, только если в переписке он прямо назван по имени: представился («меня зовут …», «менеджер …», подпись) или клиент обратился к нему по имени. manager_quote — дословная цитата с этим именем, manager_message — номер сообщения. Имени из списка в переписке нет — 0, пустая строка и 0; не угадывай по стилю.`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export const stageReviewSchema = (reasons: string[]) => ({
  type: "object",
  properties: {
    stage: { type: "integer" },
    confidence: { type: "number" },
    reason: { type: "string" },
    quote: { type: "string" },
    message: { type: "integer" },
    lost_reason: { type: "string", enum: [...reasons, ""] },
    delivered: { type: "boolean" },
    delivered_quote: { type: "string" },
    delivered_message: { type: "integer" },
    manager: { type: "integer" },
    manager_quote: { type: "string" },
    manager_message: { type: "integer" },
  },
  required: ["stage", "confidence", "reason", "quote", "message", "lost_reason", "delivered", "delivered_quote", "delivered_message", "manager", "manager_quote", "manager_message"],
  additionalProperties: false,
});

const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const int = (v: unknown, max: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 1 && n <= max ? n : null;
};

/** Служебные слова ответа модели (названия полей), которые не должны попасть в ленту сделки. */
const SCHEMA_WORDS = /\b(?:lost_reason|delivered(?:_quote|_message)?|manager(?:_quote|_message)?|quote|message|stage|confidence)\b/i;

/** Причина для ленты: без частей, где модель рассуждает о полях ответа («поэтому lost_reason пустой»). */
export function cleanReason(reason: string): string {
  // Части — по «;» и по концу предложения перед заглавной (точка в «26.11» не делит; знак остаётся у своей части).
  const parts = reason
    .replace(/([.!?])\s+(?=[А-ЯЁA-Z«"])/g, "$1\n")
    .split(/\n|;\s*/)
    .map((p) => p.trim())
    .filter((p) => p && !SCHEMA_WORDS.test(p));
  return parts.join(" ").replace(/[;,\s]+$/, "").trim();
}

/** Ответ модели → разбор: номер этапа и сообщения — в пределах списков, причина отказа — из списка, уверенность 0–1. */
export function normalizeStageReview(raw: unknown, stageCount: number, messageCount: number, reasons: string[], staffCount = 0): StageReview | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const c = Number(r.confidence);
  const named = reasons.find((x) => x === text(r.lost_reason, 80)) ?? null;
  const deliveredQuote = text(r.delivered_quote, 300);
  return {
    stage: int(r.stage, stageCount),
    confidence: Number.isFinite(c) ? Math.min(1, Math.max(0, c)) : 0,
    reason: cleanReason(text(r.reason, 200).replace(/["']?\s*}+$/, "")),
    quote: text(r.quote, 300),
    message: int(r.message, messageCount),
    lostReason: named,
    delivered: r.delivered === true && deliveredQuote ? { quote: deliveredQuote, message: int(r.delivered_message, messageCount) } : null,
    manager: managerOf(r, staffCount, messageCount),
  };
}

function managerOf(r: Record<string, unknown>, staffCount: number, messageCount: number): StageReview["manager"] {
  const n = int(r.manager, staffCount);
  const quote = text(r.manager_quote, 300);
  return n && quote ? { n, quote, message: int(r.manager_message, messageCount) } : null;
}
