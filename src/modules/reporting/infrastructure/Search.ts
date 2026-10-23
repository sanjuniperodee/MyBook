import "server-only";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { books, crmConversations, crmDeals, crmStages, orders, users } from "@/shared/infrastructure/db/schema";
import { executor } from "@/shared/infrastructure/database";
import { visibleTo, type Viewer } from "./MyDay";
import { ownClientBooks, ownClientOrders } from "./conditions";
import { extraPhoneMatch, phoneMatch, tagMatch } from "./phoneSearch";

/** Поиск по CRM: заказы, клиенты, книги, сделки, переписка — с учётом видимости «только свои». */
export async function search(term: string, viewer: Viewer, sections: { orders: boolean; clients: boolean; deals: boolean; chats: boolean }) {
  const db = executor();
  const like = `%${term}%`;
  const num = Number(term.replace(/[^\d]/g, ""));
  const none = Promise.resolve([]);
  // Телефон — по последним 10 цифрам: «8 701…» находит «7701…» (contacts-d1).
  const phoneLike = (col: unknown) => phoneMatch(col, term);
  const [orderRows, clientRows, bookRows, dealRows, chatRows] = await Promise.all([
    !sections.orders ? none : db
      .select()
      .from(orders)
      .where(
        and(
          or(
            ilike(orders.contactName, like),
            ilike(orders.contactEmail, like),
            ilike(orders.address, like),
            phoneLike(orders.contactPhone),
            num && term.length < 8 ? eq(orders.number, num) : undefined,
          ),
          // Роль «только свои» — заказы только своих клиентов.
          ownClientOrders(viewer),
        ),
      )
      .orderBy(desc(orders.createdAt))
      .limit(20),
    !sections.clients
      ? none
      : db
          .select()
          .from(users)
          .where(and(or(ilike(users.name, like), ilike(users.email, like), phoneLike(users.phone), extraPhoneMatch(users.extraPhones, term), tagMatch(users.tags, term)), visibleTo(viewer, users.managerId)))
          .limit(20),
    !sections.clients
      ? none
      : db
          .select({ id: books.id, title: books.title, theme: books.theme, authorName: books.authorName, recipientName: books.recipientName, userId: books.userId, updatedAt: books.updatedAt })
          .from(books)
          .innerJoin(users, eq(users.id, books.userId))
          .where(and(or(ilike(books.title, like), ilike(books.authorName, like), ilike(books.recipientName, like)), ownClientBooks(viewer)))
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
              or(
                ilike(crmDeals.title, like),
                ilike(crmDeals.contactName, like),
                ilike(crmDeals.contactEmail, like),
                phoneLike(crmDeals.contactPhone),
                extraPhoneMatch(crmDeals.extraPhones, term),
                tagMatch(crmDeals.tags, term),
                num && term.length < 8 ? eq(crmDeals.number, num) : undefined,
              ),
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
          .where(and(or(ilike(crmConversations.contactName, like), phoneLike(crmConversations.chatId), phoneLike(sql`${crmConversations.meta}->>'phone'`), ilike(crmConversations.chatId, like)), visibleTo(viewer, crmConversations.assigneeId)))
          .orderBy(desc(crmConversations.lastMessageAt))
          .limit(20),
  ]);
  return { orderRows, clientRows, bookRows, dealRows, chatRows };
}
