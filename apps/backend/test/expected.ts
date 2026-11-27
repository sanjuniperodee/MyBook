import { createHash } from "node:crypto";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { expect } from "vitest";
import { loadConfig } from "../src/core/config/app-config";

export type RouteMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface RouteRequest {
  nest: NestFastifyApplication;
  method: RouteMethod;
  url: string;
  headers?: Record<string, string>;
  body?: string | Buffer | Record<string, unknown>;
  appUrl?: string;
}

/** Заголовки ожидаемого ответа: формат, кэш, файлы, переходы (cookie — отдельно, списком). */
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

const asArray = (value: string | string[] | number | undefined): string[] =>
  value === undefined ? [] : Array.isArray(value) ? value.map(String) : [String(value)];

/**
 * Один HTTP-запрос в бэкенд на Nest (Fastify inject) и сверка ответа с ожидаемым: статус, тело байт в байт, заголовки
 * EXPECTED_HEADERS и cookie. Ожидаемые ответы — снимки `__snapshots__/*.snap`: их записал прежний mybook-api, пока был
 * эталоном (шаг 7 ADR 0014, Nest с ним совпадал байт в байт); теперь любое расхождение — осознанное изменение API,
 * снимок обновляют `npx vitest run <файл> -u` и смотрят дифф. GET 200 с ETag повторяется с If-None-Match (304 или 200 —
 * как в снимке).
 */
export async function assertRoute(opts: RouteRequest) {
  const origin = new URL(opts.appUrl ?? loadConfig().appUrl);
  const headers: Record<string, string> = { host: origin.host, ...opts.headers };
  let payload: string | Buffer | undefined;
  if (opts.body !== undefined) {
    if (typeof opts.body === "string" || Buffer.isBuffer(opts.body)) {
      payload = opts.body;
    } else {
      payload = JSON.stringify(opts.body);
      if (!Object.keys(headers).some((k) => k.toLowerCase() === "content-type")) headers["content-type"] = "application/json";
    }
  }

  const runOnce = async (extraHeaders?: Record<string, string>) => {
    const reqHeaders = extraHeaders ? { ...headers, ...extraHeaders } : headers;
    const nestRes = await opts.nest.inject({ method: opts.method, url: opts.url, headers: reqHeaders, payload });
    const bytes = Buffer.from(nestRes.rawPayload);
    const headersOut: Record<string, string> = {};
    for (const h of EXPECTED_HEADERS) {
      const v = nestRes.headers[h];
      if (v !== undefined) headersOut[h] = asArray(v).join(", ");
    }
    const cookies = asArray(nestRes.headers["set-cookie"]);
    expect({ request: `${opts.method} ${opts.url}`, status: nestRes.statusCode, headers: headersOut, ...(cookies.length ? { cookies } : {}), body: expectedBody(bytes) }).toMatchSnapshot();
    return { nestRes, bytes };
  };

  const first = await runOnce();
  const etag = first.nestRes.headers.etag;
  if (opts.method === "GET" && first.nestRes.statusCode === 200 && typeof etag === "string") {
    await runOnce({ "if-none-match": etag });
  }
  return first;
}
