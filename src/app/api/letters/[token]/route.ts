import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { api, HttpError } from "@/lib/api";
import { db } from "@/lib/db";
import { bookLetters, books, users } from "@/lib/db/schema";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { emailLayout, escapeHtml, sendMail } from "@/lib/mail";
import { env } from "@/lib/env";

const MAX_LETTERS = 200;

/** Публичная отправка письма по ссылке-приглашению. Письмо ждёт одобрения владельца книги. */
export const POST = api(async (req, { params }: { params: Promise<{ token: string }> }) => {
  const { token } = await params;
  const body = z
    .object({
      authorName: z.string().trim().min(1, "Представьтесь, пожалуйста").max(80),
      relation: z.string().trim().max(80).default(""),
      text: z.string().trim().min(10, "Напишите хотя бы пару предложений").max(8000, "Слишком длинное письмо"),
      website: z.string().max(0).optional(), // ловушка для ботов
    })
    .parse(await req.json());
  if (!rateLimit(`letter:${await clientIp()}`, 5, 3600_000)) throw new HttpError(429, "Слишком много писем с этого устройства. Попробуйте позже.");
  if (!/^[A-Za-z0-9_-]{10,40}$/.test(token)) throw new HttpError(404, "Ссылка недействительна");
  const book = await db.query.books.findFirst({ where: eq(books.inviteToken, token) });
  if (!book) throw new HttpError(404, "Ссылка недействительна или приём писем закрыт");
  if (book.status !== "draft") throw new HttpError(409, "Книга уже отправлена в печать — приём писем закрыт");
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(bookLetters).where(eq(bookLetters.bookId, book.id));
  if (n >= MAX_LETTERS) throw new HttpError(400, "Для этой книги собрано максимальное количество писем");
  await db.insert(bookLetters).values({ bookId: book.id, authorName: body.authorName, relation: body.relation, text: body.text });

  const owner = await db.query.users.findFirst({ where: eq(users.id, book.userId) });
  if (owner) {
    await sendMail(
      owner.email,
      `Новое письмо для книги «${book.title}»`,
      emailLayout({
        title: "Вам пришло письмо для книги",
        paragraphs: [`<b>${escapeHtml(body.authorName)}</b>${body.relation ? ` (${escapeHtml(body.relation)})` : ""} написал(а) письмо для книги «${escapeHtml(book.title)}».`, "Прочитайте его и решите, добавить ли письмо в книгу."],
        button: { label: "Открыть письма", url: `${env.appUrl}/books/${book.id}/letters` },
      }),
    );
  }
  return NextResponse.json({ ok: true });
});
