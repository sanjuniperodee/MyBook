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
  /** Обещания с ответственным и сроком: клиент — прислать, решить; менеджер — перезвонить, отправить. */
  promises: { who: "client" | "manager"; what: string; due: string | null; quote: string; message: number | null }[];
  /** Открытые задачи (номер из списка), которые по переписке уже сделаны, — с цитатой. */
  done: { task: number; quote: string; message: number | null }[];
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

/** Открытая задача сделки для модели: номер в списке, что сделать и срок. */
export interface ReviewTask {
  n: number;
  title: string;
  due: string | null;
}

export function stageReviewPrompt(stages: ReviewStage[], current: string, reasons: string[], today: string, order: string | null, staff: string[] = [], tasks: ReviewTask[] | null = null): string {
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
    tasks
      ? [
          "promises — обещания со сроком или явным «завтра / после зарплаты / в пятницу», которые прозвучали в переписке: who — client (клиент обещал: прислать фото, тексты, ответить, оплатить) или manager (менеджер обещал: перезвонить, отправить макет, рассчитать доставку). what — что сделать, коротко по-русски (до 80 знаков); due — дата ГГГГ-ММ-ДД (дату без года — ближайшую будущую; «завтра» — от даты сообщения), без срока — пустая строка; quote и message — дословная цитата и номер сообщения. Вежливость без дела («буду ждать», «на связи») — не обещание. Нет — пустой список.",
          tasks.length ? `Открытые задачи по сделке:\n${tasks.map((t) => `${t.n}. ${t.title}${t.due ? ` (срок ${t.due})` : ""}`).join("\n")}` : "Открытых задач по сделке нет.",
          "done — задачи из этого списка, которые по переписке уже выполнены (менеджер перезвонил или написал то, что нужно, клиент прислал обещанное): task — номер задачи, quote и message — дословная цитата, которая это показывает, и номер сообщения. Не уверен — не включай. Нет — пустой список.",
        ].join("\n\n")
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
    promises: {
      type: "array",
      items: {
        type: "object",
        properties: { who: { type: "string", enum: ["client", "manager"] }, what: { type: "string" }, due: { type: "string" }, quote: { type: "string" }, message: { type: "integer" } },
        required: ["who", "what", "due", "quote", "message"],
        additionalProperties: false,
      },
    },
    done: {
      type: "array",
      items: { type: "object", properties: { task: { type: "integer" }, quote: { type: "string" }, message: { type: "integer" } }, required: ["task", "quote", "message"], additionalProperties: false },
    },
  },
  required: ["stage", "confidence", "reason", "quote", "message", "lost_reason", "delivered", "delivered_quote", "delivered_message", "manager", "manager_quote", "manager_message", "promises", "done"],
  additionalProperties: false,
});

const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const int = (v: unknown, max: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 1 && n <= max ? n : null;
};

/** Служебные слова ответа модели (названия полей), которые не должны попасть в ленту сделки. */
const SCHEMA_WORDS = /\b(?:lost_reason|delivered(?:_quote|_message)?|manager(?:_quote|_message)?|promises|done|quote|message|stage|confidence)\b/i;

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
export function normalizeStageReview(raw: unknown, stageCount: number, messageCount: number, reasons: string[], staffCount = 0, taskCount = 0): StageReview | null {
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
    promises: (Array.isArray(r.promises) ? r.promises : [])
      .slice(0, 5)
      .map((x: Record<string, unknown>) => ({
        who: x?.who === "client" ? ("client" as const) : ("manager" as const),
        what: text(x?.what, 120),
        due: typeof x?.due === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x.due) && !Number.isNaN(Date.parse(x.due)) ? x.due : null,
        quote: text(x?.quote, 300),
        message: int(x?.message, messageCount),
      }))
      .filter((x) => x.what && x.quote),
    done: (Array.isArray(r.done) ? r.done : [])
      .slice(0, 10)
      .map((x: Record<string, unknown>) => ({ task: int(x?.task, taskCount), quote: text(x?.quote, 300), message: int(x?.message, messageCount) }))
      .filter((x): x is { task: number; quote: string; message: number | null } => !!x.task && !!x.quote),
  };
}

function managerOf(r: Record<string, unknown>, staffCount: number, messageCount: number): StageReview["manager"] {
  const n = int(r.manager, staffCount);
  const quote = text(r.manager_quote, 300);
  return n && quote ? { n, quote, message: int(r.manager_message, messageCount) } : null;
}
