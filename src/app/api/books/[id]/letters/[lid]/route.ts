import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { api, apiBook, HttpError } from "@/lib/api";
import { db } from "@/lib/db";
import { bookLetters } from "@/lib/db/schema";
import { touchBook } from "@/lib/books";

type Ctx = { params: Promise<{ id: string; lid: string }> };

const schema = z
  .object({
    status: z.enum(["pending", "approved", "hidden"]),
    authorName: z.string().trim().min(1).max(80),
    relation: z.string().trim().max(80),
    text: z.string().trim().min(1).max(8000),
  })
  .partial()
  .strict();

export const PATCH = api(async (req, { params }: Ctx) => {
  const { id, lid } = await params;
  const { book } = await apiBook(req, id, { editable: true });
  const data = schema.parse(await req.json());
  const [row] = await db.update(bookLetters).set(data).where(and(eq(bookLetters.id, lid), eq(bookLetters.bookId, book.id))).returning();
  if (!row) throw new HttpError(404, "Письмо не найдено");
  await touchBook(book.id);
  return NextResponse.json({ letter: row });
});

export const DELETE = api(async (req, { params }: Ctx) => {
  const { id, lid } = await params;
  const { book } = await apiBook(req, id, { editable: true });
  const [row] = await db.delete(bookLetters).where(and(eq(bookLetters.id, lid), eq(bookLetters.bookId, book.id))).returning({ id: bookLetters.id });
  if (!row) throw new HttpError(404, "Письмо не найдено");
  return NextResponse.json({ ok: true });
});
