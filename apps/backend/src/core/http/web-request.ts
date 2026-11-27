import type { FastifyRequest } from "fastify";

/**
 * Собирает стандартный Web `Request` из `FastifyRequest` — для обработчиков старого сайта (`boardsApi`, мост
 * контекста 7B): GET без тела, сырые байты тела как пришли (JSON, form-urlencoded, text — подписи вебхуков сходятся) и
 * multipart/form-data (файлы — заново собранной формой; граница у неё своя).
 */
export async function buildWebRequest(req: FastifyRequest, raw: Buffer, appUrl: string): Promise<Request> {
  const url = new URL(req.url, appUrl).toString();
  const headers = new Headers();
  const isMultipart = req.isMultipart();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    const lower = key.toLowerCase();
    if (isMultipart && (lower === "content-type" || lower === "content-length")) continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else {
      headers.set(key, value);
    }
  }
  if (req.method === "GET" || req.method === "HEAD") {
    return new Request(url, { method: req.method, headers });
  }
  if (isMultipart) {
    const form = new FormData();
    for await (const part of req.parts()) {
      if (part.type === "file") {
        const data = await part.toBuffer();
        form.append(part.fieldname, new File([new Uint8Array(data)], part.filename || "file", { type: part.mimetype || "application/octet-stream" }));
      } else {
        form.append(part.fieldname, typeof part.value === "string" ? part.value : String(part.value ?? ""));
      }
    }
    return new Request(url, { method: req.method, headers, body: form });
  }
  return new Request(url, {
    method: req.method,
    headers,
    body: raw.length > 0 ? new Uint8Array(raw) : undefined,
  });
}
