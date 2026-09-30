import { NextResponse } from "next/server";
import { and, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import { api, apiBook, HttpError } from "@/lib/api";
import { db } from "@/lib/db";
import { bookQuestions } from "@/lib/db/schema";
import { renumberQuestions } from "@/lib/books";

const schema = z.object({
  afterId: z.string().uuid(),
  prompt: z.string().trim().min(3, "questionEmpty").max(200),
});

/** Добавляет собственный вопрос сразу после указанного, в ту же главу. */
export const POST = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const { book } = await apiBook(req, id, { editable: true });
  const { afterId, prompt } = schema.parse(await req.json());
  const [after] = await db.select().from(bookQuestions).where(and(eq(bookQuestions.id, afterId), eq(bookQuestions.bookId, book.id)));
  if (!after) throw new HttpError(404, "questionNotFound");
  const [count] = await db.select({ n: sql<number>`count(*)::int` }).from(bookQuestions).where(eq(bookQuestions.bookId, book.id));
  if (count.n >= 600) throw new HttpError(400, "questionsLimit");
  const created = await db.transaction(async (tx) => {
    await tx
      .update(bookQuestions)
      .set({ position: sql`${bookQuestions.position} + 1` })
      .where(and(eq(bookQuestions.bookId, book.id), gt(bookQuestions.position, after.position)));
    const [q] = await tx
      .insert(bookQuestions)
      .values({ bookId: book.id, position: after.position + 1, chapter: after.chapter, questionKey: "custom", prompt, title: prompt })
      .returning();
    return q;
  });
  await renumberQuestions(book.id);
  return NextResponse.json({ question: created });
});
