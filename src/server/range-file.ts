import "server-only";
import { createReadStream, promises as fs } from "node:fs";
import { Readable } from "node:stream";

/**
 * Файл с диска сайта с перемоткой: Range → 206 (Safari и AVPlayer без него аудио не играют), ETag по размеру и времени —
 * повторное открытие отвечает 304 без тела. Файл не читается в память: идёт потоком, только нужный кусок.
 */
export async function serveFile(path: string, mime: string, req: Request, headers: Record<string, string> = {}): Promise<Response> {
  const { size, mtimeMs } = await fs.stat(path);
  const etag = `"${size.toString(16)}-${Math.floor(mtimeMs).toString(16)}"`;
  const base = { "Content-Type": mime, "Accept-Ranges": "bytes", ETag: etag, ...headers };
  const range = req.headers.get("range");
  // Условный запрос без Range (второе открытие плеера): тело не нужно.
  if (!range && req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: base });

  let start = 0;
  let end = size - 1;
  let partial = false;
  const m = range ? /^bytes=(\d*)-(\d*)$/.exec(range) : null;
  if (m && (m[1] || m[2])) {
    if (m[1]) {
      start = Number(m[1]);
      if (m[2]) end = Math.min(Number(m[2]), size - 1);
    } else start = Math.max(0, size - Number(m[2]));
    if (start > end || start >= size) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    partial = true;
  }
  const body = Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream;
  return new Response(body, {
    status: partial ? 206 : 200,
    headers: { ...base, "Content-Length": String(end - start + 1), ...(partial ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}) },
  });
}
