import { eq } from "drizzle-orm";
import { api, apiUser, HttpError } from "@/lib/api";
import { db } from "@/lib/db";
import { books, photos } from "@/lib/db/schema";
import { getFile } from "@/lib/storage";

export const GET = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, "Не найдено");
  const user = await apiUser(req);
  const [row] = await db
    .select({ photo: photos, ownerId: books.userId })
    .from(photos)
    .innerJoin(books, eq(photos.bookId, books.id))
    .where(eq(photos.id, id));
  if (!row || (row.ownerId !== user.id && user.role !== "admin")) throw new HttpError(404, "Не найдено");
  const size = new URL(req.url).searchParams.get("size") === "full" ? "full" : "thumb";
  const data = await getFile(size === "full" ? row.photo.storageKey : row.photo.thumbKey);
  return new Response(new Uint8Array(data), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=31536000, immutable" },
  });
});
