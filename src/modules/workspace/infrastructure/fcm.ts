import "server-only";
import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";

/**
 * Push на Android через Firebase Cloud Messaging (HTTP v1) без SDK: сервисный аккаунт проекта Firebase подписывает JWT,
 * Google меняет его на токен доступа (час), им шлются сообщения. Нужен ключ сервисного аккаунта — FCM_SERVICE_ACCOUNT_FILE
 * (путь к JSON) или FCM_SERVICE_ACCOUNT (сам JSON одной строкой). Приложению для получения токена нужны ещё данные
 * Android-приложения из консоли Firebase — FCM_ANDROID_APP_ID и FCM_API_KEY (их сервер отдаёт телефону, пересборка не нужна).
 * Не заданы — push на Android не отправляется, остальное работает как раньше.
 */

export interface FcmConfig {
  projectId: string;
  clientEmail: string;
  privateKey: string;
  /** Номер проекта (sender id) — из FCM_SENDER_ID или из app id «1:<номер>:android:…». */
  senderId: string;
  /** Для телефона: id Android-приложения и ключ API из google-services.json. */
  androidAppId: string;
  apiKey: string;
}

export function fcmConfig(env: Record<string, string | undefined> = process.env): FcmConfig | null {
  let raw = env.FCM_SERVICE_ACCOUNT?.trim();
  if (!raw && env.FCM_SERVICE_ACCOUNT_FILE) {
    try {
      raw = readFileSync(env.FCM_SERVICE_ACCOUNT_FILE, "utf8");
    } catch {
      return null;
    }
  }
  if (!raw) return null;
  let sa: { project_id?: string; client_email?: string; private_key?: string };
  try {
    sa = JSON.parse(raw) as typeof sa;
  } catch {
    return null;
  }
  const androidAppId = env.FCM_ANDROID_APP_ID?.trim() ?? "";
  const apiKey = env.FCM_API_KEY?.trim() ?? "";
  const projectId = env.FCM_PROJECT_ID?.trim() || sa.project_id || "";
  if (!projectId || !sa.client_email || !sa.private_key || !androidAppId || !apiKey) return null;
  const senderId = env.FCM_SENDER_ID?.trim() || androidAppId.split(":")[1] || "";
  return { projectId, clientEmail: sa.client_email, privateKey: sa.private_key.replace(/\\n/g, "\n"), senderId, androidAppId, apiKey };
}

/** То, что телефону нужно для FirebaseApp.initializeApp: секретов тут нет (те же значения лежат в любом APK). */
export function fcmClientOptions(cfg: FcmConfig | null) {
  return cfg ? { apiKey: cfg.apiKey, appId: cfg.androidAppId, projectId: cfg.projectId, senderId: cfg.senderId } : null;
}

const b64 = (v: string | Buffer) => Buffer.from(v).toString("base64url");

/** JWT сервисного аккаунта для обмена на токен доступа (RS256, scope firebase.messaging, час). */
export function fcmAssertion(cfg: Pick<FcmConfig, "clientEmail" | "privateKey">, nowSec: number): string {
  const head = b64(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64(JSON.stringify({ iss: cfg.clientEmail, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: "https://oauth2.googleapis.com/token", iat: nowSec, exp: nowSec + 3600 }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${head}.${claims}`);
  return `${head}.${claims}.${b64(signer.sign(cfg.privateKey))}`;
}

let cached: { token: string; until: number; email: string } | null = null;

async function accessToken(cfg: FcmConfig, fetcher: typeof fetch): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.email === cfg.clientEmail && cached.until > now + 60) return cached.token;
  const res = await fetcher("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: fcmAssertion(cfg, now) }),
    signal: AbortSignal.timeout(10_000),
  });
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !data.access_token) throw new Error(`FCM token ${res.status} ${data.error ?? ""}`.trim());
  cached = { token: data.access_token, until: now + (data.expires_in ?? 3600), email: cfg.clientEmail };
  return data.access_token;
}

export interface FcmMessage {
  title: string;
  body?: string;
  link?: string | null;
  /** Одно уведомление на объект: новое о том же чате заменяет прежнее; по нему же приложение убирает прочитанное. */
  tag?: string;
  kind?: string;
  badge?: number;
  /** Дополнительные поля data (например, bookId, orderId для навигации по тапу в клиентском приложении). */
  data?: Record<string, string | undefined>;
}

/**
 * Тело сообщения FCM. Только data (без notification): уведомление рисует приложение (MybooksMessagingService) — со своим
 * каналом, тегом (прочитанный чат убирается из шторки) и ссылкой для открытия нужного экрана; высокий приоритет будит
 * телефон и при закрытом приложении.
 */
export function fcmBody(token: string, m: FcmMessage) {
  const extra: Record<string, string> = {};
  if (m.data) {
    for (const [k, v] of Object.entries(m.data)) if (v !== undefined && v !== "") extra[k] = v;
  }
  return {
    message: {
      token,
      android: { priority: "HIGH", ttl: "3600s", ...(m.tag ? { collapse_key: m.tag.slice(0, 64) } : {}) },
      data: { ...extra, title: m.title.slice(0, 120), body: (m.body ?? "").slice(0, 240), link: m.link ?? "", tag: m.tag ?? "", kind: m.kind ?? "", badge: String(m.badge ?? 0) },
    },
  };
}

export type FcmResult = "sent" | "gone" | "failed";

/** Отправить на одно устройство. "gone" — токен больше не действует (приложение удалено): вызывающий удаляет его. */
export async function sendFcm(cfg: FcmConfig, token: string, m: FcmMessage, fetcher: typeof fetch = fetch): Promise<FcmResult> {
  try {
    const res = await fetcher(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(cfg.projectId)}/messages:send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${await accessToken(cfg, fetcher)}`, "Content-Type": "application/json" },
      body: JSON.stringify(fcmBody(token, m)),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return "sent";
    const text = await res.text().catch(() => "");
    if (res.status === 404 || /UNREGISTERED|registration-token-not-registered/.test(text) || (res.status === 400 && /INVALID_ARGUMENT/.test(text) && /token/i.test(text))) return "gone";
    console.error("[fcm]", res.status, text.slice(0, 300));
    return "failed";
  } catch (err) {
    console.error("[fcm]", err instanceof Error ? err.message : err);
    return "failed";
  }
}
