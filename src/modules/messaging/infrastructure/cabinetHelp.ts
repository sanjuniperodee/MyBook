import "server-only";
import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { crmBotEvents, crmConversations, crmMessages } from "@/shared/infrastructure/db/schema";
import { executor } from "@/shared/infrastructure/database";
import type { HelpStore, HelpThreadMessage } from "../application/cabinetHelp";

/**
 * Беседы помощника в кабинете: обычный диалог CRM «Чат на сайте» (канал site, без канала шлюза) с собеседником
 * help-<id клиента> — один на клиента, его видно в «Чатах» и в карточке клиента рядом с WhatsApp. Ходы помощника и
 * их стоимость — в журнале бота (crm_bot_events, kind = help), как ходы продажника.
 */
export const drizzleHelpStore: HelpStore = {
  async thread(conversationId: string, limit: number): Promise<HelpThreadMessage[]> {
    const rows = await executor()
      .select({ id: crmMessages.id, direction: crmMessages.direction, source: crmMessages.source, text: crmMessages.text, at: crmMessages.createdAt, deletedAt: crmMessages.deletedAt })
      .from(crmMessages)
      .where(and(eq(crmMessages.conversationId, conversationId), eq(crmMessages.internal, false)))
      .orderBy(desc(crmMessages.createdAt))
      .limit(limit);
    return rows
      .filter((r) => !r.deletedAt)
      .reverse()
      .map((r) => ({ id: r.id, from: r.direction === "in" ? "client" : r.source ? "bot" : "manager", text: r.text, at: r.at.toISOString() }));
  },

  async log(conversationId: string, e: { reason: string; lang: string; messageId: string | null; meta: Record<string, unknown> }) {
    await executor()
      .insert(crmBotEvents)
      .values({ conversationId, kind: "help", reason: e.reason.slice(0, 200), lang: e.lang, meta: e.meta, messageId: e.messageId });
  },

  async spentSince(since: Date): Promise<number> {
    const res = await executor().execute<{ usd: string | number | null }>(
      sql`select coalesce(sum((meta->>'costUsd')::numeric), 0) as usd from crm_bot_events where kind = 'help' and created_at >= ${since} and meta ? 'costUsd'`,
    );
    return Number(res.rows[0]?.usd ?? 0);
  },
};

/** Последние вопросы клиента помощнику — для чата WhatsApp и карточки клиента в CRM: что спрашивал на сайте и ушло ли менеджеру. */
export async function helpQuestionsOf(clientId: string, limit = 4) {
  const [conv] = await executor()
    .select({ id: crmConversations.id, awaitingSince: crmConversations.awaitingSince })
    .from(crmConversations)
    .where(and(eq(crmConversations.channel, "site"), eq(crmConversations.channelId, ""), eq(crmConversations.chatId, helpChatId(clientId))))
    .limit(1);
  if (!conv) return null;
  const [rows, handoffs] = await Promise.all([
    executor()
      .select({ id: crmMessages.id, text: crmMessages.text, at: crmMessages.createdAt })
      .from(crmMessages)
      .where(and(eq(crmMessages.conversationId, conv.id), eq(crmMessages.direction, "in")))
      .orderBy(desc(crmMessages.createdAt))
      .limit(limit),
    executor()
      .select({ n: sql<number>`count(*)::int` })
      .from(crmBotEvents)
      .where(and(eq(crmBotEvents.conversationId, conv.id), eq(crmBotEvents.kind, "help"), sql`${crmBotEvents.reason} <> 'none'`, gte(crmBotEvents.createdAt, sql`now() - interval '30 days'`))),
  ]);
  return { conversationId: conv.id, waiting: !!conv.awaitingSince, handoffs30d: handoffs[0]?.n ?? 0, questions: rows.map((r) => ({ id: r.id, text: r.text, at: r.at })) };
}

/** Собеседник беседы помощника: по id клиента (не по cookie посетителя — беседа одна на всех устройствах клиента). */
export const helpChatId = (userId: string) => `help-${userId}`;

/** Сколько вопросов помощнику и сколько ушло менеджеру за период — для настроек виджета в CRM. */
export async function helpStats(days = 30) {
  const res = await executor()
    .select({ reason: crmBotEvents.reason, n: sql<number>`count(*)::int`, usd: sql<string>`coalesce(sum((${crmBotEvents.meta}->>'costUsd')::numeric), 0)` })
    .from(crmBotEvents)
    .where(and(eq(crmBotEvents.kind, "help"), gte(crmBotEvents.createdAt, sql`now() - make_interval(days => ${days})`)))
    .groupBy(crmBotEvents.reason)
    .orderBy(asc(crmBotEvents.reason));
  const total = res.reduce((s, r) => s + r.n, 0);
  return { total, answered: res.find((r) => r.reason === "none")?.n ?? 0, byReason: Object.fromEntries(res.map((r) => [r.reason ?? "", r.n])), costUsd: Math.round(res.reduce((s, r) => s + Number(r.usd), 0) * 100) / 100 };
}
