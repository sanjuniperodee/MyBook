import "server-only";
import { and, asc, desc, eq, gt, gte, inArray, isNull, sql } from "drizzle-orm";
import { crmBlocklist, crmConversations, crmMessages, users } from "@/lib/db/schema";
import { executor } from "@/shared/infrastructure/database";
import type { Blocklist, ConversationRepository, MessageRepository } from "../application";
import type { Conversation, InboundMessage } from "../domain";

type Row = typeof crmConversations.$inferSelect;
const toConversation = (r: Row): Conversation => ({
  id: r.id,
  channel: r.channel,
  channelId: r.channelId,
  chatId: r.chatId,
  contactName: r.contactName,
  avatarUrl: r.avatarUrl,
  clientId: r.clientId,
  dealId: r.dealId,
  assigneeId: r.assigneeId,
  botStep: r.botStep,
  meta: r.meta,
});

export class DrizzleConversationRepository implements ConversationRepository {
  async findById(id: string) {
    const [r] = await executor().select().from(crmConversations).where(eq(crmConversations.id, id)).limit(1);
    return r ? toConversation(r) : null;
  }

  async findByChat(channel: string, channelId: string, chatId: string) {
    const [r] = await executor()
      .select()
      .from(crmConversations)
      .where(and(eq(crmConversations.channel, channel), eq(crmConversations.channelId, channelId), eq(crmConversations.chatId, chatId)))
      .limit(1);
    return r ? toConversation(r) : null;
  }

  async create(input: Parameters<ConversationRepository["create"]>[0]) {
    const [r] = await executor().insert(crmConversations).values(input).onConflictDoNothing().returning();
    return r ? toConversation(r) : null;
  }

  async updateContact(id: string, patch: Parameters<ConversationRepository["updateContact"]>[1]) {
    const [r] = await executor().update(crmConversations).set(patch).where(eq(crmConversations.id, id)).returning();
    return toConversation(r);
  }

  async linkDeal(id: string, link: { dealId: string; clientId: string | null; assigneeId: string | null }) {
    const [r] = await executor().update(crmConversations).set(link).where(eq(crmConversations.id, id)).returning();
    return toConversation(r);
  }

  async recordIncoming(id: string, text: string, at: Date) {
    await executor()
      .update(crmConversations)
      .set({
        lastMessageAt: at,
        lastMessageText: text,
        unread: sql`${crmConversations.unread} + 1`,
        awaitingSince: sql`coalesce(${crmConversations.awaitingSince}, ${at.toISOString()}::timestamptz)`,
        status: "open",
        updatedAt: new Date(),
      })
      .where(eq(crmConversations.id, id));
  }

  async recordEcho(id: string, text: string, at: Date) {
    await executor().update(crmConversations).set({ lastMessageAt: at, lastMessageText: text, awaitingSince: null, unread: 0, updatedAt: new Date() }).where(eq(crmConversations.id, id));
  }

  async recordOutgoing(id: string, text: string, at: Date, authorId: string | null) {
    await executor()
      .update(crmConversations)
      .set({
        lastMessageAt: at,
        lastMessageText: text,
        // Автоответ и бот не снимают «ждёт ответа»: клиент всё ещё ждёт менеджера.
        ...(authorId ? { unread: 0, awaitingSince: null, botStep: -1, assigneeId: sql`coalesce(${crmConversations.assigneeId}, ${authorId}::uuid)` } : {}),
        updatedAt: at,
      })
      .where(eq(crmConversations.id, id));
  }

  async closeAsSpam(id: string, text: string, at: Date) {
    await executor().update(crmConversations).set({ lastMessageAt: at, lastMessageText: text, status: "closed" }).where(eq(crmConversations.id, id));
  }

  async markRead(id: string) {
    await executor().update(crmConversations).set({ unread: 0 }).where(eq(crmConversations.id, id));
  }

  async advanceBot(id: string, from: number | null, to: number) {
    const rows = await executor()
      .update(crmConversations)
      .set({ botStep: to })
      .where(and(eq(crmConversations.id, id), from === null ? isNull(crmConversations.botStep) : eq(crmConversations.botStep, from)))
      .returning({ id: crmConversations.id });
    return rows.length > 0;
  }

  async latestWhatsapp(chatId: string) {
    const [r] = await executor()
      .select()
      .from(crmConversations)
      .where(and(eq(crmConversations.chatId, chatId), sql`${crmConversations.channel} in ('whatsapp', 'wapi')`))
      .orderBy(desc(crmConversations.lastMessageAt))
      .limit(1);
    return r ? toConversation(r) : null;
  }
}

export class DrizzleMessageRepository implements MessageRepository {
  async insertIncoming(conversationId: string, m: InboundMessage, subject: string | null) {
    const rows = await executor()
      .insert(crmMessages)
      .values({ conversationId, direction: "in", type: m.type, text: m.text, mediaUrl: m.mediaUrl, externalId: m.externalId, status: "received", subject, createdAt: m.at })
      .onConflictDoNothing()
      .returning({ id: crmMessages.id });
    return rows.length > 0;
  }

  async existsExternal(externalId: string) {
    const [r] = await executor().select({ id: crmMessages.id }).from(crmMessages).where(eq(crmMessages.externalId, externalId)).limit(1);
    return !!r;
  }

  async claimPendingEcho(conversationId: string, text: string, since: Date, externalId: string) {
    const [pending] = await executor()
      .select({ id: crmMessages.id })
      .from(crmMessages)
      .where(
        and(
          eq(crmMessages.conversationId, conversationId),
          eq(crmMessages.direction, "out"),
          eq(crmMessages.internal, false),
          isNull(crmMessages.externalId),
          eq(crmMessages.text, text),
          gte(crmMessages.createdAt, since),
        ),
      )
      .limit(1);
    if (!pending) return false;
    await executor().update(crmMessages).set({ externalId }).where(eq(crmMessages.id, pending.id));
    return true;
  }

  async insertEcho(conversationId: string, m: InboundMessage) {
    const rows = await executor()
      .insert(crmMessages)
      .values({ conversationId, direction: "out", type: m.type, text: m.text, mediaUrl: m.mediaUrl, externalId: m.externalId, status: "sent", createdAt: m.at })
      .onConflictDoNothing()
      .returning({ id: crmMessages.id });
    return rows.length > 0;
  }

  async insertOutgoing(conversationId: string, text: string, authorId: string | null, internal = false) {
    const [m] = await executor()
      .insert(crmMessages)
      .values({ conversationId, direction: "out", authorId, text, internal, status: internal ? "sent" : "pending" })
      .returning();
    return m;
  }

  async setStatus(id: string, status: "sent" | "delivered" | "read" | "error", error: string | null = null) {
    await executor().update(crmMessages).set({ status, error }).where(eq(crmMessages.id, id));
  }

  async attachExternalId(id: string, externalId: string | null) {
    const sent = sql`case when ${crmMessages.status} = 'pending' then 'sent' else ${crmMessages.status} end`;
    if (!externalId) {
      await executor().update(crmMessages).set({ status: sent }).where(eq(crmMessages.id, id));
      return;
    }
    await executor().transaction(async (tx) => {
      await tx.delete(crmMessages).where(and(eq(crmMessages.externalId, externalId), sql`${crmMessages.id} <> ${id}`));
      await tx.update(crmMessages).set({ externalId, status: sent }).where(eq(crmMessages.id, id));
    });
  }

  async byExternalId(externalId: string) {
    const [r] = await executor()
      .select({ id: crmMessages.id, status: crmMessages.status, conversationId: crmMessages.conversationId })
      .from(crmMessages)
      .where(eq(crmMessages.externalId, externalId))
      .limit(1);
    return r ?? null;
  }
}

export const drizzleBlocklist: Blocklist = {
  async isBlocked(...values) {
    const list = values.filter((v): v is string => !!v);
    if (!list.length) return false;
    const rows = await executor().select({ v: crmBlocklist.value }).from(crmBlocklist).where(inArray(crmBlocklist.value, list)).limit(1);
    return rows.length > 0;
  },
};

/** Read-модели переписки. */
export class DrizzleMessagingQueries {
  /** Переписка для виджета: без внутренних заметок; автор — только «я / менеджер», без имён сотрудников. */
  async siteMessages(chatId: string, after?: Date) {
    const [conv] = await executor()
      .select({ id: crmConversations.id })
      .from(crmConversations)
      .where(and(eq(crmConversations.channel, "site"), eq(crmConversations.channelId, ""), eq(crmConversations.chatId, chatId)))
      .limit(1);
    if (!conv) return [];
    const rows = await executor()
      .select({ id: crmMessages.id, direction: crmMessages.direction, text: crmMessages.text, at: crmMessages.createdAt })
      .from(crmMessages)
      .where(and(eq(crmMessages.conversationId, conv.id), eq(crmMessages.internal, false), after ? gt(crmMessages.createdAt, after) : undefined))
      .orderBy(asc(crmMessages.createdAt))
      .limit(200);
    return rows.map((r) => ({ id: r.id, mine: r.direction === "in", text: r.text, at: r.at.toISOString() }));
  }

  /** Сколько диалогов бот ведёт и закончил за 30 дней (для настроек). */
  async botStats() {
    const [row] = await executor()
      .select({ active: sql<number>`count(*) filter (where ${crmConversations.botStep} >= 0)::int`, done: sql<number>`count(*) filter (where ${crmConversations.botStep} = -1)::int` })
      .from(crmConversations)
      .where(gte(crmConversations.createdAt, sql`now() - interval '30 days'`));
    return row;
  }

  async staffName(id: string | null) {
    if (!id) return null;
    const [u] = await executor().select({ name: users.name, email: users.email }).from(users).where(eq(users.id, id)).limit(1);
    return u ?? null;
  }
}
