import "server-only";
import { createPrivateKey, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { connect } from "node:http2";

/**
 * Push на iPhone через APNs напрямую (без Firebase): токен-аутентификация ключом .p8 из кабинета Apple Developer
 * (Keys → Apple Push Notifications service). Нужны: APNS_KEY_ID, APNS_TEAM_ID и сам ключ — APNS_KEY_P8 (текст PEM)
 * или APNS_KEY_FILE (путь к файлу). APNS_TOPIC — идентификатор приложения (по умолчанию kz.mybooks.mybooksSeller).
 * Не заданы — push на телефоны не отправляется, остальное работает как раньше.
 */

export interface ApnsConfig {
  keyId: string;
  teamId: string;
  privateKey: string;
  topic: string;
}

export function apnsConfig(env: Record<string, string | undefined> = process.env): ApnsConfig | null {
  const keyId = env.APNS_KEY_ID?.trim();
  const teamId = env.APNS_TEAM_ID?.trim();
  let key = env.APNS_KEY_P8?.replace(/\\n/g, "\n").trim();
  if (!key && env.APNS_KEY_FILE) {
    try {
      key = readFileSync(env.APNS_KEY_FILE, "utf8").trim();
    } catch {
      return null;
    }
  }
  if (!keyId || !teamId || !key) return null;
  return { keyId, teamId, privateKey: key, topic: env.APNS_TOPIC?.trim() || "kz.mybooks.mybooksSeller" };
}

const b64 = (v: string | Buffer) => Buffer.from(v).toString("base64url");

/** JWT провайдера: ES256, ключ и команда в заголовке и теле. Apple принимает токен до часа и просит не чаще раза в 20 минут. */
export function apnsJwt(cfg: ApnsConfig, nowSec: number): string {
  const head = b64(JSON.stringify({ alg: "ES256", kid: cfg.keyId }));
  const claims = b64(JSON.stringify({ iss: cfg.teamId, iat: nowSec }));
  const signature = sign("sha256", Buffer.from(`${head}.${claims}`), { key: createPrivateKey(cfg.privateKey), dsaEncoding: "ieee-p1363" });
  return `${head}.${claims}.${b64(signature)}`;
}

let cached: { token: string; at: number; keyId: string } | null = null;
const TOKEN_TTL_SEC = 50 * 60;

function providerToken(cfg: ApnsConfig, nowSec = Math.floor(Date.now() / 1000)) {
  if (cached && cached.keyId === cfg.keyId && nowSec - cached.at < TOKEN_TTL_SEC) return cached.token;
  cached = { token: apnsJwt(cfg, nowSec), at: nowSec, keyId: cfg.keyId };
  return cached.token;
}

export interface ApnsMessage {
  title: string;
  body?: string;
  /** Куда ведёт уведомление в CRM (/admin/chats?c=…): приложение открывает диалог или сделку. */
  link?: string | null;
  /** Число на значке приложения. */
  badge?: number;
}

/**
 * Тело push. Служебные ключи (NotificationId, presentAlert…) — чтобы плагин локальных уведомлений в приложении узнал
 * его «своим»: по нажатию приложение получает payload и открывает нужный экран, а на открытом экране система ничего
 * не показывает — приложение рисует свою плашку.
 */
export function apnsBody(m: ApnsMessage) {
  return {
    aps: { alert: { title: m.title.slice(0, 120), body: (m.body ?? "").slice(0, 240) }, sound: "default", ...(m.badge !== undefined ? { badge: m.badge } : {}), "thread-id": "crm" },
    NotificationId: (m.link ?? m.title).split("").reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) | 0, 7) & 0x7fffffff,
    presentAlert: false,
    presentSound: false,
    presentBadge: false,
    presentBanner: false,
    presentList: false,
    payload: m.link ?? "",
  };
}

export type ApnsResult = "sent" | "gone" | "failed";

export interface ApnsTransport {
  post(origin: string, path: string, headers: Record<string, string>, body: string): Promise<{ status: number; body: string }>;
}

/** HTTP/2 к APNs: на каждый запрос своё соединение — уведомления редкие, держать сессию ни к чему. */
export const http2Transport: ApnsTransport = {
  post: (origin, path, headers, body) =>
    new Promise((resolve, reject) => {
      const client = connect(origin);
      const timer = setTimeout(() => {
        client.destroy();
        reject(new Error("APNs timeout"));
      }, 10_000);
      client.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
      const req = client.request({ ":method": "POST", ":path": path, ...headers });
      let status = 0;
      let text = "";
      req.setEncoding("utf8");
      req.on("response", (h) => {
        status = Number(h[":status"]);
      });
      req.on("data", (d: string) => (text += d));
      req.on("end", () => {
        clearTimeout(timer);
        client.close();
        resolve({ status, body: text });
      });
      req.on("error", (err) => {
        clearTimeout(timer);
        client.destroy();
        reject(err);
      });
      req.end(body);
    }),
};

export const APNS_ORIGIN = { production: "https://api.push.apple.com", sandbox: "https://api.sandbox.push.apple.com" } as const;

/**
 * Отправить уведомление на устройство. "gone" — токен больше не действует (приложение удалено, токен от другого
 * окружения): вызывающий удаляет его из базы.
 */
export async function sendApns(cfg: ApnsConfig, device: { token: string; environment: string }, message: ApnsMessage, transport: ApnsTransport = http2Transport): Promise<ApnsResult> {
  const origin = device.environment === "sandbox" ? APNS_ORIGIN.sandbox : APNS_ORIGIN.production;
  try {
    const res = await transport.post(
      origin,
      `/3/device/${device.token}`,
      { authorization: `bearer ${providerToken(cfg)}`, "apns-topic": cfg.topic, "apns-push-type": "alert", "apns-priority": "10", "apns-expiration": String(Math.floor(Date.now() / 1000) + 3600), "content-type": "application/json" },
      JSON.stringify(apnsBody(message)),
    );
    if (res.status === 200) return "sent";
    let reason = "";
    try {
      reason = (JSON.parse(res.body) as { reason?: string }).reason ?? "";
    } catch {}
    if (res.status === 410 || (res.status === 400 && ["BadDeviceToken", "DeviceTokenNotForTopic"].includes(reason))) return "gone";
    console.error("[apns]", res.status, reason);
    return "failed";
  } catch (err) {
    console.error("[apns]", err instanceof Error ? err.message : err);
    return "failed";
  }
}
