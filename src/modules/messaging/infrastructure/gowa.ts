import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { gowaJid } from "../domain/gowa";

const GOWA_ERROR = Symbol.for("mybook.gowa-error");

/** Ошибка шлюза с понятным сотруднику текстом. Проверка — GowaError.is(): классы в разных слоях бандла Next.js разные. */
export class GowaError extends Error {
  readonly [GOWA_ERROR] = true;
  constructor(
    message: string,
    /** Код ошибки шлюза (DEVICE_NOT_FOUND, INVALID_JID…), если он его прислал. */
    readonly code: string | null = null,
  ) {
    super(message);
  }
  static is(err: unknown): err is GowaError {
    return typeof err === "object" && err !== null && (err as Record<symbol, unknown>)[GOWA_ERROR] === true;
  }
}

export interface GowaConfig {
  baseUrl: string;
  /** «логин:пароль» из APP_BASIC_AUTH шлюза; пусто — без авторизации (только во внутренней сети). */
  basicAuth: string;
}

/** Куда шлюз шлёт события номера магазина и чем их подписывает. */
export interface GowaWebhook {
  url: string;
  secret: string;
}

/** Подключение номера магазина: привязан ли он и какой номер. */
export interface GowaStatus {
  reachable: boolean;
  /** Устройство магазина заведено в шлюзе, и его события идут на сайт. */
  registered: boolean;
  connected: boolean;
  loggedIn: boolean;
  /** Номер магазина (77011234567), пока номер привязан. */
  phone: string;
  /** Что мешает работе, — текстом для сотрудника; null — всё в порядке или номер просто не привязан. */
  problem: string | null;
}

/**
 * Устройство магазина в шлюзе. С GOWA v8 каждый номер — отдельное «устройство» со своим вебхуком, и запросы к номеру
 * адресуются заголовком X-Device-Id: так сайт сам настраивает шлюз, без переменных окружения на его стороне.
 */
export const GOWA_DEVICE = "mybooks";
/** События, которые нужны CRM: сообщения и отметки о доставке. */
const WEBHOOK_EVENTS = "message,message.ack";

type Method = "GET" | "POST" | "PATCH";

/**
 * HTTP-клиент GOWA — go-whatsapp-web-multidevice (docs/openapi.yaml): устройство и вебхук, отправка, вход по QR или коду,
 * состояние, файлы. Шлюз держит сессию WhatsApp номера магазина, поэтому доступен только из внутренней сети и под логином.
 */
export class GowaClient {
  constructor(
    private readonly config: () => Promise<GowaConfig>,
    private readonly fetchImpl: typeof fetch = (...args) => fetch(...args),
  ) {}

  /**
   * Завести устройство магазина в шлюзе (или обновить его) и направить его события на сайт с нашей подписью.
   * Повторный вызов безопасен — так же меняется адрес сайта или секрет.
   */
  async connect(hook: GowaWebhook): Promise<void> {
    const config = { webhook_url: hook.url, webhook_secret: hook.secret, webhook_events: WEBHOOK_EVENTS };
    const list = await this.json<{ results?: { id?: string }[] | null }>("GET", "/devices");
    if ((list.results ?? []).some((d) => d.id === GOWA_DEVICE)) await this.json("PATCH", `/devices/${GOWA_DEVICE}/webhook`, config);
    else await this.json("POST", "/devices", { device_id: GOWA_DEVICE, ...config });
  }

  /** Отправить текст собеседнику. Возвращает id сообщения — по нему придут статусы доставки. */
  async sendText(chatId: string, text: string): Promise<string | null> {
    const res = await this.json<{ results?: { message_id?: string } }>("POST", "/send/message", { phone: gowaJid(chatId), message: text });
    return res.results?.message_id ?? null;
  }

  async status(): Promise<GowaStatus> {
    const off = { registered: false, connected: false, loggedIn: false, phone: "" };
    try {
      const res = await this.json<{ results?: { is_connected?: boolean; is_logged_in?: boolean; jid?: string } }>("GET", "/app/status");
      const r = res.results ?? {};
      return { reachable: true, registered: true, connected: !!r.is_connected, loggedIn: !!r.is_logged_in, phone: (r.jid ?? "").split("@")[0].split(":")[0], problem: null };
    } catch (err) {
      if (!GowaError.is(err) || err.code === "UNREACHABLE") return { reachable: false, ...off, problem: "Шлюз WhatsApp недоступен — проверьте адрес и что шлюз запущен" };
      if (err.code === "DEVICE_NOT_FOUND" || err.code === "DEVICE_ID_REQUIRED") return { reachable: true, ...off, problem: null };
      return { reachable: true, ...off, problem: err.message };
    }
  }

  /** QR для привязки номера (WhatsApp → Связанные устройства): картинка data-URL и сколько секунд она действует. */
  async loginQr(): Promise<{ image: string; seconds: number }> {
    const res = await this.json<{ results?: { qr_link?: string; qr_duration?: number } }>("GET", "/app/login");
    const link = res.results?.qr_link;
    if (!link) throw new GowaError("Шлюз не выдал QR — возможно, номер уже привязан");
    // Ссылка указывает на сам шлюз (внутренний адрес): забираем картинку сервером и отдаём в админку готовой.
    const { baseUrl } = await this.config();
    const path = new URL(link, baseUrl).pathname;
    const png = await this.raw(path);
    return { image: `data:image/png;base64,${Buffer.from(await png.arrayBuffer()).toString("base64")}`, seconds: res.results?.qr_duration ?? 30 };
  }

  /** Привязка по коду вместо QR: код вводится в WhatsApp на телефоне магазина. */
  async loginCode(phone: string): Promise<string> {
    const res = await this.json<{ results?: { pair_code?: string } }>("GET", `/app/login-with-code?phone=${encodeURIComponent(phone)}`);
    if (!res.results?.pair_code) throw new GowaError("Шлюз не выдал код привязки");
    return res.results.pair_code;
  }

  /** Отвязать номер: сессия WhatsApp удаляется, устройство и его вебхук остаются — номер можно привязать заново. */
  async logout() {
    await this.json("POST", `/devices/${GOWA_DEVICE}/logout`);
  }

  /** Файл вложения, скачанный шлюзом (statics/media/…), — для прокси в CRM. */
  async media(path: string): Promise<Response> {
    if (!/^statics\/media\/[\w.\-]+$/.test(path)) throw new GowaError("Неверный путь к файлу");
    return this.raw(`/${path}`);
  }

  /** Личные и групповые чаты номера магазина из хранилища шлюза (jid и время последнего сообщения), постранично. */
  async chats(offset: number, limit: number): Promise<{ chats: { jid: string; lastMessageAt: string }[]; total: number }> {
    const res = await this.json<{ results?: { data?: { jid?: string; last_message_time?: string }[] | null; pagination?: { total?: number } } }>("GET", `/chats?limit=${limit}&offset=${offset}`);
    const data = res.results?.data ?? [];
    return { chats: data.flatMap((c) => (c.jid ? [{ jid: c.jid, lastMessageAt: c.last_message_time ?? "" }] : [])), total: res.results?.pagination?.total ?? 0 };
  }

  /** Сообщения чата из хранилища шлюза (сырые записи — разбирает parseGowaHistory), постранично. */
  async chatMessages(jid: string, offset: number, limit: number): Promise<{ messages: unknown[]; total: number }> {
    const res = await this.json<{ results?: { data?: unknown[] | null; pagination?: { total?: number } } }>("GET", `/chat/${encodeURIComponent(jid)}/messages?limit=${limit}&offset=${offset}`);
    return { messages: res.results?.data ?? [], total: res.results?.pagination?.total ?? 0 };
  }

  // ─── внутреннее ──────────────────────────────────────────────────────────

  private async headers(): Promise<Record<string, string>> {
    const { basicAuth } = await this.config();
    return { "X-Device-Id": GOWA_DEVICE, ...(basicAuth ? { Authorization: `Basic ${Buffer.from(basicAuth).toString("base64")}` } : {}) };
  }

  private async raw(path: string): Promise<Response> {
    const { baseUrl } = await this.config();
    let res: Response;
    try {
      res = await this.fetchImpl(`${baseUrl.replace(/\/+$/, "")}${path}`, { headers: await this.headers(), signal: AbortSignal.timeout(20_000) });
    } catch {
      throw new GowaError("Шлюз WhatsApp (GOWA) недоступен", "UNREACHABLE");
    }
    if (!res.ok) throw new GowaError(res.status === 401 ? "Шлюз WhatsApp не принял логин и пароль" : `Шлюз WhatsApp: HTTP ${res.status}`);
    return res;
  }

  private async json<T>(method: Method, path: string, body?: unknown): Promise<T> {
    const { baseUrl } = await this.config();
    let res: Response;
    try {
      res = await this.fetchImpl(`${baseUrl.replace(/\/+$/, "")}${path}`, {
        method,
        headers: { ...(await this.headers()), ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new GowaError("Шлюз WhatsApp (GOWA) недоступен", "UNREACHABLE");
    }
    const text = await res.text();
    let data: Record<string, unknown> = {};
    try {
      data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      data = {};
    }
    if (!res.ok) {
      const code = typeof data.code === "string" ? data.code : null;
      if (res.status === 401) throw new GowaError("Шлюз WhatsApp не принял логин и пароль", code ?? "UNAUTHORIZED");
      throw new GowaError(`WhatsApp: ${String(data.message ?? data.code ?? `HTTP ${res.status}`)}`, code);
    }
    return data as T;
  }
}

/** Подпись вебхука GOWA: `X-Hub-Signature-256: sha256=<hex HMAC-SHA256(тело, секрет)>`. */
export function verifyGowaSignature(rawBody: string, signature: string | null, secret: string | null | undefined): boolean {
  if (!signature || !secret) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(rawBody, "utf8").digest("hex"), "hex");
  const got = Buffer.from(signature.trim().replace(/^sha256=/, ""), "hex");
  return expected.length === got.length && timingSafeEqual(expected, got);
}
