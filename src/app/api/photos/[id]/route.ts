import { createHash } from "node:crypto";
import { api, apiViewer, HttpError } from "@/server/api";
import { container } from "@/server/container";

export const GET = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const { viewer } = await apiViewer(req);
  const photo = await container().authoring.queries.photoFor(id, viewer);
  if (!photo) throw new HttpError(404, "notFound");
  const param = new URL(req.url).searchParams.get("size");
  const size = param === "full" || param === "view" ? param : "thumb";
  const key = size === "thumb" ? photo.thumbKey : photo.storageKey;
  // Файл может смениться (поворот), поэтому кэш проверяется по ключу хранилища.
  const etag = `"${createHash("sha1").update(`${size}:${key}`).digest("hex").slice(0, 16)}"`;
  // «view» запрашивается пачкой (3D-книга снимает одно фото на несколько сторон) — минуты кэша убирают повторные загрузки.
  const headers = { "Content-Type": "image/jpeg", "Cache-Control": size === "view" ? "private, max-age=60, must-revalidate" : "private, no-cache", ETag: etag };
  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  const data = size === "view" ? await container().authoring.photoViewFile(key) : await container().authoring.photoFile(key);
  return new Response(new Uint8Array(data), { headers });
});
