import "server-only";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { bookQuestions, books, crmCalls, crmConversations, crmDeals, crmNotes, crmStages, crmTasks, orders } from "@/lib/db/schema";
import { booksId } from "@/lib/db/refs";
import { getSetting } from "@/lib/crm/settings";
import { loadChatMessages } from "@/lib/crm/chat-view";
import { fieldVars, listFields } from "@/lib/crm/fields";
import { executor } from "@/shared/infrastructure/database";
import type { AssistantData } from "../application";
import type { AiMessage } from "../domain";

const transcript = async (conversationId: string, limit: number): Promise<AiMessage[]> =>
  (await loadChatMessages(conversationId, limit)).map((m) => ({ direction: m.direction, text: m.text || (m.mediaUrl ? `[${m.type}]` : ""), internal: m.internal, author: m.author, at: m.at }));

export const crmAssistantData: AssistantData = {
  transcript,
  knowledge: () => getSetting("ai.knowledge"),
  dealFields: async () => (await listFields("deal")).map((f) => ({ key: f.key, label: f.label, type: f.type, options: f.options })),
  async saveSummary(dealId, summary) {
    await executor().update(crmDeals).set({ aiSummary: summary }).where(eq(crmDeals.id, dealId));
  },
  async dossier(dealId) {
    const db = executor();
    const [deal] = await db.select().from(crmDeals).where(eq(crmDeals.id, dealId)).limit(1);
    if (!deal) return null;
    const [[stage], fields, notes, tasks, calls, [conv], [order], bookRows] = await Promise.all([
      db.select({ name: crmStages.name }).from(crmStages).where(eq(crmStages.id, deal.stageId)).limit(1),
      listFields("deal"),
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
      fieldValues: fieldVars(fields, deal.customFields),
      notes,
      tasks,
      calls,
      order: order ?? null,
      books: bookRows,
      messages: conv ? await transcript(conv.id, 80) : [],
    };
  },
};
