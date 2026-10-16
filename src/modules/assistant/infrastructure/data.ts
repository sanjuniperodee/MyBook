import "server-only";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { bookQuestions, books, crmCalls, crmConversations, crmDeals, crmNotes, crmStages, crmTasks, orders } from "@/shared/infrastructure/db/schema";
import { booksId } from "@/shared/infrastructure/db/refs";
import type { CustomFieldsReader, SettingsReader } from "@/shared/application";
import { fieldVars } from "@/shared/domain/customFields";
import { executor } from "@/shared/infrastructure/database";
import type { AssistantData, ConversationReader } from "../application";
import type { AiMessage } from "../domain";

/** Переписка глазами модели: вложение без подписи — «[тип]». */
const transcriptOf = async (conversations: ConversationReader, conversationId: string, limit: number): Promise<AiMessage[]> =>
  (await conversations.messages(conversationId, limit)).map((m) => ({ direction: m.direction, text: m.text || (m.mediaUrl || m.gateway ? `[${m.type}]` : ""), internal: m.internal, author: m.author, at: m.at }));

/** Данные CRM для помощника; база знаний и свои поля сделки — из рабочего пространства, переписка — из Messaging. */
export const crmAssistantData = (settings: SettingsReader<"ai.knowledge">, fields: CustomFieldsReader, conversations: ConversationReader): AssistantData => ({
  transcript: (conversationId, limit) => transcriptOf(conversations, conversationId, limit),
  knowledge: () => settings.get("ai.knowledge"),
  dealFields: () => fields.list("deal"),
  async saveSummary(dealId, summary) {
    await executor().update(crmDeals).set({ aiSummary: summary }).where(eq(crmDeals.id, dealId));
  },
  async dossier(dealId) {
    const db = executor();
    const [deal] = await db.select().from(crmDeals).where(eq(crmDeals.id, dealId)).limit(1);
    if (!deal) return null;
    const [[stage], dealFields, notes, tasks, calls, [conv], [order], bookRows] = await Promise.all([
      db.select({ name: crmStages.name }).from(crmStages).where(eq(crmStages.id, deal.stageId)).limit(1),
      fields.list("deal"),
      db.select({ kind: crmNotes.kind, text: crmNotes.text, at: crmNotes.createdAt }).from(crmNotes).where(eq(crmNotes.dealId, deal.id)).orderBy(desc(crmNotes.createdAt)).limit(30),
      db.select({ title: crmTasks.title, dueAt: crmTasks.dueAt }).from(crmTasks).where(and(eq(crmTasks.dealId, deal.id), isNull(crmTasks.doneAt))).limit(10),
      db.select({ direction: crmCalls.direction, status: crmCalls.status, durationSec: crmCalls.durationSec, at: crmCalls.startedAt }).from(crmCalls).where(eq(crmCalls.dealId, deal.id)).orderBy(desc(crmCalls.startedAt)).limit(10),
      db.select({ id: crmConversations.id }).from(crmConversations).where(eq(crmConversations.dealId, deal.id)).orderBy(desc(crmConversations.lastMessageAt)).limit(1),
      deal.orderId ? db.select({ number: orders.number, status: orders.status, amount: orders.amount, plan: orders.plan }).from(orders).where(eq(orders.id, deal.orderId)).limit(1) : Promise.resolve([]),
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
    return {
      deal,
      stageName: stage?.name ?? null,
      fieldValues: fieldVars(dealFields, deal.customFields),
      notes,
      tasks,
      calls,
      order: order ?? null,
      books: bookRows,
      messages: conv ? await transcriptOf(conversations, conv.id, 80) : [],
    };
  },
});
