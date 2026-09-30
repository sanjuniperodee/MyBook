import "server-only";
import { booksId } from "@/lib/db/refs";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "./db";
import { bookQuestions, books, crmNotes, users } from "./db/schema";
import { appLink, emailLayout, escapeHtml, sendMail } from "./mail";
import { messagesFor } from "@/i18n/messages";

export const REMINDER_COOLDOWN_DAYS = 3;

export type ReminderResult = { ok: true } | { ok: false; reason: string };

/** Письмо «ваша книга ждёт продолжения» по самой свежей незаказанной книге клиента. */
export async function sendBookReminder(clientId: string, authorId: string | null): Promise<ReminderResult> {
  const user = await db.query.users.findFirst({ where: eq(users.id, clientId) });
  if (!user) return { ok: false, reason: "Клиент не найден" };
  if (user.remindedAt && Date.now() - user.remindedAt.getTime() < REMINDER_COOLDOWN_DAYS * 86_400_000) {
    return { ok: false, reason: `Напоминание уже отправлялось менее ${REMINDER_COOLDOWN_DAYS} дней назад` };
  }
  const [book] = await db
    .select({
      id: books.id,
      title: books.title,
      answered: sql<number>`(select count(*)::int from ${bookQuestions} q where q.book_id = ${booksId} and length(trim(q.answer)) > 0)`,
      total: sql<number>`(select count(*)::int from ${bookQuestions} q where q.book_id = ${booksId})`,
      firstEmpty: sql<number | null>`(select min(q.position) from ${bookQuestions} q where q.book_id = ${booksId} and length(trim(q.answer)) = 0)`,
    })
    .from(books)
    .where(and(eq(books.userId, user.id), eq(books.status, "draft")))
    .orderBy(desc(books.updatedAt))
    .limit(1);
  if (!book) return { ok: false, reason: "У клиента нет незавершённых книг" };

  const next = (book.firstEmpty ?? 0) + 1;
  // Клиенту — на его языке; сама CRM и заметка в ней — по-русски.
  const m = messagesFor(user.locale).mail;
  await sendMail(
    user.email,
    m.reminder.subject(book.title),
    emailLayout({
      locale: user.locale,
      title: m.reminder.title,
      paragraphs: [
        m.hello(escapeHtml(user.name)),
        book.answered ? m.reminder.progress(escapeHtml(book.title), book.answered, book.total) : m.reminder.empty(escapeHtml(book.title)),
        m.reminder.autosave,
      ],
      button: { label: m.reminder.button, url: appLink(`/books/${book.id}/questions?q=${next}`, user.locale) },
      footnote: m.reminder.footnote,
    }),
  );
  await db.update(users).set({ remindedAt: new Date() }).where(eq(users.id, user.id));
  await db.insert(crmNotes).values({ clientId: user.id, authorId, kind: "email", text: `Отправлено напоминание дописать книгу «${book.title}» (${book.answered}/${book.total})` });
  return { ok: true };
}
