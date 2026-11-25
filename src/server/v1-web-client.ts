import "server-only";
import { cookies } from "next/headers";
import { createApiClient, type ApiClient } from "@mybook/contracts";
import { describeDiff, diffValues, normalize } from "@/shared/parity/normalize";
import { ParityError, parityMode, type ParityLogger } from "./parity";

/**
 * Серверный TS-клиент API v1 для Next SSR/RSC (ADR 0012, A5 — душитель):
 * - ходит напрямую на локальный процесс mybook-api (API_INTERNAL_URL, мимо nginx),
 *   пробрасывая cookie браузера `mb_session`;
 * - включается флагом `WEB_USE_API_V1` (`1`/`true`/`on` — всё, или список разделов через запятую: `cabinet,shelf`);
 * - сверяет чтение с прежним локальным путём через `src/server/parity.ts` (`PARITY_MODE=shadow|strict`);
 * - при выключенном флаге (и `PARITY_MODE=off`) выполняется строго прежний путь 1-в-1, без сетевых вызовов.
 */

const SESSION_COOKIE = "mb_session";
const DEFAULT_TIMEOUT_MS = 5_000;

export function webUseApiV1(section?: string, raw: string | undefined = process.env.WEB_USE_API_V1): boolean {
  const val = raw?.trim().toLowerCase();
  if (!val || val === "0" || val === "false" || val === "off") return false;
  if (val === "1" || val === "true" || val === "on" || val === "all" || val === "*") return true;
  if (!section) return false;
  return val
    .split(",")
    .map((s) => s.trim())
    .includes(section.toLowerCase());
}

export function apiInternalUrl(raw: string | undefined = process.env.API_INTERNAL_URL, apiPort: string | undefined = process.env.API_PORT): string {
  const explicit = raw?.trim().replace(/\/+$/, "");
  if (explicit) return explicit;
  return `http://127.0.0.1:${Number(apiPort) || 3044}`;
}

export interface WebApiClientOptions {
  /** Значение cookie mb_session (без имени cookie). */
  sessionCookie?: string | null;
  /** Язык ответа для Accept-Language (ru | kk | uz | en). */
  locale?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export function createWebApiClient(opts: WebApiClientOptions = {}): ApiClient {
  const baseUrl = apiInternalUrl(opts.baseUrl);
  const headers: Record<string, string> = {};
  if (opts.sessionCookie) headers.cookie = `${SESSION_COOKIE}=${encodeURIComponent(opts.sessionCookie)}`;
  if (opts.locale) headers["accept-language"] = opts.locale;
  const rawFetch = opts.fetch ?? fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timedFetch: typeof fetch = (input, init) => {
    const signal = init?.signal ?? (timeoutMs > 0 && typeof AbortSignal !== "undefined" && "timeout" in AbortSignal ? AbortSignal.timeout(timeoutMs) : undefined);
    return rawFetch(input, signal ? { ...init, signal } : init);
  };
  return createApiClient({ baseUrl, headers, fetch: timedFetch });
}

/** Клиент для текущего SSR/RSC-запроса: забирает cookie mb_session из next/headers. */
export async function webApiClient(opts: { locale?: string; baseUrl?: string; fetch?: typeof fetch; timeoutMs?: number } = {}): Promise<ApiClient> {
  const sessionCookie = (await cookies()).get(SESSION_COOKIE)?.value ?? null;
  return createWebApiClient({ ...opts, sessionCookie });
}

export interface V1WebReadOptions<T> {
  /** Имя операции для логов parity (например, "cabinet.deletionPreview"). */
  name: string;
  /** Раздел флага WEB_USE_API_V1 (например, "cabinet" или "shelf"). */
  section?: string;
  /** Язык запроса для Accept-Language. */
  locale?: string;
  /** Прежний локальный путь (in-process). */
  local: () => Promise<T>;
  /** Новый путь через API v1. */
  viaApi: (api: ApiClient) => Promise<T>;
  /** Переопределения для тестов (инверсия зависимостей). */
  flag?: string;
  parity?: string;
  client?: ApiClient;
  logger?: ParityLogger;
}

/**
 * Безопасное чтение для SSR/RSC по паттерну душителя (ADR 0012 §4):
 * - флаг выключен и PARITY_MODE=off → только local(), без накладных расходов;
 * - флаг выключен и PARITY_MODE=shadow|strict → parityCall(local vs API v1), отдаёт local();
 * - флаг включён → читает через API v1 (с parity-сверкой, если PARITY_MODE включён); при сбое транспорта
 *   в не-strict режиме безопасно откатывается к local(), чтобы страница не падала.
 */
export async function v1WebRead<T>(opts: V1WebReadOptions<T>): Promise<T> {
  const useApi = webUseApiV1(opts.section, opts.flag);
  const mode = parityMode(opts.parity);
  const logger = opts.logger ?? console;

  if (!useApi && mode === "off") return opts.local();

  const resolveClient = async () => opts.client ?? (await webApiClient({ locale: opts.locale }));

  if (!useApi) {
    const [localResult, apiResult] = await Promise.allSettled([opts.local(), resolveClient().then((api) => opts.viaApi(api))]);
    if (localResult.status === "rejected") throw localResult.reason;
    if (apiResult.status === "rejected") {
      logger.warn(`[parity] ${opts.name}: API v1 failed`, apiResult.reason);
      if (mode === "strict") throw apiResult.reason;
      return localResult.value;
    }
    const diffs = diffValues(normalize(localResult.value), normalize(apiResult.value));
    if (diffs.length) {
      logger.warn(`[parity] ${opts.name}: ${diffs.length} mismatch`, diffs.slice(0, 10).map((d) => describeDiff(d)));
      if (mode === "strict") throw new ParityError(opts.name, diffs);
    }
    return localResult.value;
  }

  if (mode === "off") {
    try {
      return await opts.viaApi(await resolveClient());
    } catch (err) {
      logger.warn(`[v1-web] ${opts.name}: API v1 failed, fallback to local`, err);
      return opts.local();
    }
  }

  // Флаг включён + PARITY_MODE=shadow|strict: сверяем ответ API v1 с локальным путём.
  const [apiResult, localResult] = await Promise.allSettled([resolveClient().then((api) => opts.viaApi(api)), opts.local()]);
  if (apiResult.status === "rejected") {
    logger.warn(`[v1-web] ${opts.name}: API v1 failed in ${mode} mode`, apiResult.reason);
    if (mode === "strict") throw apiResult.reason;
    if (localResult.status === "fulfilled") return localResult.value;
    throw localResult.reason;
  }
  if (localResult.status === "rejected") {
    logger.warn(`[v1-web] ${opts.name}: local parity reference failed`, localResult.reason);
    if (mode === "strict") throw localResult.reason;
    return apiResult.value;
  }

  const diffs = diffValues(normalize(localResult.value), normalize(apiResult.value));
  if (diffs.length) {
    logger.warn(`[parity] ${opts.name}: ${diffs.length} mismatch`, diffs.slice(0, 10).map((d) => describeDiff(d)));
    if (mode === "strict") throw new ParityError(opts.name, diffs);
  }
  return apiResult.value;
}
