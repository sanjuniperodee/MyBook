import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { api, HttpError } from "@/lib/api";
import { db } from "@/lib/db";
import { bookLetters, books, users } from "@/lib/db/schema";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { appLink, emailLayout, escapeHtml, sendMail } from "@/lib/mail";
import { messagesFor } from "@/i18n/messages";

const MAX_LETTERS = 200;

/** Публичная отправка письма по ссылке-приглашению. Письмо ждёт одобрения владельца книги. */
export const POST = api(async (req, { params }: { params: Promise<{ token: string }> }) => {
  const { token } = await params;
  const body = z
    .object({
      authorName: z.string().trim().min(1, "letterName").max(80),
      relation: z.string().trim().max(80).default(""),
      text: z.string().trim().min(10, "letterShort").max(8000, "letterLong"),
      website: z.string().max(0).optional(), // ловушка для ботов
    })
    .parse(await req.json());
  if (!rateLimit(`letter:${await clientIp()}`, 5, 3600_000)) throw new HttpError(429, "letterRate");
  if (!/^[A-Za-z0-9_-]{10,40}$/.test(token)) throw new HttpError(404, "letterInvalid");
  const book = await db.query.books.findFirst({ where: eq(books.inviteToken, token) });
  if (!book) throw new HttpError(404, "letterClosed");
  if (book.status !== "draft") throw new HttpError(409, "letterPrinted");
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(bookLetters).where(eq(bookLetters.bookId, book.id));
  if (n >= MAX_LETTERS) throw new HttpError(400, "letterLimit");
  await db.insert(bookLetters).values({ bookId: book.id, authorName: body.authorName, relation: body.relation, text: body.text });

  const owner = await db.query.users.findFirst({ where: eq(users.id, book.userId) });
  if (owner) {
    // Письмо владельцу — на его языке, а не на языке того, кто написал письмо.
    const t = messagesFor(owner.locale).mail.letter;
    await sendMail(
      owner.email,
      t.subject(book.title),
      emailLayout({
        locale: owner.locale,
        title: t.title,
        paragraphs: [t.text(escapeHtml(body.authorName), escapeHtml(body.relation), escapeHtml(book.title)), t.decide],
        button: { label: t.button, url: appLink(`/books/${book.id}/letters`, owner.locale) },
      }),
    );
  }
  return NextResponse.json({ ok: true });
});
