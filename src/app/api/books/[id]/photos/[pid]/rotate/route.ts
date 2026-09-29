import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import sharp from "sharp";
import { api, apiBook, HttpError } from "@/lib/api";
import { db } from "@/lib/db";
import { photos } from "@/lib/db/schema";
import { deleteFile, getFile, putFile } from "@/lib/storage";
import { touchBook } from "@/lib/books";

type Ctx = { params: Promise<{ id: string; pid: string }> };

/** Поворачивает сам файл на 90° по часовой стрелке (и превью), точка фокуса поворачивается вместе с ним. */
export const POST = api(async (req, { params }: Ctx) => {
  const { id, pid } = await params;
  const { book } = await apiBook(req, id, { editable: true });
  const [photo] = await db.select().from(photos).where(and(eq(photos.id, pid), eq(photos.bookId, book.id)));
  if (!photo) throw new HttpError(404, "Фото не найдено");
  const [full, thumb] = await Promise.all([getFile(photo.storageKey), getFile(photo.thumbKey)]);
  const [fullOut, thumbOut] = await Promise.all([
    sharp(full).rotate(90).jpeg({ quality: 92, mozjpeg: true, chromaSubsampling: "4:4:4" }).toBuffer(),
    sharp(thumb).rotate(90).jpeg({ quality: 82, mozjpeg: true }).toBuffer(),
  ]);
  // Новые ключи — чтобы браузер и кэш предпросмотра не показали старую ориентацию.
  const rev = crypto.randomUUID().slice(0, 8);
  const storageKey = `photos/${book.id}/${photo.id}_${rev}.jpg`;
  const thumbKey = `photos/${book.id}/${photo.id}_${rev}_thumb.jpg`;
  await Promise.all([putFile(storageKey, fullOut), putFile(thumbKey, thumbOut)]);
  const inline = photo.inline ? { ...photo.inline, focusX: 1 - photo.inline.focusY, focusY: photo.inline.focusX } : photo.inline;
  const [row] = await db
    .update(photos)
    .set({ storageKey, thumbKey, width: photo.height, height: photo.width, inline })
    .where(eq(photos.id, photo.id))
    .returning();
  await Promise.all([deleteFile(photo.storageKey), deleteFile(photo.thumbKey)]).catch(() => {});
  await touchBook(book.id);
  return NextResponse.json({ photo: row });
});
