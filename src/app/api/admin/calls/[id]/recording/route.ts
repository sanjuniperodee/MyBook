import { api, apiStaff, HttpError } from "@/server/api";
import { audit, canSeeAssigned } from "@/server/access";
import { TelephonyError } from "@/modules/telephony";
import { container } from "@/server/container";
import { idParams } from "@/server/input";
import { createReadStream, promises as fs } from "node:fs";
import { Readable } from "node:stream";

/** Файл записи с диска сайта, с перемоткой: Safari без ответа на Range аудио не играет. */
async function localFile(path: string, mime: string, range: string | null) {
  const { size } = await fs.stat(path);
  const m = range ? /^bytes=(\d*)-(\d*)$/.exec(range) : null;
  let start = 0;
  let end = size - 1;
  if (m && (m[1] || m[2])) {
    if (m[1]) {
      start = Number(m[1]);
      if (m[2]) end = Math.min(Number(m[2]), size - 1);
    } else start = Math.max(0, size - Number(m[2]));
    if (start > end || start >= size) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  }
  const partial = !!m && (start > 0 || end < size - 1 || !!range);
  const body = Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream;
  return new Response(body, {
    status: partial ? 206 : 200,
    headers: {
      "Content-Type": mime,
      "Content-Length": String(end - start + 1),
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, no-store",
      ...(partial ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}),
    },
  });
}

/**
 * Запись разговора через наш сервер: ссылка провайдера не попадает в браузер,
 * а каждое прослушивание остаётся в журнале действий.
 */
export const GET = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const staff = await apiStaff(req, "calls.view", "calls.recordings");
  const { id } = idParams(await params, "id");
  const call = await container().telephony.queries.byId(id);
  if (!call || !canSeeAssigned(staff, call.staffId)) throw new HttpError(404, "notFound");
  // Аудит — только при первом запросе, а не на каждый Range-запрос плеера.
  const firstRequest = !req.headers.get("range") || req.headers.get("range") === "bytes=0-";
  if (call.provider === "whatsapp") {
    let file: { path: string; mime: string } | null;
    try {
      file = await container().telephony.whatsapp.recordingFile(call);
    } catch (err) {
      if (TelephonyError.is(err)) return new Response(err.message, { status: 409 });
      throw err;
    }
    if (!file) throw new HttpError(404, "notFound");
    if (firstRequest) await audit(staff, "call.recording", "call", call.id, { phone: call.clientPhone });
    return localFile(file.path, file.mime, req.headers.get("range"));
  }
  let url: string | null;
  try {
    url = await container().telephony.phone.recordingUrl(call);
  } catch (err) {
    if (TelephonyError.is(err)) return new Response(err.message, { status: 502 });
    throw err;
  }
  if (!url) throw new HttpError(404, "notFound");
  const upstream = await fetch(url, { signal: AbortSignal.timeout(30_000) }).catch(() => null);
  if (!upstream?.ok || !upstream.body) return new Response("Запись недоступна у провайдера", { status: 502 });
  if (firstRequest) await audit(staff, "call.recording", "call", call.id, { phone: call.clientPhone });
  return new Response(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "audio/mpeg",
      "Cache-Control": "private, no-store",
      ...(upstream.headers.get("content-length") ? { "Content-Length": upstream.headers.get("content-length")! } : {}),
    },
  });
});
