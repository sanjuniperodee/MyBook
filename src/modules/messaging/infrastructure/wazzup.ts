import "server-only";
import { env } from "@/config/env";
import type { SettingsReader } from "@/shared/application";

export class WazzupError extends Error {}

interface WazzupChannel {
  channelId: string;
  transport: string;
  plainId: string;
  state: string;
  name?: string;
}

/** API Wazzup: ключ и адрес — из «Интеграций». */
export class WazzupClient {
  constructor(private readonly settings: SettingsReader<"wazzup.apiKey" | "wazzup.baseUrl">) {}

  private async config() {
    const [apiKey, baseUrl] = await Promise.all([this.settings.get("wazzup.apiKey"), this.settings.get("wazzup.baseUrl")]);
    return { apiKey, baseUrl: (baseUrl || "https://api.wazzup24.com").replace(/\/$/, "") };
  }

  async configured() {
    return !!(await this.config()).apiKey;
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const { apiKey, baseUrl } = await this.config();
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

  async listChannels() {
    const res = await this.call<WazzupChannel[] | { data: WazzupChannel[] }>("GET", "/v3/channels");
    return Array.isArray(res) ? res : (res.data ?? []);
  }

  /** Отправка сообщения. Возвращает messageId Wazzup — по нему придут статусы доставки. */
  async send(p: { channelId: string; chatType: string; chatId: string; text: string; crmMessageId: string }) {
    const res = await this.call<{ messageId?: string }>("POST", "/v3/message", p);
    return res?.messageId ?? null;
  }

  /** Подписка на вебхуки: адрес с секретным токеном, входящие сообщения и статусы. */
  async registerWebhook(token: string) {
    const uri = `${env.appUrl}/api/integrations/wazzup?token=${encodeURIComponent(token)}`;
    await this.call("PATCH", "/v3/webhooks", { webhooksUri: uri, subscriptions: { messagesAndStatuses: true, contactsAndDealsCreation: false } });
    return uri;
  }
}
