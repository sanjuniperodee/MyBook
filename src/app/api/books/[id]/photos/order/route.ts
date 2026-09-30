import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { api, apiBook, HttpError } from "@/lib/api";
import { db } from "@/lib/db";
import { photos } from "@/lib/db/schema";

export const PUT = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const { book } = await apiBook(req, id, { editable: true });
  const { ids } = z.object({ ids: z.array(z.string().uuid()).max(500) }).parse(await req.json());
  const existing = await db.select({ id: photos.id }).from(photos).where(and(eq(photos.bookId, book.id), inArray(photos.id, ids)));
  if (existing.length !== ids.length) throw new HttpError(400, "photosOutdated");
  await db.transaction(async (tx) => {
    for (let i = 0; i < ids.length; i++) await tx.update(photos).set({ position: i }).where(eq(photos.id, ids[i]));
  });
  return NextResponse.json({ ok: true });
});
