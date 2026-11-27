import { createHash } from "node:crypto";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { expect } from "vitest";
import type { CurrentUser } from "@/modules/identity";
import { HttpError } from "@/server/api";
import type { User } from "@/shared/infrastructure/db/schema";
import { originAllowed } from "@/shared/origin";
import { createApp, type Authenticator, type Handlers } from "../../../apps/api/src/app";
import { requestContext } from "../../../apps/api/src/http/context";
import { handlers as defaultHandlers } from "../../../apps/api/src/routes";
import { loadConfig } from "../src/core/config/app-config";
import { sessionOf } from "./app";

export type ParityMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface ParityRequest {
  nest: NestFastifyApplication;
  legacy: (req: Request) => Promise<Response>;
  method: ParityMethod;
  url: string;
  headers?: Record<string, string>;
  body?: string | Buffer | Record<string, unknown>;
  appUrl?: string;
}

const SESSION_COOKIE = "mb_session";
const BEARER = /^Bearer ([A-Za-z0-9_-]{20,200})$/;

function extractCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

function tokenFromRequest(req: Request): string | null {
  const fromCookie = extractCookie(req.headers.get("cookie"), SESSION_COOKIE);
  if (fromCookie) return fromCookie;
  return req.headers.get("authorization")?.match(BEARER)?.[1] ?? null;
}

/** Фабрика `mybook-api` для e2e-сверки байт в байт с NestJS без БД. */
export function createLegacyTestApp(opts: {
  users: CurrentUser[];
  handlers?: Partial<Handlers>;
  siteRoutes?: (req: Request) => Promise<Response | null>;
  staff?: (user: CurrentUser, req: Request) => Promise<void>;
  appUrl?: string;
}) {
  const baseUrl = opts.appUrl ?? loadConfig().appUrl;
  const auth: Authenticator = {
    async user(req) {
      const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
      if (!originAllowed({ method: req.method, origin: req.headers.get("origin"), host }, baseUrl)) {
        throw new HttpError(403, "forbidden");
      }
      const token = tokenFromRequest(req);
      const found = token ? opts.users.find((u) => sessionOf(u) === token) ?? null : null;
      if (!found) throw new HttpError(401, "unauthorized");
      // В e2e CurrentUser используется единым объектом сессии в обоих процессах.
      return found as unknown as User;
    },
    async staff(req) {
      const user = await auth.user(req);
      if (opts.staff) await opts.staff(user as unknown as CurrentUser, req);
      else throw new HttpError(403, "forbidden");
      return user;
    },
  };
  const merged = { ...defaultHandlers, ...opts.handlers } as Handlers;
  return createApp(merged, auth, opts.siteRoutes);
}

/** Заголовки, которые сверяет ожидаемый ответ (снимок): формат, кэш, файлы, переходы и cookie. */
export const EXPECTED_HEADERS = ["content-type", "cache-control", "etag", "allow", "location", "content-disposition", "content-range", "content-encoding", "vary", "x-robots-tag", "x-content-type-options"] as const;

const BODY_INLINE_MAX = 4096;

/**
 * Тело как в снимке: короткое — текстом UTF-8 байт в байт (двоичное — base64); длинное (PDF, картинки, большие JSON) —
 * длиной и sha256 всех байт с началом текста для читаемости: подмена любого байта всё равно ломает сверку.
 */
export function expectedBody(bytes: Buffer): string {
  const text = bytes.toString("utf8");
  const isText = Buffer.from(text, "utf8").equals(bytes);
  if (bytes.length <= BODY_INLINE_MAX) return isText ? text : `base64(${bytes.length}):${bytes.toString("base64")}`;
  const sha = createHash("sha256").update(bytes).digest("hex");
  return `sha256(${bytes.length}):${sha}${isText ? ` ${text.slice(0, 300)}…` : ""}`;
}

function asArray(value: string | string[] | number | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value.map(String) : [String(value)];
}

/**
 * Прогоняет один и тот же HTTP-запрос в NestJS (`inject`) и в прежний `mybook-api` (`createApp`) и проверяет
 * побайтовое совпадение статуса, тела и ключевых заголовков (`etag`, `cache-control`, `allow`, `set-cookie`).
 * Для GET 200 с ETag автоматически проверяет 304 по `If-None-Match`.
 */
export async function assertRouteParity(opts: ParityRequest) {
  const origin = new URL(opts.appUrl ?? loadConfig().appUrl);
  const headers: Record<string, string> = { host: origin.host, ...opts.headers };
  let payload: string | Buffer | undefined;
  if (opts.body !== undefined) {
    if (typeof opts.body === "string" || Buffer.isBuffer(opts.body)) {
      payload = opts.body;
    } else {
      payload = JSON.stringify(opts.body);
      if (!Object.keys(headers).some((k) => k.toLowerCase() === "content-type")) {
        headers["content-type"] = "application/json";
      }
    }
  }

  const runOnce = async (extraHeaders?: Record<string, string>) => {
    const reqHeaders = extraHeaders ? { ...headers, ...extraHeaders } : headers;
    const legacyReq = new Request(`${origin.origin}${opts.url}`, {
      method: opts.method,
      headers: reqHeaders,
      body: opts.method === "GET" ? undefined : Buffer.isBuffer(payload) ? new Uint8Array(payload) : payload,
    });
    const [nestRes, legacyRes] = await Promise.all([
      opts.nest.inject({ method: opts.method, url: opts.url, headers: reqHeaders, payload }),
      requestContext.run({ request: legacyReq, afterResponse: [] }, () => opts.legacy(legacyReq)),
    ]);
    const legacyBytes = Buffer.from(await legacyRes.arrayBuffer());
    const nestBytes = Buffer.from(nestRes.rawPayload);

    expect(nestRes.statusCode, `${opts.method} ${opts.url} status`).toBe(legacyRes.status);
    expect(nestBytes.equals(legacyBytes), `${opts.method} ${opts.url} bytes:\nNest:   ${nestBytes.toString("utf8")}\nLegacy: ${legacyBytes.toString("utf8")}`).toBe(true);
    expect(nestRes.headers["cache-control"]).toBe(legacyRes.headers.get("cache-control") ?? undefined);
    expect(nestRes.headers.etag).toBe(legacyRes.headers.get("etag") ?? undefined);
    expect(nestRes.headers.allow).toBe(legacyRes.headers.get("allow") ?? undefined);
    expect(asArray(nestRes.headers["set-cookie"])).toEqual(legacyRes.headers.getSetCookie());
    // Запись ожидаемых ответов (шаг 7 ADR 0014): ответ прежнего mybook-api — в снимок для Nest-only проверки.
    const headersOut: Record<string, string> = {};
    for (const h of EXPECTED_HEADERS) {
      const v = legacyRes.headers.get(h);
      if (v !== null) headersOut[h] = v;
    }
    const cookies = legacyRes.headers.getSetCookie();
    expect({ request: `${opts.method} ${opts.url}`, status: legacyRes.status, headers: headersOut, ...(cookies.length ? { cookies } : {}), body: expectedBody(legacyBytes) }).toMatchSnapshot();

    return { nestRes, legacyRes, bytes: nestBytes };
  };

  const first = await runOnce();
  const etag = first.nestRes.headers.etag;
  if (opts.method === "GET" && first.nestRes.statusCode === 200 && typeof etag === "string") {
    await runOnce({ "if-none-match": etag });
  }
  return first;
}
