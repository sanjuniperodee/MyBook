import "server-only";
import { cookies, headers as nextHeaders } from "next/headers";
import { env } from "@/config/env";
import { apiInternalUrl, isInsideApiServer, webUseApiV1 } from "./v1-web-client";

/**
 * Потоковый прокси Next Route Handlers → mybook-api (`/api/v1/site/*`) для паттерна душителя (ADR 0012, A5):
 * - при выключенном флаге `webUseApiV1(section)` или внутри процесса/обработчика `mybook-api` (`isInsideApiServer()`)
 *   вызывает `localLoader()` без сетевых вызовов и без петли прокси;
 * - при включённом `webUseApiV1(section)` (в т.ч. `webApiOnly()` на Vercel без БД) пересылает запрос на
 *   `${apiInternalUrl()}/api/v1/site${pathname.replace(/^\/api/, "")}${search}` строго потоком:
 *   `req.body` передаётся напрямую с `duplex: "half"` без `req.arrayBuffer()` / `req.formData()`,
 *   а `upstream.body` отдаётся клиенту напрямую;
 * - пробрасывает `cookie` + `authorization: Bearer <mb_session>` (чтобы работало и с Vercel), `x-real-ip` и безопасные
 *   заголовки контента/кэша/диапазонов (`range`, `if-none-match`, `accept-language` и т.д.);
 * - очищает hop-by-hop заголовки ответа (`transfer-encoding`, `connection`, `keep-alive` и др.).
 */

const SESSION_COOKIE = "mb_session";

const FORWARD_REQUEST_HEADERS = [
  "content-type",
  "content-length",
  "accept",
  "accept-language",
  "range",
  "if-none-match",
  "if-modified-since",
  "if-range",
  "cache-control",
  "user-agent",
  "x-webhook-signature",
  "content-hmac",
  "x-content-hmac",
] as const;

const HOP_BY_HOP_HEADERS = [
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
] as const;

export interface V1SiteProxyOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
  flag?: string;
  apiOnly?: boolean;
}

function extractCookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    const raw = part.slice(eq + 1).trim();
    if (!raw) return null;
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return null;
}

function lastForwardedIp(forwardedFor: string | null): string | null {
  if (!forwardedFor) return null;
  const parts = forwardedFor
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.at(-1) ?? null;
}

async function resolveClientIp(req: Request): Promise<string | null> {
  const fromReq = req.headers.get("x-real-ip")?.trim() || lastForwardedIp(req.headers.get("x-forwarded-for"));
  if (fromReq) return fromReq;
  try {
    const h = await nextHeaders();
    return h.get("x-real-ip")?.trim() || lastForwardedIp(h.get("x-forwarded-for"));
  } catch {
    return null;
  }
}

async function resolveCookies(req: Request): Promise<{ cookieHeader: string | null; sessionToken: string | null }> {
  const rawCookie = req.headers.get("cookie");
  const fromHeader = extractCookieValue(rawCookie, SESSION_COOKIE);
  if (fromHeader) return { cookieHeader: rawCookie, sessionToken: fromHeader };
  try {
    const jar = await cookies();
    const token = jar.get(SESSION_COOKIE)?.value ?? null;
    if (token) {
      const pair = `${SESSION_COOKIE}=${encodeURIComponent(token)}`;
      return { cookieHeader: rawCookie ? `${rawCookie}; ${pair}` : pair, sessionToken: token };
    }
  } catch {
    // Вне контекста запроса Next (например, unit-тесты с new Request) cookies() недоступен.
  }
  return { cookieHeader: rawCookie, sessionToken: null };
}

function isAllowedOrigin(req: Request): boolean {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return true;
  const origin = req.headers.get("origin");
  if (!origin) return true;
  let originHost = "";
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  const allowed = new Set<string>();
  try {
    allowed.add(new URL(env.appUrl).host);
  } catch {
    // ignore malformed env.appUrl
  }
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (host) allowed.add(host);
  return allowed.has(originHost);
}

/** Собирает внутренний URL `mybook-api` для маршрута `/api/...` → `${base}/api/v1/site/...`. */
export function v1SiteTargetUrl(reqUrl: string, baseUrl?: string): string {
  const url = new URL(reqUrl);
  const tail = url.pathname.replace(/^\/api(?=\/|$)/, "");
  return `${apiInternalUrl(baseUrl)}/api/v1/site${tail}${url.search}`;
}

export async function v1SiteProxy(
  section: string,
  req: Request,
  localLoader: () => Promise<Response>,
  opts: V1SiteProxyOptions = {},
): Promise<Response> {
  if (isInsideApiServer() || !webUseApiV1(section, opts.flag, opts.apiOnly)) {
    return localLoader();
  }

  // CSRF-проверка на границе Next (Origin проверяется против хоста Next/Vercel; наружу к mybook-api Origin не шлём).
  if (!isAllowedOrigin(req)) {
    return Response.json({ error: "Forbidden", code: "forbidden" }, { status: 403 });
  }

  const targetUrl = v1SiteTargetUrl(req.url, opts.baseUrl);
  const forwardHeaders = new Headers();

  for (const name of FORWARD_REQUEST_HEADERS) {
    const val = req.headers.get(name);
    if (val !== null) forwardHeaders.set(name, val);
  }
  // Запрашиваем несжатый поток у внутреннего API, чтобы undici не распаковывал тело с несовпадающим Content-Encoding.
  forwardHeaders.set("accept-encoding", "identity");

  const [{ cookieHeader, sessionToken }, clientIp] = await Promise.all([resolveCookies(req), resolveClientIp(req)]);
  if (cookieHeader) forwardHeaders.set("cookie", cookieHeader);

  const authHeader = req.headers.get("authorization");
  if (authHeader) {
    forwardHeaders.set("authorization", authHeader);
  } else if (sessionToken) {
    forwardHeaders.set("authorization", `Bearer ${sessionToken}`);
  }

  if (clientIp && clientIp !== "local") {
    forwardHeaders.set("x-real-ip", clientIp);
  }

  const method = req.method.toUpperCase();
  const hasBody = method !== "GET" && method !== "HEAD" && req.body !== null;
  const init: RequestInit & { duplex?: "half" } = {
    method,
    headers: forwardHeaders,
    redirect: "manual",
    signal: req.signal,
  };
  if (hasBody) {
    init.body = req.body;
    init.duplex = "half";
  }

  const fetchFn = opts.fetch ?? fetch;
  const upstream = await fetchFn(targetUrl, init);

  const resHeaders = new Headers(upstream.headers);
  const connectionTokens = (upstream.headers.get("connection") ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  for (const h of HOP_BY_HOP_HEADERS) resHeaders.delete(h);
  for (const h of connectionTokens) resHeaders.delete(h);
  if (upstream.headers.has("content-encoding")) {
    resHeaders.delete("content-encoding");
    resHeaders.delete("content-length");
  }

  const noBodyStatus = upstream.status === 204 || upstream.status === 205 || upstream.status === 304;
  return new Response(noBodyStatus ? null : upstream.body, {
    status: upstream.status,
    headers: resHeaders,
  });
}
