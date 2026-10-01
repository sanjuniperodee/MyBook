import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { api, apiUser, HttpError } from "@/lib/api";
import { isStaff } from "@/server/auth";
import { db } from "@/lib/db";
import { books, photos } from "@/lib/db/schema";
import { getFile } from "@/lib/storage";

export const GET = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, "notFound");
  const user = await apiUser(req);
  const [row] = await db
    .select({ photo: photos, ownerId: books.userId })
    .from(photos)
    .innerJoin(books, eq(photos.bookId, books.id))
    .where(eq(photos.id, id));
  if (!row || (row.ownerId !== user.id && !isStaff(user))) throw new HttpError(404, "notFound");
  const size = new URL(req.url).searchParams.get("size") === "full" ? "full" : "thumb";
  const key = size === "full" ? row.photo.storageKey : row.photo.thumbKey;
  // Файл может смениться (поворот), поэтому кэш проверяется по ключу хранилища.
  const etag = `"${createHash("sha1").update(key).digest("hex").slice(0, 16)}"`;
  const headers = { "Content-Type": "image/jpeg", "Cache-Control": "private, no-cache", ETag: etag };
  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  const data = await getFile(key);
  return new Response(new Uint8Array(data), { headers });
});
