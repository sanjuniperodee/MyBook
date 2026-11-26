import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { cookies } from "next/headers";
import { createApiClient, type ApiClient } from "@mybook/contracts";
import { describeDiff, diffValues, normalize } from "@/shared/parity/normalize";
import { ParityError, parityMode, type ParityLogger } from "./parity";

/**
 * Серверный TS-клиент API v1 для Next SSR/RSC и Server Actions (ADR 0012, A5 — душитель):
 * - ходит напрямую на процесс mybook-api (`API_INTERNAL_URL`, локально 127.0.0.1:3044 или https://mybooks.kz/api/v1 с Vercel),
 *   пробрасывая токен сессии одновременно как `Cookie: mb_session=<tok>` и `Authorization: Bearer <tok>`;
 * - в режиме `webApiOnly()` (`WEB_API_ONLY=1` или без `DATABASE_URL`) всегда работает только через API v1,
 *   `parityMode` трактуется как `"off"`, а `local()` никогда не вызывается;
 * - при наличии БД включается флагом `WEB_USE_API_V1` (`1`/`true`/`on` — всё, или список разделов через запятую: `cabinet,shelf`);
 * - сверяет чтение с прежним локальным путём через `src/server/parity.ts` (`PARITY_MODE=shadow|strict`);
 * - мутации (`v1WebAction`) никогда не выполняются дважды в shadow-режиме.
 */

const SESSION_COOKIE = "mb_session";
const DEFAULT_TIMEOUT_MS = 5_000;

const apiServerScope = new AsyncLocalStorage<boolean>();
const apiGlobal = globalThis as unknown as { __mybookApiProcess?: boolean };

/** Пометить процесс как сервер mybook-api: внутри него вызовы auth/shelf не должны зацикливаться обратно по HTTP. */
export function markApiProcess(): void {
  apiGlobal.__mybookApiProcess = true;
}

/** Выполнить обработчик внутри контекста API-сервера (для предотвращения рекурсивных HTTP-вызовов в createApp). */
export function runInApiServer<T>(fn: () => T): T {
  return apiServerScope.run(true, fn);
}

/** Мы находимся внутри процесса или обработчика mybook-api? */
export function isInsideApiServer(): boolean {
  return apiGlobal.__mybookApiProcess === true || apiServerScope.getStore() === true;
}

/**
 * Режим «только API» (Vercel без БД или явный `WEB_API_ONLY=1`):
 * `webUseApiV1(...)` всегда `true`, `parityMode` трактуется как `"off"`, `local()` никогда не вызывается.
 */
export function webApiOnly(
  rawOnly: string | undefined = process.env.WEB_API_ONLY,
  rawDatabaseUrl: string | undefined = process.env.DATABASE_URL,
): boolean {
  if (isInsideApiServer()) return false;
  if (rawOnly?.trim() === "1") return true;
  return !rawDatabaseUrl?.trim();
}

export function webUseApiV1(
  section?: string,
  raw: string | undefined = process.env.WEB_USE_API_V1,
  apiOnly: boolean = webApiOnly(),
): boolean {
  if (isInsideApiServer()) return false;
  if (apiOnly) return true;
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
  /** Значение токена сессии из cookie mb_session или Authorization: Bearer. */
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
  if (opts.sessionCookie) {
    headers.cookie = `${SESSION_COOKIE}=${encodeURIComponent(opts.sessionCookie)}`;
    headers.authorization = `Bearer ${opts.sessionCookie}`;
  }
  if (opts.locale) headers["accept-language"] = opts.locale;
  const rawFetch = opts.fetch ?? fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timedFetch: typeof fetch = (input, init) => {
    const signal = init?.signal ?? (timeoutMs > 0 && typeof AbortSignal !== "undefined" && "timeout" in AbortSignal ? AbortSignal.timeout(timeoutMs) : undefined);
    return rawFetch(input, signal ? { ...init, signal } : init);
  };
  return createApiClient({ baseUrl, headers, fetch: timedFetch });
}

/** Клиент для текущего SSR/RSC-запроса или Server Action: забирает токен сессии из mb_session cookie (если не передан явно). */
export async function webApiClient(opts: { locale?: string; baseUrl?: string; fetch?: typeof fetch; timeoutMs?: number; sessionCookie?: string | null } = {}): Promise<ApiClient> {
  const sessionCookie = opts.sessionCookie !== undefined ? opts.sessionCookie : ((await cookies()).get(SESSION_COOKIE)?.value ?? null);
  return createWebApiClient({ ...opts, sessionCookie });
}

export interface V1WebReadOptions<T> {
  /** Имя операции для логов parity (например, "cabinet.deletionPreview"). */
  name: string;
  /** Раздел флага WEB_USE_API_V1 (например, "cabinet" или "shelf"). */
  section?: string;
  /** Язык запроса для Accept-Language. */
  locale?: string;
  /** Явно переданный токен сессии (если уже прочитан из cookie или Bearer). */
  sessionCookie?: string | null;
  /** Прежний локальный путь (in-process). */
  local: () => Promise<T>;
  /** Новый путь через API v1. */
  viaApi: (api: ApiClient) => Promise<T>;
  /** Переопределения для тестов (инверсия зависимостей). */
  flag?: string;
  parity?: string;
  apiOnly?: boolean;
  client?: ApiClient;
  logger?: ParityLogger;
}

/**
 * Безопасное чтение для SSR/RSC по паттерну душителя (ADR 0012 §4):
 * - webApiOnly() === true → всегда только viaApi() без parity и без fallback на local();
 * - флаг выключен и PARITY_MODE=off → только local(), без накладных расходов;
 * - флаг выключен и PARITY_MODE=shadow|strict → parityCall(local vs API v1), отдаёт local();
 * - флаг включён → читает через API v1 (с parity-сверкой, если PARITY_MODE включён); при сбое транспорта
 *   в не-strict режиме безопасно откатывается к local(), чтобы страница не падала.
 */
export async function v1WebRead<T>(opts: V1WebReadOptions<T>): Promise<T> {
  const apiOnly = opts.apiOnly ?? webApiOnly();
  const useApi = webUseApiV1(opts.section, opts.flag, apiOnly);
  const mode = apiOnly ? "off" : parityMode(opts.parity);
  const logger = opts.logger ?? console;

  const resolveClient = async () => opts.client ?? (await webApiClient({ locale: opts.locale, sessionCookie: opts.sessionCookie }));

  if (apiOnly) {
    return opts.viaApi(await resolveClient());
  }

  if (!useApi && mode === "off") return opts.local();

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

export interface V1WebActionOptions<T> {
  /** Раздел флага WEB_USE_API_V1 (например, "cabinet"). */
  section?: string;
  /** Язык запроса для Accept-Language. */
  locale?: string;
  /** Явно переданный токен сессии (если уже прочитан). */
  sessionCookie?: string | null;
  /** Мутация через API v1. */
  viaApi: (api: ApiClient) => Promise<T>;
  /** Прежний локальный путь (in-process). */
  local: () => Promise<T>;
  /** Переопределения для тестов. */
  flag?: string;
  apiOnly?: boolean;
  client?: ApiClient;
}

/**
 * Мутация для Server Actions и API-роутов веба по паттерну душителя:
 * - при включённом `webUseApiV1(section)` или `webApiOnly()` вызывает строго `viaApi(api)`;
 * - иначе вызывает строго `local()`.
 * Никогда не выполняет мутацию дважды в shadow-режиме.
 */
export async function v1WebAction<T>(opts: V1WebActionOptions<T>): Promise<T> {
  const apiOnly = opts.apiOnly ?? webApiOnly();
  if (webUseApiV1(opts.section, opts.flag, apiOnly)) {
    const api = opts.client ?? (await webApiClient({ locale: opts.locale, sessionCookie: opts.sessionCookie }));
    return opts.viaApi(api);
  }
  return opts.local();
}
