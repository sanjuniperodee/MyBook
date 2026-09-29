import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { api, apiBook, HttpError } from "@/lib/api";
import { db } from "@/lib/db";
import { photos } from "@/lib/db/schema";
import { MAX_UPLOAD_BYTES, processUpload } from "@/lib/images";
import { putFile } from "@/lib/storage";
import { touchBook } from "@/lib/books";
import { rateLimit } from "@/lib/rate-limit";

const MAX_PHOTOS = 120;

export const POST = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const { user, book } = await apiBook(req, id, { editable: true });
  if (!rateLimit(`upload:${user.id}`, 60, 3600_000)) throw new HttpError(429, "Слишком много загрузок подряд. Подождите немного.");
  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) throw new HttpError(400, "Выберите фото");
  const [{ n, maxPos }] = await db
    .select({ n: sql<number>`count(*)::int`, maxPos: sql<number>`coalesce(max(${photos.position}), -1)::int` })
    .from(photos)
    .where(eq(photos.bookId, book.id));
  if (n + files.length > MAX_PHOTOS) throw new HttpError(400, `В книгу можно добавить до ${MAX_PHOTOS} фото`);

  const created = [];
  const errors: string[] = [];
  let position = maxPos + 1;
  for (const file of files) {
    if (file.size > MAX_UPLOAD_BYTES) {
      errors.push(`${file.name}: файл больше 25 МБ`);
      continue;
    }
    try {
      const img = await processUpload(Buffer.from(await file.arrayBuffer()));
      const photoId = crypto.randomUUID();
      const storageKey = `photos/${book.id}/${photoId}.jpg`;
      const thumbKey = `photos/${book.id}/${photoId}_thumb.jpg`;
      await putFile(storageKey, img.full);
      await putFile(thumbKey, img.thumb);
      const [row] = await db
        .insert(photos)
        .values({
          id: photoId,
          bookId: book.id,
          position: position++,
          storageKey,
          thumbKey,
          width: img.width,
          height: img.height,
          layout: img.width > img.height * 1.15 ? "half" : "full",
        })
        .returning();
      created.push(row);
    } catch (err) {
      console.error("[photos] upload failed", err);
      errors.push(`${file.name}: формат не поддерживается`);
    }
  }
  await touchBook(book.id);
  return NextResponse.json({ photos: created, errors });
});
