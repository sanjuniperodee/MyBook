import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { bookQuestions, books, crmCalls, crmConversations, crmDeals, crmNotes, crmStages, crmTasks, orders } from "../db/schema";
import { booksId } from "../db/refs";
import { getSetting } from "./settings";
import { loadChatMessages } from "./chat-view";
import { listFields, fieldVars } from "./fields";
import { dealSourceLabels } from "@/lib/crm/deal-meta";
import {
  cleanReply,
  extractableFields,
  extractSchema,
  extractSystemPrompt,
  normalizeExtracted,
  parseSummary,
  replySystemPrompt,
  summarySchema,
  summarySystemPrompt,
  transcript,
  type AiField,
  type AiMessage,
  type AiSummary,
} from "./ai-logic";

/** Модель AI-помощника. */
export const AI_MODEL = "claude-opus-5-5";

/** Ошибка, текст которой можно показать менеджеру. */
export class AiError extends Error {}

export async function aiConfigured() {
  const [key, enabled] = await Promise.all([getSetting("ai.apiKey"), getSetting("ai.enabled")]);
  return !!key && enabled !== "off";
}

let cached: { sig: string; client: Anthropic } | null = null;

async function client() {
  const [apiKey, baseURL, enabled] = await Promise.all([getSetting("ai.apiKey"), getSetting("ai.baseUrl"), getSetting("ai.enabled")]);
  if (!apiKey || enabled === "off") throw new AiError("AI-помощник не подключён — добавьте ключ Claude API в разделе «Интеграции».");
  const sig = `${apiKey}|${baseURL}`;
  if (cached?.sig !== sig) cached = { sig, client: new Anthropic({ apiKey, baseURL: baseURL || "https://api.anthropic.com", maxRetries: 2, timeout: 90_000 }) };
  return cached.client;
}

interface AskOptions {
  system: string;
  user: string;
  effort: "low" | "medium";
  schema?: Record<string, unknown>;
}

/**
 * Один запрос к Claude. Если основная модель откажется отвечать по соображениям безопасности,
 * сервер Anthropic сам повторит запрос на рекомендованной резервной модели (fallbacks: "default").
 */
async function ask({ system, user, effort, schema }: AskOptions): Promise<{ text: string; usage: { input: number; output: number } }> {
  const anthropic = await client();
  let res;
  try {
    res = await anthropic.beta.messages.create({
      model: AI_MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: schema ? { effort, format: { type: "json_schema", schema } } : { effort },
      system,
      messages: [{ role: "user", content: user }],
    });
  } catch (err) {
    throw toAiError(err);
  }
  if (res.stop_reason === "refusal") throw new AiError("Claude отказался отвечать на этот запрос. Попробуйте переформулировать или ответьте вручную.");
  const text = res.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("")
    .trim();
  if (!text) throw new AiError("Claude вернул пустой ответ — попробуйте ещё раз.");
  return { text, usage: { input: res.usage.input_tokens, output: res.usage.output_tokens } };
}

function toAiError(err: unknown): Error {
  if (err instanceof AiError) return err;
  if (err instanceof Anthropic.AuthenticationError) return new AiError("Ключ Claude API неверный или отозван — проверьте его в «Интеграциях».");
  if (err instanceof Anthropic.PermissionDeniedError) return new AiError("У ключа Claude API нет доступа к модели.");
  if (err instanceof Anthropic.RateLimitError) return new AiError("Слишком много запросов к Claude — попробуйте через минуту.");
  if (err instanceof Anthropic.APIConnectionError) return new AiError("Нет связи с Claude API. Попробуйте позже.");
  if (err instanceof Anthropic.BadRequestError) {
    console.error("[ai] bad request", err.message);
    return new AiError("Claude API отклонил запрос. Подробности — в логах сервера.");
  }
  if (err instanceof Anthropic.APIError) {
    console.error("[ai]", err.status, err.message);
    return new AiError(`Claude API временно недоступен (${err.status ?? "ошибка"}). Попробуйте позже.`);
  }
  console.error("[ai]", err);
  return new AiError("Не удалось получить ответ AI-помощника.");
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        /* ниже — ошибка */
      }
    }
    throw new AiError("Claude вернул ответ в неожиданном формате — попробуйте ещё раз.");
  }
}

const toAi = (m: Awaited<ReturnType<typeof loadChatMessages>>[number]): AiMessage => ({ direction: m.direction, text: m.text || (m.mediaUrl ? `[${m.type}]` : ""), internal: m.internal, author: m.author, at: m.at });

/** Вариант ответа клиенту на последнее сообщение диалога. */
export async function suggestReply(conversationId: string, managerName: string) {
  const messages = (await loadChatMessages(conversationId, 60)).map(toAi);
  if (!messages.some((m) => m.direction === "in" && !m.internal)) throw new AiError("Клиент ещё ничего не написал — подсказывать нечего.");
  const knowledge = await getSetting("ai.knowledge");
  const { text, usage } = await ask({
    system: replySystemPrompt(knowledge, managerName),
    user: `Переписка:\n${transcript(messages)}\n\nНапиши ответ клиенту.`,
    effort: "low",
  });
  return { text: cleanReply(text), usage };
}

/** Всё, что известно о сделке, одним текстом — для резюме. */
async function dealDossier(dealId: string) {
  const deal = await db.query.crmDeals.findFirst({ where: eq(crmDeals.id, dealId) });
  if (!deal) throw new AiError("Сделка не найдена");
  const [stage, fields, notes, tasks, calls, conv, order, bookRows] = await Promise.all([
    db.query.crmStages.findFirst({ where: eq(crmStages.id, deal.stageId), columns: { name: true } }),
    listFields("deal"),
    db.select({ kind: crmNotes.kind, text: crmNotes.text, at: crmNotes.createdAt }).from(crmNotes).where(eq(crmNotes.dealId, deal.id)).orderBy(desc(crmNotes.createdAt)).limit(30),
    db.select({ title: crmTasks.title, dueAt: crmTasks.dueAt }).from(crmTasks).where(and(eq(crmTasks.dealId, deal.id), isNull(crmTasks.doneAt))).limit(10),
    db.select({ direction: crmCalls.direction, status: crmCalls.status, durationSec: crmCalls.durationSec, at: crmCalls.startedAt }).from(crmCalls).where(eq(crmCalls.dealId, deal.id)).orderBy(desc(crmCalls.startedAt)).limit(10),
    db.query.crmConversations.findFirst({ where: eq(crmConversations.dealId, deal.id), orderBy: desc(crmConversations.lastMessageAt), columns: { id: true, channel: true } }),
    deal.orderId ? db.query.orders.findFirst({ where: eq(orders.id, deal.orderId), columns: { number: true, status: true, amount: true, plan: true } }) : null,
    deal.clientId
      ? db
          .select({
            title: books.title,
            recipient: books.recipientName,
            status: books.status,
            answered: sql<number>`(select count(*)::int from ${bookQuestions} q where q.book_id = ${booksId} and length(trim(q.answer)) > 0)`,
            total: sql<number>`(select count(*)::int from ${bookQuestions} q where q.book_id = ${booksId})`,
          })
          .from(books)
          .where(eq(books.userId, deal.clientId))
          .orderBy(desc(books.updatedAt))
          .limit(2)
      : Promise.resolve([]),
  ]);
  const messages = conv ? (await loadChatMessages(conv.id, 80)).map(toAi) : [];
  const vars = fieldVars(fields, deal.customFields);
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const lines = [
    `Сделка №${deal.number}: ${deal.title}`,
    `Этап: ${stage?.name ?? "—"}. Источник: ${dealSourceLabels[deal.source] ?? deal.source}. Создана ${day(deal.createdAt)}, этап сменился ${day(deal.stageChangedAt)}.`,
    deal.amount ? `Сумма: ${deal.amount} ₸.` : "",
    deal.contactName ? `Контакт: ${deal.contactName}.` : "",
    Object.keys(vars).length ? `Поля: ${Object.entries(vars).map(([k, v]) => `${k}: ${v}`).join("; ")}.` : "",
    ...bookRows.map((b) => `Книга на сайте «${b.title || "без названия"}»${b.recipient ? ` для ${b.recipient}` : ""}: ${b.status === "draft" ? "пишется" : "заказана"}, ответов ${b.answered} из ${b.total}.`),
    order ? `Заказ №${order.number}: ${order.status}, ${order.amount} ₸, тариф ${order.plan}.` : "Заказа пока нет.",
    tasks.length ? `Открытые задачи: ${tasks.map((t) => `${t.title}${t.dueAt ? ` (до ${day(t.dueAt)})` : ""}`).join("; ")}.` : "Открытых задач нет.",
    calls.length ? `Звонки: ${calls.map((c) => `${day(c.at)} ${c.direction === "out" ? "исходящий" : c.status === "missed" ? "пропущенный" : "входящий"}${c.durationSec ? ` ${Math.round(c.durationSec / 60)} мин` : ""}`).join("; ")}.` : "",
    notes.length ? `Заметки и события (новые сверху):\n${notes.map((n) => `- ${day(n.at)} ${n.text.replace(/\s+/g, " ").slice(0, 300)}`).join("\n")}` : "",
    messages.length ? `Переписка:\n${transcript(messages, 10_000)}` : "Переписки нет.",
  ];
  return { deal, fields, messages, notes, text: lines.filter(Boolean).join("\n") };
}

/** Резюме сделки и рекомендованный следующий шаг; сохраняется в карточке. */
export async function summarizeDeal(dealId: string): Promise<{ summary: AiSummary; usage: { input: number; output: number } }> {
  const dossier = await dealDossier(dealId);
  const knowledge = await getSetting("ai.knowledge");
  const { text, usage } = await ask({ system: summarySystemPrompt(knowledge), user: `${dossier.text}\n\nСегодня ${new Date().toISOString().slice(0, 10)}.`, effort: "medium", schema: summarySchema });
  const summary = parseSummary(parseJson(text));
  if (!summary) throw new AiError("Не удалось разобрать резюме — попробуйте ещё раз.");
  await db
    .update(crmDeals)
    .set({ aiSummary: { ...summary, at: new Date().toISOString() } })
    .where(eq(crmDeals.id, dealId));
  return { summary, usage };
}

/** Значения своих полей сделки, найденные в переписке и заметках (только предложение — применяет менеджер). */
export async function extractDealFields(dealId: string) {
  const dossier = await dealDossier(dealId);
  const fields: AiField[] = dossier.fields.map((f) => ({ key: f.key, label: f.label, type: f.type, options: f.options }));
  if (!extractableFields(fields).length) throw new AiError("У сделок нет своих полей для заполнения.");
  const source = [
    dossier.messages.length ? transcript(dossier.messages, 10_000) : "",
    dossier.notes.filter((n) => n.kind === "note" || n.kind === "call").map((n) => `Заметка менеджера: ${n.text}`).join("\n"),
  ]
    .filter(Boolean)
    .join("\n\n");
  if (!source) throw new AiError("Нет переписки и заметок, из которых можно взять данные.");
  const today = new Date().toISOString().slice(0, 10);
  const { text, usage } = await ask({ system: extractSystemPrompt(fields, today), user: source, effort: "low", schema: extractSchema(fields) });
  const values = normalizeExtracted(fields, parseJson(text));
  const current = dossier.deal.customFields ?? {};
  const proposals = Object.entries(values)
    .filter(([k, v]) => String(current[k] ?? "") !== String(v))
    .map(([key, value]) => {
      const f = fields.find((x) => x.key === key)!;
      return { key, label: f.label, type: f.type, value, current: current[key] === undefined || current[key] === null ? null : String(current[key]) };
    });
  return { proposals, usage };
}

/** Проверка ключа из «Интеграций»: короткий запрос к модели. */
export async function testAi() {
  const { text } = await ask({ system: "Ты проверяешь подключение. Ответь одним словом.", user: "Скажи: готово", effort: "low" });
  return text.slice(0, 60);
}
