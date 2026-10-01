import { api, apiStaff, HttpError } from "@/lib/api";
import { audit, canSeeAssigned } from "@/server/access";
import { TelephonyError } from "@/modules/telephony";
import { container } from "@/server/container";

/**
 * Запись разговора через наш сервер: ссылка провайдера не попадает в браузер,
 * а каждое прослушивание остаётся в журнале действий.
 */
export const GET = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const staff = await apiStaff(req, "calls.view", "calls.recordings");
  const { id } = await params;
  const call = await container().telephony.queries.byId(id);
  if (!call || !canSeeAssigned(staff, call.staffId)) throw new HttpError(404, "notFound");
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
  // Аудит — только при первом запросе, а не на каждый Range-запрос плеера.
  if (!req.headers.get("range") || req.headers.get("range") === "bytes=0-") await audit(staff, "call.recording", "call", call.id, { phone: call.clientPhone });
  return new Response(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "audio/mpeg",
      "Cache-Control": "private, no-store",
      ...(upstream.headers.get("content-length") ? { "Content-Length": upstream.headers.get("content-length")! } : {}),
    },
  });
});
