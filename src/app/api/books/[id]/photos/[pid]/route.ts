import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { api, apiBook, HttpError } from "@/lib/api";
import { db } from "@/lib/db";
import { bookQuestions, books, photos } from "@/lib/db/schema";
import { deleteFile } from "@/lib/storage";
import { touchBook } from "@/lib/books";
import { normalizeStyle } from "@/lib/book/inline-photo";

type Ctx = { params: Promise<{ id: string; pid: string }> };

const schema = z
  .object({
    caption: z.string().trim().max(200),
    layout: z.enum(["full", "bleed", "half"]),
    questionId: z.string().uuid().nullable(),
    inline: z
      .object({
        width: z.number().min(25).max(100),
        align: z.enum(["left", "center", "right"]),
        anchor: z.number().int().min(-1).max(10_000).nullable(),
        aspect: z.enum(["original", "1:1", "4:3", "3:4", "16:9"]),
        focusX: z.number().min(0).max(1),
        focusY: z.number().min(0).max(1),
        frame: z.enum(["none", "line", "polaroid", "round"]),
      })
      .strict()
      .nullable(),
  })
  .partial()
  .strict();

export const PATCH = api(async (req, { params }: Ctx) => {
  const { id, pid } = await params;
  const { book } = await apiBook(req, id, { editable: true });
  const data = schema.parse(await req.json());
  if (data.questionId) {
    const [q] = await db.select({ id: bookQuestions.id }).from(bookQuestions).where(and(eq(bookQuestions.id, data.questionId), eq(bookQuestions.bookId, book.id)));
    if (!q) throw new HttpError(400, "Вопрос не найден");
  }
  if (data.inline) data.inline = normalizeStyle(data.inline);
  const [row] = await db.update(photos).set(data).where(and(eq(photos.id, pid), eq(photos.bookId, book.id))).returning();
  if (!row) throw new HttpError(404, "Фото не найдено");
  await touchBook(book.id);
  return NextResponse.json({ photo: row });
});

export const DELETE = api(async (req, { params }: Ctx) => {
  const { id, pid } = await params;
  const { book } = await apiBook(req, id, { editable: true });
  const [row] = await db.delete(photos).where(and(eq(photos.id, pid), eq(photos.bookId, book.id))).returning();
  if (!row) throw new HttpError(404, "Фото не найдено");
  if (book.coverPhotoId === row.id) await db.update(books).set({ coverPhotoId: null }).where(eq(books.id, book.id));
  await Promise.all([deleteFile(row.storageKey), deleteFile(row.thumbKey)]);
  await touchBook(book.id);
  return NextResponse.json({ ok: true });
});
