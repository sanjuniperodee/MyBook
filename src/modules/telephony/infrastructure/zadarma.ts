import "server-only";
import type { SettingsReader } from "@/shared/application";
import { zadarmaRequestAuth } from "@/modules/telephony/domain/protocol";
import type { TelephonyProvider } from "../application";
import { TelephonyError } from "../domain";

/** Настройки CRM, которые читает телефония: выбранная АТС, ключи Zadarma и веб-телефон. */
export type TelephonySettingKey = "telephony.provider" | "zadarma.key" | "zadarma.secret" | "zadarma.baseUrl" | "zadarma.webphone" | "zadarma.pbxId";
type Settings = SettingsReader<TelephonySettingKey>;

async function zadarma<T>(settings: Settings, path: string, params: Record<string, string>): Promise<T> {
  const [key, secret, base] = await Promise.all([settings.get("zadarma.key"), settings.get("zadarma.secret"), settings.get("zadarma.baseUrl")]);
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
export const zadarmaProvider = (settings: Settings): TelephonyProvider => ({
  provider: async () => (await settings.get("telephony.provider")) as "off" | "zadarma" | "pbx",
  callback: async (from, to) => void (await zadarma(settings, "/v1/request/callback/", { from, to })),
  async webphoneSettings() {
    const [enabled, pbxId] = await Promise.all([settings.get("zadarma.webphone"), settings.get("zadarma.pbxId")]);
    return { enabled: enabled === "on", pbxId: pbxId ?? "" };
  },
  webrtcKey: async (sip) => (await zadarma<{ key?: string }>(settings, "/v1/webrtc/get_key/", { sip })).key ?? null,
  async recordingLink(call) {
    const res = await zadarma<{ link?: string; links?: string[] }>(settings, "/v1/pbx/record/request/", call.recordingRef ? { call_id: call.recordingRef, lifetime: "600" } : { pbx_call_id: call.externalId, lifetime: "600" });
    return res.link ?? res.links?.[0] ?? null;
  },
});
