import "server-only";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { crmBotEvents, crmConversations, crmMessages } from "@/shared/infrastructure/db/schema";
import { executor } from "@/shared/infrastructure/database";
import type { BotCoachSource } from "../application";
import { readBotState, readSellerAi, withMediaText, type CoachConversation, type HistoryMessage } from "../domain";

/** Сколько последних сообщений беседы уходит в разбор. */
const MESSAGES_PER_CONVERSATION = 40;

const mediaStub = (type: string) => `[${type === "audio" ? "голосовое сообщение" : type === "image" ? "фото" : type === "document" ? "файл" : type === "video" ? "видео" : type}]`;

/** События журнала бота, которые говорят об ошибке: заблокированный ответ, петля, сбой модели, молчание на вопрос. */
function flagOf(kind: string, reason: string | null): string | null {
  const r = reason ?? "";
  if (kind === "blocked" && r.startsWith("ai_reply")) return "ответ заблокирован проверкой";
  if (kind === "blocked" && r.startsWith("ai_error")) return "сбой модели";
  if (kind === "handoff" && r === "loop") return "повтор (петля)";
  if (kind === "handoff" && r === "unanswered") return "промолчал на вопрос";
  if (kind === "handoff" && r === "limit") return "потолок беседы";
  if (kind === "objection") return "возражение";
  if (kind === "stopped_by_manager") return "менеджер вмешался";
  return null;
}

/** Беседы, где бот писал клиенту начиная с since: новые сверху, итог по состоянию бота, флаги журнала, переписка. */
export const drizzleCoachSource: BotCoachSource = {
  async recent(since, limit) {
    const db = executor();
    const convs = await db
      .select({ id: crmConversations.id, botState: crmConversations.botState, last: sql<Date>`max(${crmMessages.createdAt})` })
      .from(crmMessages)
      .innerJoin(crmConversations, eq(crmConversations.id, crmMessages.conversationId))
      .where(and(eq(crmMessages.source, "bot"), eq(crmMessages.internal, false), gte(crmMessages.createdAt, since)))
      .groupBy(crmConversations.id)
      .orderBy(desc(sql`max(${crmMessages.createdAt})`))
      .limit(limit);
    if (!convs.length) return [];
    const ids = convs.map((c) => c.id);
    const events = await db
      .select({ conv: crmBotEvents.conversationId, kind: crmBotEvents.kind, reason: crmBotEvents.reason })
      .from(crmBotEvents)
      .where(and(inArray(crmBotEvents.conversationId, ids), gte(crmBotEvents.createdAt, since)));
    const out: CoachConversation[] = [];
    for (const c of convs) {
      const rows = await db
        .select({ id: crmMessages.id, direction: crmMessages.direction, source: crmMessages.source, type: crmMessages.type, text: crmMessages.text, at: crmMessages.createdAt })
        .from(crmMessages)
        .where(and(eq(crmMessages.conversationId, c.id), eq(crmMessages.internal, false)))
        .orderBy(desc(crmMessages.createdAt))
        .limit(MESSAGES_PER_CONVERSATION);
      const history: HistoryMessage[] = rows.reverse().map((m) => ({
        from: m.direction === "in" ? "client" : m.source === "bot" ? "bot" : "manager",
        text: m.text || mediaStub(m.type),
        at: m.at,
        id: m.id,
      }));
      const state = readBotState(c.botState);
      const ai = readSellerAi(state?.ai);
      const flags = [...new Set(events.filter((e) => e.conv === c.id).map((e) => flagOf(e.kind, e.reason)).filter((f): f is string => !!f))];
      const outcome = state ? (state.phase === "done" ? `${state.outcome ?? "завершена"}${state.reason ? ` (${state.reason})` : ""}` : `идёт, этап ${state.stage}`) : "нет состояния";
      out.push({ id: c.id, outcome, flags, messages: withMediaText(history, ai.media) });
    }
    return out;
  },
};
