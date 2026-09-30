import "server-only";
import { env } from "../env";
import { getSetting } from "./settings";

export class WazzupError extends Error {}

async function config() {
  const [apiKey, baseUrl] = await Promise.all([getSetting("wazzup.apiKey"), getSetting("wazzup.baseUrl")]);
  return { apiKey, baseUrl: (baseUrl || "https://api.wazzup24.com").replace(/\/$/, "") };
}

export async function wazzupConfigured() {
  return !!(await config()).apiKey;
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const { apiKey, baseUrl } = await config();
  if (!apiKey) throw new WazzupError("Wazzup не подключён: укажите API-ключ в разделе «Интеграции»");
  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new WazzupError("Wazzup недоступен, попробуйте ещё раз");
  }
  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const d = (data ?? {}) as Record<string, unknown>;
    const reason = String(d.description ?? d.error ?? d.message ?? `HTTP ${res.status}`);
    throw new WazzupError(res.status === 401 ? "Неверный API-ключ Wazzup" : `Wazzup: ${reason}`);
  }
  return data as T;
}

export interface WazzupChannel {
  channelId: string;
  transport: string;
  plainId: string;
  state: string;
  name?: string;
}

export async function listChannels() {
  const res = await call<WazzupChannel[] | { data: WazzupChannel[] }>("GET", "/v3/channels");
  return Array.isArray(res) ? res : (res.data ?? []);
}

/** Отправка сообщения. Возвращает messageId Wazzup — по нему придут статусы доставки. */
export async function sendWazzupMessage(p: { channelId: string; chatType: string; chatId: string; text: string; crmMessageId: string }) {
  const res = await call<{ messageId?: string }>("POST", "/v3/message", p);
  return res?.messageId ?? null;
}

/** Подписка на вебхуки: адрес с секретным токеном, входящие сообщения и статусы. */
export async function registerWebhook(token: string) {
  const uri = `${env.appUrl}/api/integrations/wazzup?token=${encodeURIComponent(token)}`;
  await call("PATCH", "/v3/webhooks", { webhooksUri: uri, subscriptions: { messagesAndStatuses: true, contactsAndDealsCreation: false } });
  return uri;
}
