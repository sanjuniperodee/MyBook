/**
 * next/headers, next/server и next/navigation для процесса mybook-api (alias в scripts/build-api.mjs). Общий код сайта
 * (server/auth, server/access, i18n) читает заголовки и cookie через них — здесь они берутся из текущего запроса
 * (http/context.ts), поэтому вход, права и язык работают так же, как в Next. Ставить cookie API не умеет: сессия
 * отдаётся токеном в теле ответа (Authorization: Bearer).
 */
import { ResponseCookies } from "next/dist/compiled/@edge-runtime/cookies";
import { currentContext } from "./context";

function cookieMap(): Map<string, string> {
  const map = new Map<string, string>();
  for (const part of (currentContext().request.headers.get("cookie") ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) map.set(part.slice(0, i).trim(), decodeURIComponent(part.slice(i + 1).trim()));
  }
  return map;
}

const readOnly = (name: string) => () => {
  throw new Error(`cookies().${name}() недоступен в mybook-api: сессия — токеном в ответе`);
};

export async function headers(): Promise<Headers> {
  return currentContext().request.headers;
}

export async function cookies() {
  const map = cookieMap();
  return {
    get: (name: string) => (map.has(name) ? { name, value: map.get(name)! } : undefined),
    getAll: () => [...map].map(([name, value]) => ({ name, value })),
    has: (name: string) => map.has(name),
    set: readOnly("set"),
    delete: readOnly("delete"),
  };
}

/** Задача после ответа (runInBackground): выполняется, когда ответ отправлен. */
export function after(task: () => unknown) {
  currentContext().afterResponse.push(task);
}

export async function connection() {}

const unavailable = (name: string) => () => {
  throw new Error(`${name}() недоступен в mybook-api`);
};
export const draftMode = unavailable("draftMode");
/** Совместимо с Next redirect(): серверные действия CRM (создание/удаление сделки) завершаются redirect(url). */
export function redirect(url: string): never {
  throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${url};307;` });
}
export const permanentRedirect = redirect;
/** Совместимо с Next notFound(): файловые site-маршруты (обложки и др.) завершаются 404. */
export function notFound(): never {
  throw Object.assign(new Error("NEXT_NOT_FOUND"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
}
export const forbidden = unavailable("forbidden");
export const unauthorized = unavailable("unauthorized");
export const useRouter = unavailable("useRouter");
export const usePathname = unavailable("usePathname");
export const useSearchParams = unavailable("useSearchParams");
export const userAgent = unavailable("userAgent");
export const RedirectType = { push: "push", replace: "replace" };

export class NextRequest extends Request {}
/**
 * Как NextResponse из Next: `cookies` пишет Set-Cookie в заголовки ответа, `redirect` принимает статус или ResponseInit.
 * Response.redirect из undici понимает только число (ResponseInit давал «Invalid status code 0») и отдаёт неизменяемые
 * заголовки, поэтому ответ собирается конструктором.
 */
export class NextResponse extends Response {
  readonly cookies: ResponseCookies;
  constructor(body?: BodyInit | null, init?: ResponseInit) {
    super(body, init);
    this.cookies = new ResponseCookies(this.headers);
  }
  static json(data: unknown, init?: ResponseInit) {
    const res = Response.json(data, init);
    return new NextResponse(res.body, { status: res.status, statusText: res.statusText, headers: res.headers });
  }
  static redirect(url: string | URL, init?: number | ResponseInit) {
    const base: ResponseInit = typeof init === "number" ? { status: init } : (init ?? {});
    const headers = new Headers(base.headers);
    headers.set("Location", new URL(String(url)).toString());
    return new NextResponse(null, { ...base, status: base.status ?? 307, headers });
  }
}
