/**
 * Протоколы АТС без обращения к БД: подпись Zadarma и разбор событий в единый формат.
 * Документация Zadarma: https://zadarma.com/ru/support/api/#api_webhooks
 */
import { createHash, createHmac } from "node:crypto";
import { normalizePhone } from "./phone";

export type CallStage = "start" | "ringing" | "answer" | "end" | "record";

export interface CallEvent {
  provider: string;
  externalId: string;
  stage: CallStage;
  direction: "in" | "out";
  clientPhone: string;
  extension: string | null;
  at: Date;
  durationSec?: number;
  status?: "answered" | "missed" | "busy" | "failed";
  hasRecording?: boolean;
  recordingRef?: string | null;
}

/**
 * Zadarma подписывает как PHP: base64_encode(hash_hmac('sha1', data, secret)) — то есть base64 от HEX-строки,
 * а не от бинарного HMAC. Так же подписываются и запросы к их API.
 */
export function zadarmaSign(data: string, secret: string) {
  return Buffer.from(createHmac("sha1", secret).update(data).digest("hex")).toString("base64");
}

/** Строка, которую Zadarma подписывает для каждого типа события. */
export function zadarmaSignedString(p: Record<string, string>): string | null {
  switch (p.event) {
    case "NOTIFY_START":
    case "NOTIFY_INTERNAL":
    case "NOTIFY_END":
      return `${p.caller_id ?? ""}${p.called_did ?? ""}${p.call_start ?? ""}`;
    case "NOTIFY_ANSWER":
      return `${p.caller_id ?? ""}${p.destination ?? ""}${p.call_start ?? ""}`;
    case "NOTIFY_OUT_START":
    case "NOTIFY_OUT_END":
      return `${p.internal ?? ""}${p.destination ?? ""}${p.call_start ?? ""}`;
    case "NOTIFY_RECORD":
      return `${p.pbx_call_id ?? ""}${p.call_id_with_rec ?? ""}`;
    default:
      return null;
  }
}

/** Время Zadarma — «2026-09-30 14:05:10» в часовом поясе аккаунта; считаем его временем сервера. */
function parseTime(v: string | undefined) {
  if (!v) return new Date();
  const d = new Date(v.replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

export function zadarmaDisposition(d: string | undefined): CallEvent["status"] {
  switch ((d ?? "").toLowerCase()) {
    case "answered":
      return "answered";
    case "busy":
      return "busy";
    case "cancel":
    case "no answer":
      return "missed";
    default:
      return "failed";
  }
}

export function parseZadarmaEvent(p: Record<string, string>): CallEvent | null {
  const externalId = p.pbx_call_id;
  if (!externalId) return null;
  const base = { provider: "zadarma", externalId, at: parseTime(p.call_start) };
  switch (p.event) {
    case "NOTIFY_START":
      return { ...base, stage: "start", direction: "in", clientPhone: normalizePhone(p.caller_id), extension: null };
    case "NOTIFY_INTERNAL":
      return { ...base, stage: "ringing", direction: "in", clientPhone: normalizePhone(p.caller_id), extension: p.internal || null };
    case "NOTIFY_ANSWER":
      return { ...base, stage: "answer", direction: "in", clientPhone: normalizePhone(p.caller_id), extension: p.internal || p.destination || null, at: new Date() };
    case "NOTIFY_END":
    case "NOTIFY_OUT_END": {
      const out = p.event === "NOTIFY_OUT_END";
      let status = zadarmaDisposition(p.disposition);
      // Исходящий без ответа — не «пропущенный», а недозвон.
      if (out && status === "missed") status = "failed";
      return {
        ...base,
        stage: "end",
        direction: out ? "out" : "in",
        clientPhone: normalizePhone(out ? p.destination : p.caller_id),
        extension: p.internal || null,
        durationSec: Math.max(0, Number(p.duration) || 0),
        status,
        hasRecording: p.is_recorded === "1",
        recordingRef: p.call_id_with_rec || null,
      };
    }
    case "NOTIFY_OUT_START":
      return { ...base, stage: "start", direction: "out", clientPhone: normalizePhone(p.destination), extension: p.internal || null };
    case "NOTIFY_RECORD":
      return { ...base, stage: "record", direction: "in", clientPhone: "", extension: null, hasRecording: true, recordingRef: p.call_id_with_rec || null };
    default:
      return null;
  }
}

/** Подпись запроса к API Zadarma: method + params + md5(params), params — отсортированный query string. */
export function zadarmaRequestAuth(method: string, params: Record<string, string>, key: string, secret: string) {
  const query = Object.keys(params)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k]).replace(/%20/g, "+")}`)
    .join("&");
  const md5 = createHash("md5").update(query).digest("hex");
  return { query, authorization: `${key}:${zadarmaSign(`${method}${query}${md5}`, secret)}` };
}

/**
 * Универсальный вебхук для любой АТС (Asterisk, Битрикс-коннекторы, Mango через прокси и т.п.):
 * { event: "start"|"answer"|"end"|"record", callId, direction: "in"|"out", phone, extension?, status?, duration?, recordingUrl? }
 */
export function parseGenericEvent(b: Record<string, unknown>): CallEvent | null {
  const s = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
  const stage = s(b.event) as CallStage;
  const externalId = s(b.callId);
  if (!externalId || !["start", "ringing", "answer", "end", "record"].includes(stage)) return null;
  const direction = s(b.direction) === "out" ? "out" : "in";
  const rawStatus = s(b.status);
  const status = (["answered", "missed", "busy", "failed"] as const).find((x) => x === rawStatus);
  const recordingUrl = s(b.recordingUrl);
  return {
    provider: "pbx",
    externalId: externalId.slice(0, 100),
    stage,
    direction,
    clientPhone: normalizePhone(s(b.phone)),
    extension: s(b.extension) || null,
    at: new Date(),
    durationSec: Math.max(0, Number(b.duration) || 0),
    status: stage === "end" ? (status ?? (Number(b.duration) > 0 ? "answered" : direction === "in" ? "missed" : "failed")) : undefined,
    hasRecording: !!recordingUrl,
    recordingRef: /^https?:\/\//.test(recordingUrl) ? recordingUrl : null,
  };
}
