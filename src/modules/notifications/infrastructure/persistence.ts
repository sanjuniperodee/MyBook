import "server-only";
import { and, desc, eq, isNull, lte, or, sql } from "drizzle-orm";
import { bookQuestions, books, crmNotes, emailLog, orderEvents, orders, reviews, users } from "@/shared/infrastructure/db/schema";
import { booksId, ordersBookId, ordersId } from "@/shared/infrastructure/db/refs";
import { WORD_PATTERN, answeredSql, totalSql, wordsSql } from "@/shared/infrastructure/db/bookProgress";
import { executor } from "@/shared/infrastructure/database";
import type { ClientTimeline, EmailJournal, LifecycleSource, Recipient, RecipientRepository } from "../application";

const recipientCols = { id: users.id, email: users.email, name: users.name, locale: users.locale, remindedAt: users.remindedAt, optOut: users.emailOptOut };
const answered = answeredSql(booksId);
// Первый раздел без текста — по позиции (позиции подряд), «без текста» — как в answeredSql (пробелы и переводы строк не в счёт).
const firstEmpty = sql<string | null>`(select q.id::text from ${bookQuestions} q where q.book_id = ${booksId} and q.answer !~ ${WORD_PATTERN} order by q.position limit 1)`;

// Тема книги заказа; книга могла быть удалена — тогда это подарок по умолчанию (bookKind).
const orderTheme = sql<string>`coalesce((select b.theme from books b where b.id = ${ordersBookId}), '')`;

export class DrizzleLifecycleSource implements LifecycleSource {
  async draftCandidates(createdBefore: Date) {
    const rows = await executor()
      .select({
        recipient: recipientCols,
        bookId: books.id,
        title: books.title,
        occasion: books.occasion,
        occasionDate: books.occasionDate,
        updatedAt: books.updatedAt,
        theme: books.theme,
        answered,
        words: wordsSql(booksId),
        firstEmpty,
        // Есть заказ — любой, кроме отменённого, в том числе ещё не оплаченный: напоминать дописать уже не нужно.
        hasOrder: sql<boolean>`exists(select 1 from ${orders} o where o.book_id = ${booksId} and o.status <> 'cancelled')`,
      })
      .from(books)
      .innerJoin(users, eq(users.id, books.userId))
      .where(and(eq(books.status, "draft"), eq(users.emailOptOut, false), eq(users.role, "user"), lte(books.createdAt, createdBefore)))
      .orderBy(desc(books.updatedAt))
      .limit(500);
    return rows.map(({ recipient, ...b }) => ({ recipient, book: { ...b, remindedAt: recipient.remindedAt } }));
  }

  async unpaidOrders(createdBefore: Date) {
    const rows = await executor()
      .select({ recipient: recipientCols, theme: orderTheme, orderId: orders.id, number: orders.number, amount: orders.amount, contactEmail: orders.contactEmail })
      .from(orders)
      .innerJoin(users, eq(users.id, orders.userId))
      .where(and(eq(orders.status, "pending_payment"), isNull(orders.paymentClaimedAt), lte(orders.createdAt, createdBefore), eq(users.emailOptOut, false)))
      .limit(100);
    return rows;
  }

  async reviewDue(deliveredBefore: Date, digitalPaidBefore: Date) {
    return executor()
      .select({ recipient: recipientCols, theme: orderTheme, orderId: orders.id, number: orders.number, amount: orders.amount, contactEmail: orders.contactEmail })
      .from(orders)
      .innerJoin(users, eq(users.id, orders.userId))
      .where(
        and(
          eq(users.emailOptOut, false),
          // Отзыв уже оставлен из кабинета — второй раз не просим.
          sql`not exists (select 1 from ${reviews} r where r.order_id = ${ordersId})`,
          or(
            and(eq(orders.status, "delivered"), sql`exists (select 1 from ${orderEvents} e where e.order_id = ${ordersId} and e.status = 'delivered' and e.created_at <= ${deliveredBefore})`),
            // Электронная книга «доставлена» в момент оплаты.
            and(eq(orders.plan, "digital"), eq(orders.status, "paid"), lte(orders.paidAt, digitalPaidBefore)),
          ),
        ),
      )
      .limit(100);
  }

  async latestDraft(userId: string) {
    const [book] = await executor()
      .select({ bookId: books.id, title: books.title, theme: books.theme, answered, total: totalSql(booksId), words: wordsSql(booksId), firstEmpty })
      .from(books)
      .where(and(eq(books.userId, userId), eq(books.status, "draft")))
      .orderBy(desc(books.updatedAt))
      .limit(1);
    return book ?? null;
  }
}

export class DrizzleEmailJournal implements EmailJournal {
  async claim(userId: string, key: string) {
    const rows = await executor().insert(emailLog).values({ userId, key }).onConflictDoNothing().returning({ id: emailLog.id });
    return rows.length > 0;
  }
  async release(userId: string, key: string) {
    await executor().delete(emailLog).where(and(eq(emailLog.userId, userId), eq(emailLog.key, key)));
  }
}

export class DrizzleRecipients implements RecipientRepository {
  async find(userId: string): Promise<Recipient | null> {
    const [r] = await executor().select(recipientCols).from(users).where(eq(users.id, userId)).limit(1);
    return r ?? null;
  }
  async markReminded(userId: string, at: Date) {
    await executor().update(users).set({ remindedAt: at }).where(eq(users.id, userId));
  }
  async optOut(userId: string) {
    await executor().update(users).set({ emailOptOut: true }).where(eq(users.id, userId));
  }
}

/** Лента клиента в CRM (заметка вида «письмо»). */
export const crmTimeline: ClientTimeline = {
  async emailSent(clientId, authorId, note) {
    await executor().insert(crmNotes).values({ clientId, authorId, kind: "email", text: note });
  },
};
