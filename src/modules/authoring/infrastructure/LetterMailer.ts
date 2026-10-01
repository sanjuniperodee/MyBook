import "server-only";
import { eq } from "drizzle-orm";
import { books, users } from "@/lib/db/schema";
import { rootDb } from "@/shared/infrastructure/database";
import { messagesFor } from "@/i18n/messages";
import { appLink, emailLayout, escapeHtml, sendMail } from "@/lib/mail";
import type { LetterSubmitted } from "../domain";

/** Владельцу книги — письмо о новом письме от близкого, на языке владельца. */
export async function notifyOwnerAboutLetter(e: LetterSubmitted) {
  const [row] = await rootDb.select({ title: books.title, email: users.email, locale: users.locale }).from(books).innerJoin(users, eq(users.id, books.userId)).where(eq(books.id, e.payload.bookId)).limit(1);
  if (!row) return;
  const t = messagesFor(row.locale).mail.letter;
  await sendMail(
    row.email,
    t.subject(row.title),
    emailLayout({
      locale: row.locale,
      title: t.title,
      paragraphs: [t.text(escapeHtml(e.payload.authorName), escapeHtml(e.payload.relation), escapeHtml(row.title)), t.decide],
      button: { label: t.button, url: appLink(`/books/${e.payload.bookId}/letters`, row.locale) },
    }),
  );
}
