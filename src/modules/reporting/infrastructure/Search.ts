import "server-only";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { books, crmConversations, crmDeals, crmStages, orders, users } from "@/lib/db/schema";
import { executor } from "@/shared/infrastructure/database";
import { visibleTo, type Viewer } from "./MyDay";

/** Поиск по CRM: заказы, клиенты, книги, сделки, переписка — с учётом видимости «только свои». */
export async function search(term: string, viewer: Viewer, sections: { orders: boolean; clients: boolean; deals: boolean; chats: boolean }) {
  const db = executor();
  const like = `%${term}%`;
  const num = Number(term.replace(/[^\d]/g, ""));
  const digits = term.replace(/\D/g, "");
  const none = Promise.resolve([]);
  const phoneLike = (col: unknown) => (digits.length >= 4 ? sql`regexp_replace(coalesce(${col}, ''), '\\D', '', 'g') like ${"%" + digits + "%"}` : undefined);
  const [orderRows, clientRows, bookRows, dealRows, chatRows] = await Promise.all([
    !sections.orders ? none : db
      .select()
      .from(orders)
      .where(
        or(
          ilike(orders.contactName, like),
          ilike(orders.contactEmail, like),
          ilike(orders.address, like),
          digits.length >= 4 ? sql`regexp_replace(${orders.contactPhone}, '\\D', '', 'g') like ${"%" + digits + "%"}` : undefined,
          num && term.length < 8 ? eq(orders.number, num) : undefined,
        ),
      )
      .orderBy(desc(orders.createdAt))
      .limit(20),
    !sections.clients
      ? none
      : db
          .select()
          .from(users)
          .where(and(or(ilike(users.name, like), ilike(users.email, like), phoneLike(users.phone)), visibleTo(viewer, users.managerId)))
          .limit(20),
    !sections.clients
      ? none
      : db
          .select({ id: books.id, title: books.title, authorName: books.authorName, recipientName: books.recipientName, userId: books.userId, updatedAt: books.updatedAt })
          .from(books)
          .innerJoin(users, eq(users.id, books.userId))
          .where(and(or(ilike(books.title, like), ilike(books.authorName, like), ilike(books.recipientName, like)), visibleTo(viewer, users.managerId)))
          .orderBy(desc(books.updatedAt))
          .limit(20),
    !sections.deals
      ? none
      : db
          .select({ deal: crmDeals, stage: crmStages })
          .from(crmDeals)
          .innerJoin(crmStages, eq(crmStages.id, crmDeals.stageId))
          .where(
            and(
              or(ilike(crmDeals.title, like), ilike(crmDeals.contactName, like), ilike(crmDeals.contactEmail, like), phoneLike(crmDeals.contactPhone), num && term.length < 8 ? eq(crmDeals.number, num) : undefined),
              visibleTo(viewer, crmDeals.assigneeId),
            ),
          )
          .orderBy(desc(crmDeals.updatedAt))
          .limit(20),
    !sections.chats
      ? none
      : db
          .select()
          .from(crmConversations)
          .where(and(or(ilike(crmConversations.contactName, like), phoneLike(crmConversations.chatId), ilike(crmConversations.chatId, like)), visibleTo(viewer, crmConversations.assigneeId)))
          .orderBy(desc(crmConversations.lastMessageAt))
          .limit(20),
  ]);
  return { orderRows, clientRows, bookRows, dealRows, chatRows };
}
