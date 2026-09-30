import { NextResponse } from "next/server";
import { crmAfter, onAnswerSaved } from "@/lib/crm/hooks";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { api, apiBook, HttpError } from "@/lib/api";
import { db } from "@/lib/db";
import { bookQuestions } from "@/lib/db/schema";
import { touchBook } from "@/lib/books";

const schema = z
  .object({
    answer: z.string().max(40_000, "answerTooLong"),
    displayText: z.string().trim().max(200).nullable(),
    hideHeading: z.boolean(),
  })
  .partial()
  .strict();

type Ctx = { params: Promise<{ id: string; qid: string }> };

export const PATCH = api(async (req, { params }: Ctx) => {
  const { id, qid } = await params;
  const { book } = await apiBook(req, id, { editable: true });
  const data = schema.parse(await req.json());
  if (data.displayText === "") data.displayText = null;
  const [q] = await db
    .update(bookQuestions)
    .set(data)
    .where(and(eq(bookQuestions.id, qid), eq(bookQuestions.bookId, book.id)))
    .returning({ id: bookQuestions.id, updatedAt: bookQuestions.updatedAt });
  if (!q) throw new HttpError(404, "questionNotFound");
  await touchBook(book.id);
  if (data.answer !== undefined) crmAfter(() => onAnswerSaved(book.id, book.userId));
  return NextResponse.json({ ok: true, updatedAt: q.updatedAt });
});

export const DELETE = api(async (req, { params }: Ctx) => {
  const { id, qid } = await params;
  const { book } = await apiBook(req, id, { editable: true });
  const [q] = await db
    .delete(bookQuestions)
    .where(and(eq(bookQuestions.id, qid), eq(bookQuestions.bookId, book.id), eq(bookQuestions.questionKey, "custom")))
    .returning({ id: bookQuestions.id });
  if (!q) throw new HttpError(400, "onlyOwnQuestions");
  return NextResponse.json({ ok: true });
});
