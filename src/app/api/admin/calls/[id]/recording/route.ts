import { api, apiStaff, HttpError } from "@/server/api";
import { audit, canSeeAssigned } from "@/server/access";
import { TelephonyError } from "@/modules/telephony";
import { container } from "@/server/container";
import { idParams } from "@/server/input";
import { serveFile } from "@/server/range-file";

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
    return serveFile(file.path, file.mime, req, { "Cache-Control": "private, no-cache" });
  }
  let url: string | null;
  try {
    url = await container().telephony.phone.recordingUrl(call);
  } catch (err) {
    if (TelephonyError.is(err)) return new Response(err.message, { status: 502 });
    throw err;
  }
  if (!url) throw new HttpError(404, "notFound");
  // Range плеера передаём провайдеру: перемотка и «метаданные» не тянут запись целиком через наш сервер.
  const range = req.headers.get("range");
  const upstream = await fetch(url, { signal: AbortSignal.timeout(30_000), headers: range && /^bytes=\d*-\d*$/.test(range) ? { Range: range } : {} }).catch(() => null);
  if (!upstream?.ok || !upstream.body) return new Response("Запись недоступна у провайдера", { status: 502 });
  if (firstRequest) await audit(staff, "call.recording", "call", call.id, { phone: call.clientPhone });
  const pass = (name: string) => upstream.headers.get(name);
  return new Response(upstream.body, {
    status: upstream.status === 206 ? 206 : 200,
    headers: {
      "Content-Type": pass("content-type") ?? "audio/mpeg",
      "Cache-Control": "private, no-store",
      "Accept-Ranges": "bytes",
      ...(pass("content-length") ? { "Content-Length": pass("content-length")! } : {}),
      ...(pass("content-range") ? { "Content-Range": pass("content-range")! } : {}),
    },
  });
});
