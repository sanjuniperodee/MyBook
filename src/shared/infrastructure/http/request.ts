/**
 * Данные текущего HTTP-запроса бэкенда и выход из обработчика (docs/refactor/legacy-removal-plan.md, этап 1).
 * Раньше то же давали next/headers, next/server и next/navigation через прокладку сборки; поведение то же:
 * - заголовки и cookie берутся из контекста запроса (request-scope.ts); вне запроса — понятная ошибка;
 * - `after` откладывает задачу до отправки ответа, вне запроса бросает (runInBackground тогда выполняет её сразу);
 * - `redirect` / `notFound` бросают ошибки с теми же `digest`, что и Next: их узнают ApiExceptionFilter и веб-CRM.
 * Ставить cookie бэкенд не умеет: сессия отдаётся токеном в теле ответа (Authorization: Bearer).
 */
import { currentContext } from "./request-scope";

export interface RequestCookie {
  name: string;
  value: string;
}

export interface RequestCookies {
  get(name: string): RequestCookie | undefined;
  getAll(): RequestCookie[];
  has(name: string): boolean;
  /** Бэкенд cookie не ставит — бросает, как и прежняя прокладка. */
  set(...args: unknown[]): never;
  delete(...args: unknown[]): never;
}

const readOnly = (name: string) => (): never => {
  throw new Error(`cookies().${name}() недоступен в бэкенде: сессия — токеном в ответе`);
};

function cookieMap(): Map<string, string> {
  const map = new Map<string, string>();
  for (const part of (currentContext().request.headers.get("cookie") ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) map.set(part.slice(0, i).trim(), decodeURIComponent(part.slice(i + 1).trim()));
  }
  return map;
}

export async function headers(): Promise<Headers> {
  return currentContext().request.headers;
}

export async function cookies(): Promise<RequestCookies> {
  const map = cookieMap();
  return {
    get: (name) => (map.has(name) ? { name, value: map.get(name)! } : undefined),
    getAll: () => [...map].map(([name, value]) => ({ name, value })),
    has: (name) => map.has(name),
    set: readOnly("set"),
    delete: readOnly("delete"),
  };
}

/** Задача после ответа: выполняется, когда ответ отправлен. Вне запроса бросает. */
export function after(task: () => unknown): void {
  currentContext().afterResponse.push(task);
}

/** Завершить обработку переходом на `url` (как Next redirect: 307, replace). */
export function redirect(url: string): never {
  throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${url};307;` });
}

/** Завершить обработку ответом 404. */
export function notFound(): never {
  throw Object.assign(new Error("NEXT_NOT_FOUND"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
}

/**
 * Ответ-переход 307 на абсолютный адрес. Собирается конструктором, а не Response.redirect: у того заголовки
 * неизменяемые, а интерцепторы бэкенда дописывают свои.
 */
export function redirectResponse(url: string | URL, status = 307): Response {
  return new Response(null, { status, headers: { Location: new URL(String(url)).toString() } });
}

/** Ошибка от `redirect()` (digest `NEXT_REDIRECT;replace;<url>;307;`). */
export function isRedirectError(err: unknown): err is Error & { digest: string } {
  if (typeof err !== "object" || err === null) return false;
  const digest = Reflect.get(err, "digest");
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT;");
}
