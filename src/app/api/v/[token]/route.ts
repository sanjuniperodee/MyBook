import { HttpError, api } from "@/server/api";
import { findByToken, mediaMime, mediaPath, posterPath } from "@/server/answerFiles";
import { serveFile } from "@/server/range-file";
import { FILE_TOKEN } from "@/lib/book/answer-files";

/**
 * Свой файл по QR-коду из книги — без входа, по секретной ссылке: видео или аудио с перемоткой (Range), ?poster=1 — кадр
 * обложки, ?download=1 — скачать. Ссылка не меняется, поэтому браузеру можно кэшировать надолго.
 */
export const GET = api(async (req, { params }: { params: Promise<{ token: string }> }) => {
  const { token } = await params;
  if (!FILE_TOKEN.test(token)) throw new HttpError(404, "fileNotFound");
  const file = await findByToken(token);
  if (!file || file.status !== "ready") throw new HttpError(404, "fileNotFound");
  const q = new URL(req.url).searchParams;
  const headers: Record<string, string> = { "Cache-Control": "public, max-age=604800", "X-Robots-Tag": "noindex", "Cross-Origin-Resource-Policy": "same-site" };
  if (q.get("poster")) {
    if (!file.hasPoster) throw new HttpError(404, "fileNotFound");
    return serveFile(posterPath(file), "image/jpeg", req, headers);
  }
  const ext = file.kind === "video" ? "mp4" : "m4a";
  if (q.get("download")) headers["Content-Disposition"] = `attachment; filename="mybooks-${token}.${ext}"`;
  return serveFile(mediaPath(file), mediaMime(file.kind), req, headers).catch(() => {
    throw new HttpError(404, "fileNotFound");
  });
});
