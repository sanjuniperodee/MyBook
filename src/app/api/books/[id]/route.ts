import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getOccasion } from "@/lib/occasions";
import { api, apiBook, HttpError } from "@/lib/api";
import { db } from "@/lib/db";
import { books, photos } from "@/lib/db/schema";
import { coverTemplates } from "@/lib/book/covers";
import { formats } from "@/lib/book/formats";
import { typographies } from "@/lib/book/fonts";
import { and } from "drizzle-orm";

const patchSchema = z
  .object({
    title: z.string().trim().max(80),
    subtitle: z.string().trim().max(80),
    authorName: z.string().trim().max(60),
    authorGender: z.enum(["m", "f"]),
    recipientName: z.string().trim().max(60),
    recipientGender: z.enum(["m", "f"]),
    hideRecipientOnCover: z.boolean(),
    coverTemplate: z.string().refine((v) => coverTemplates.some((t) => t.id === v), "Неизвестная обложка"),
    coverPhotoId: z.string().uuid().nullable(),
    backText: z.string().trim().max(400),
    dedication: z.string().trim().max(600),
    typography: z.string().refine((v) => v in typographies, "Неизвестный стиль"),
    format: z.string().refine((v) => v in formats, "Неизвестный формат"),
    photoPlacement: z.enum(["chapters", "end"]),
    showToc: z.boolean(),
    occasion: z.string().refine((v) => !!getOccasion(v), "Неизвестный повод").nullable(),
    occasionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  })
  .partial()
  .strict();

export const PATCH = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const { book } = await apiBook(req, id, { editable: true });
  const data = patchSchema.parse(await req.json());
  if (data.coverPhotoId) {
    const [p] = await db.select({ id: photos.id }).from(photos).where(and(eq(photos.id, data.coverPhotoId), eq(photos.bookId, book.id)));
    if (!p) throw new HttpError(400, "Фото не найдено");
  }
  const [updated] = await db.update(books).set(data).where(eq(books.id, book.id)).returning();
  return NextResponse.json({ book: updated });
});

export const DELETE = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const { book } = await apiBook(req, id, { editable: true });
  const { deletePrefix } = await import("@/lib/storage");
  const { orders } = await import("@/lib/db/schema");
  const [hasOrder] = await db.select({ id: orders.id }).from(orders).where(eq(orders.bookId, book.id)).limit(1);
  if (hasOrder) throw new HttpError(409, "По этой книге есть заказы — удалить её нельзя");
  await db.delete(books).where(eq(books.id, book.id));
  await deletePrefix(`photos/${book.id}`);
  await deletePrefix(`cache/preview/${book.id}`);
  return NextResponse.json({ ok: true });
});
