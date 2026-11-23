import "server-only";
import { createReadStream, promises as fs } from "node:fs";
import { Readable } from "node:stream";
import { countPerf } from "@/shared/infrastructure/perfLog";
import type { StoredFile, StoredFileRequest } from "@/shared/application/StoredFile";
import { viaFilesService } from "@/server/files-service";

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
  countPerf("disk:stream", end - start + 1, 0, partial ? 206 : 200);
  const body = Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream;
  return new Response(body, {
    status: partial ? 206 : 200,
    headers: { ...base, "Content-Length": String(end - start + 1), ...(partial ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}) },
  });
}

/** Заголовки запроса для хранилища (Range, If-None-Match) — передать в фасад модуля, который открывает файл. */
export function storedFileRequest(req: Request): StoredFileRequest {
  return { range: req.headers.get("range"), ifNoneMatch: req.headers.get("if-none-match") };
}

/**
 * Ответ браузеру из файла хранилища потоком (storage.openStoredFile через фасад модуля): 200/206 с Content-Length и
 * Content-Range, 304, 416. headers маршрута (Cache-Control, Content-Disposition, CSP, свой ETag) — поверх.
 * null — файла нет.
 */
export function storedResponse(file: StoredFile | null, mime: string, headers: Record<string, string> = {}): Response | null {
  if (!file) return null;
  if (file.status === 416) return new Response(null, { status: 416, headers: file.contentRange ? { "Content-Range": file.contentRange } : {} });
  const base: Record<string, string> = { "Accept-Ranges": "bytes", ...(file.etag ? { ETag: file.etag } : {}), ...headers };
  // 304 — без Content-Type (RFC 9110 §15.4.5: браузер берёт тип из кэша); так же отвечает mybook-files (net/http Go).
  if (file.status === 304) return new Response(null, { status: 304, headers: base });
  return new Response(file.body, {
    status: file.status,
    headers: { "Content-Type": mime, ...base, ...(file.contentLength !== undefined ? { "Content-Length": String(file.contentLength) } : {}), ...(file.contentRange ? { "Content-Range": file.contentRange } : {}) },
  });
}

/**
 * Файл хранилища по ключу: через Go-сервис mybook-files, если он включён и жив (files-service.ts), иначе потоком сам —
 * open открывает файл через фасад модуля. Права проверяет маршрут до вызова. null — файла нет.
 */
export async function serveStorageFile(key: string, mime: string, req: Request, headers: Record<string, string>, open: (req: StoredFileRequest) => Promise<StoredFile | null>): Promise<Response | null> {
  return (await viaFilesService(key, mime, req, headers)) ?? storedResponse(await open(storedFileRequest(req)), mime, headers);
}
