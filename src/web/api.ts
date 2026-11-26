import "server-only";
import { cookies, headers as nextHeaders } from "next/headers";
import { createApiClient, type ApiClient } from "@mybook/contracts";
import { CLIENT_IP_HEADER, CLIENT_IP_SIG_HEADER, signClientIp } from "@/shared/clientIp";

/**
 * Веб ↔ API v1 (ADR 0012/0013): у веба нет БД и кода бэкенда — страницы, server actions и маршруты ходят только в
 * mybook-api (`API_INTERNAL_URL`, на нашем сервере 127.0.0.1:3044). Токен сессии уходит и как `Cookie: mb_session`, и как
 * `Authorization: Bearer`, IP клиента — в `x-real-ip`.
 */
const SESSION_COOKIE = "mb_session";
const DEFAULT_TIMEOUT_MS = 5_000;

export function apiInternalUrl(raw: string | undefined = process.env.API_INTERNAL_URL, apiPort: string | undefined = process.env.API_PORT): string {
  const explicit = raw?.trim().replace(/\/+$/, "").replace(/\/api\/v1$/i, "");
  if (explicit) return explicit;
  return `http://127.0.0.1:${Number(apiPort) || 3044}`;
}

async function readRequestClientIp(): Promise<string | null> {
  try {
    const h = await nextHeaders();
    const real = h.get("x-real-ip")?.trim();
    if (real) return real;
    const chain = h.get("x-forwarded-for")?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
    return chain.at(-1) ?? null;
  } catch {
    return null;
  }
}

export interface WebApiClientOptions {
  /** Значение токена сессии из cookie mb_session или Authorization: Bearer. */
  sessionCookie?: string | null;
  /** Язык ответа для Accept-Language (ru | kk | uz | en). */
  locale?: string;
  /** IP клиента для проброса в x-real-ip (чтобы rate-limit в mybook-api считался на клиента, а не общий "local"). */
  clientIp?: string | null;
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export function createWebApiClient(opts: WebApiClientOptions = {}): ApiClient {
  const baseUrl = apiInternalUrl(opts.baseUrl);
  const headers: Record<string, string> = {};
  if (opts.sessionCookie) {
    headers.cookie = `${SESSION_COOKIE}=${encodeURIComponent(opts.sessionCookie)}`;
    headers.authorization = `Bearer ${opts.sessionCookie}`;
  }
  if (opts.locale) headers["accept-language"] = opts.locale;
  const ip = opts.clientIp?.trim();
  if (ip && ip !== "local") {
    headers["x-real-ip"] = ip;
    const secret = process.env.EDGE_IP_SECRET;
    if (secret) {
      headers[CLIENT_IP_HEADER] = ip;
      headers[CLIENT_IP_SIG_HEADER] = signClientIp(ip, secret);
    }
  }
  const rawFetch = opts.fetch ?? fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timedFetch: typeof fetch = (input, init) => {
    const signal = init?.signal ?? (timeoutMs > 0 && typeof AbortSignal !== "undefined" && "timeout" in AbortSignal ? AbortSignal.timeout(timeoutMs) : undefined);
    return rawFetch(input, signal ? { ...init, signal } : init);
  };
  return createApiClient({ baseUrl, headers, fetch: timedFetch });
}

/** Клиент для текущего SSR/RSC-запроса или Server Action: забирает токен сессии и IP клиента из next/headers. */
export async function webApiClient(opts: { locale?: string; baseUrl?: string; fetch?: typeof fetch; timeoutMs?: number; sessionCookie?: string | null; clientIp?: string | null } = {}): Promise<ApiClient> {
  const [sessionCookie, clientIp] = await Promise.all([
    opts.sessionCookie !== undefined ? Promise.resolve(opts.sessionCookie) : cookies().then((c) => c.get(SESSION_COOKIE)?.value ?? null),
    opts.clientIp !== undefined ? Promise.resolve(opts.clientIp) : readRequestClientIp(),
  ]);
  return createWebApiClient({ ...opts, sessionCookie, clientIp });
}

export interface V1WebReadOptions<T> {
  /** Имя операции для логов (например, "cabinet.session"). */
  name?: string;
  /** Раздел (для логов и совместимости вызовов). */
  section?: string;
  /** Язык запроса для Accept-Language. */
  locale?: string;
  /** Явно переданный токен сессии (если уже прочитан из cookie или Bearer). */
  sessionCookie?: string | null;
  /** Чтение через API v1. */
  viaApi: (api: ApiClient) => Promise<T>;
  /** Клиент для тестов. */
  client?: ApiClient;
  /** Предел ожидания ответа API v1, мс. */
  timeoutMs?: number;
}

/** Чтение для страницы: только API v1 (у веба нет БД). */
export async function v1WebRead<T>(opts: V1WebReadOptions<T>): Promise<T> {
  const api = opts.client ?? (await webApiClient({ locale: opts.locale, sessionCookie: opts.sessionCookie, timeoutMs: opts.timeoutMs }));
  return opts.viaApi(api);
}

export type V1WebActionOptions<T> = V1WebReadOptions<T>;

/** Действие (server action, маршрут): только API v1, выполняется один раз. */
export function v1WebAction<T>(opts: V1WebActionOptions<T>): Promise<T> {
  return v1WebRead(opts);
}
