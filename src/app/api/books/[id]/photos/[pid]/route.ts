import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { api, apiBook, HttpError } from "@/lib/api";
import { db } from "@/lib/db";
import { books, photos } from "@/lib/db/schema";
import { deleteFile } from "@/lib/storage";
import { touchBook } from "@/lib/books";

type Ctx = { params: Promise<{ id: string; pid: string }> };

const schema = z
  .object({
    caption: z.string().trim().max(200),
    layout: z.enum(["full", "bleed", "half"]),
  })
  .partial()
  .strict();

export const PATCH = api(async (req, { params }: Ctx) => {
  const { id, pid } = await params;
  const { book } = await apiBook(req, id, { editable: true });
  const data = schema.parse(await req.json());
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
