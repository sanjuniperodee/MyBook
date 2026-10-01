import "server-only";
import { getSetting } from "@/modules/workspace";
import { zadarmaRequestAuth } from "@/modules/telephony/domain/protocol";
import type { TelephonyProvider } from "../application";
import { TelephonyError } from "../domain";

async function zadarma<T>(path: string, params: Record<string, string>): Promise<T> {
  const [key, secret, base] = await Promise.all([getSetting("zadarma.key"), getSetting("zadarma.secret"), getSetting("zadarma.baseUrl")]);
  if (!key || !secret) throw new TelephonyError("notConfigured", "Zadarma не подключена: укажите ключи в разделе «Интеграции»");
  const { query, authorization } = zadarmaRequestAuth(path, params, key, secret);
  let res: Response;
  try {
    res = await fetch(`${(base || "https://api.zadarma.com").replace(/\/$/, "")}${path}?${query}`, { headers: { Authorization: authorization }, signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new TelephonyError("provider", "Zadarma недоступна, попробуйте ещё раз");
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || data.status === "error") throw new TelephonyError("provider", `Zadarma: ${String(data.message ?? `HTTP ${res.status}`)}`);
  return data as T;
}

/** API Zadarma: обратный звонок, ключ WebRTC, временные ссылки на записи. */
export const zadarmaProvider: TelephonyProvider = {
  provider: async () => (await getSetting("telephony.provider")) as "off" | "zadarma" | "pbx",
  callback: async (from, to) => void (await zadarma("/v1/request/callback/", { from, to })),
  async webphoneSettings() {
    const [enabled, pbxId] = await Promise.all([getSetting("zadarma.webphone"), getSetting("zadarma.pbxId")]);
    return { enabled: enabled === "on", pbxId: pbxId ?? "" };
  },
  webrtcKey: async (sip) => (await zadarma<{ key?: string }>("/v1/webrtc/get_key/", { sip })).key ?? null,
  async recordingLink(call) {
    const res = await zadarma<{ link?: string; links?: string[] }>("/v1/pbx/record/request/", call.recordingRef ? { call_id: call.recordingRef, lifetime: "600" } : { pbx_call_id: call.externalId, lifetime: "600" });
    return res.link ?? res.links?.[0] ?? null;
  },
};
