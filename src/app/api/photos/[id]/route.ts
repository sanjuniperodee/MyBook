import { createHash } from "node:crypto";
import { api, apiViewer, HttpError } from "@/server/api";
import { container } from "@/server/container";

export const GET = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const { viewer } = await apiViewer(req);
  const photo = await container().authoring.queries.photoFor(id, viewer);
  if (!photo) throw new HttpError(404, "notFound");
  const size = new URL(req.url).searchParams.get("size") === "full" ? "full" : "thumb";
  const key = size === "full" ? photo.storageKey : photo.thumbKey;
  // Файл может смениться (поворот), поэтому кэш проверяется по ключу хранилища.
  const etag = `"${createHash("sha1").update(key).digest("hex").slice(0, 16)}"`;
  const headers = { "Content-Type": "image/jpeg", "Cache-Control": "private, no-cache", ETag: etag };
  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  const data = await container().authoring.photoFile(key);
  return new Response(new Uint8Array(data), { headers });
});
