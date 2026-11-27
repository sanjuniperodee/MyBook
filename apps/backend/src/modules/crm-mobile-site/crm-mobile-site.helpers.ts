import { createHash } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import type { Locale } from "@/i18n/config";
import { countPerf } from "@/shared/infrastructure/perfLog";
import type { StaffMember } from "../../core/auth/staff";
import type { AppConfig } from "../../core/config/app-config";
import { ApiError } from "../../core/errors/api-error";
import { clientIp } from "../../core/http/client-ip";
import { header } from "../../core/http/request";
import type { CrmSiteCallContext } from "./crm-mobile-site.tokens";

/** Имя скачиваемого APK и максимальный размер загрузки (паритет с `src/server/mobile-apk.ts`). */
export const MOBILE_APK_NAME = "MyBooks-CRM.apk";
export const MOBILE_APK_MAX_BYTES = 150 * 1024 * 1024;

/** Фильтры списка диалогов мобильного приложения (паритет с `CHAT_FILTERS` из `src/server/crm-lists/data.ts`). */
export const CHAT_FILTERS = ["open", "mine", "unread", "waiting", "closed"] as const;
export type ChatFilterId = (typeof CHAT_FILTERS)[number];

export function parseChatFilter(value: string | null): ChatFilterId {
  for (const item of CHAT_FILTERS) {
    if (item === value) return item;
  }
  return "open";
}

/** Схема UUID для параметров пути и полей тела (паритет с `src/server/input.ts`). */
export const uuidSchema = z.string().uuid();

/** Проверяет параметр пути на UUID; неверный формат → 400 `badRequest` до обращения к БД. */
export function requireUuid(value: string): string {
  const parsed = uuidSchema.safeParse(value);
  if (!parsed.success) throw new ApiError(400, "badRequest");
  return parsed.data;
}

/** Разбирает сырой JSON тела маршрута сайта; синтаксическая ошибка → 400 `badRequest`. */
export function parseJsonBody(raw: Buffer): unknown {
  try {
    return JSON.parse(raw.toString("utf8"));
  } catch {
    throw new ApiError(400, "badRequest");
  }
}

/** Мягкий разбор JSON (пустое или битое тело → `{}` — паритет с `POST /api/mobile/notifications`). */
export function parseOptionalJsonBody(raw: Buffer): unknown {
  if (raw.length === 0) return {};
  try {
    return JSON.parse(raw.toString("utf8"));
  } catch {
    return {};
  }
}

/** Строка параметров запроса из URL Fastify (паритет с `new URL(req.url).searchParams`). */
export function searchParamsOf(req: FastifyRequest): URLSearchParams {
  return new URL(req.url, "http://localhost").searchParams;
}

/** Собирает явный контекст запроса сотрудника для вызовов переходного слоя legacy. */
export function siteCallContext(
  req: FastifyRequest,
  config: AppConfig,
  staff: StaffMember,
  token: string | null,
  locale: Locale,
): CrmSiteCallContext {
  return {
    staff,
    token,
    ip: clientIp(req, config.edgeIpSecret),
    locale,
  };
}

/**
 * Обёртка маршрутов мобильного приложения (паритет с `mobile()` из `src/server/mobile-api.ts`):
 * обычная `Error` с русским текстом от действия CRM → 400 `{ error }`, прочие ошибки уходят в `ApiExceptionFilter`.
 */
export async function runMobile(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof Error && err.constructor === Error && /[\u0400-\u04FF]/.test(err.message)) {
      return Response.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}

/**
 * JSON с ETag (паритет с `jsonWithEtag` из `src/server/mobile-api.ts`):
 * при совпадении `If-None-Match` отдаёт пустой 304 с теми же `ETag` и `Cache-Control: private, no-cache`.
 */
export function jsonWithEtag(req: FastifyRequest, data: unknown): Response {
  const body = JSON.stringify(data);
  const tag = `"${createHash("sha1").update(body).digest("base64url").slice(0, 27)}"`;
  const headers = { ETag: tag, "Cache-Control": "private, no-cache" };
  if (header(req, "if-none-match") === tag) return new Response(null, { status: 304, headers });
  return new Response(body, { headers: { ...headers, "Content-Type": "application/json" } });
}

/** Замер файлового маршрута (паритет с `fileRoute` из `src/server/file-route.ts`). */
export async function measureFile(name: string, fn: () => Promise<Response>): Promise<Response> {
  const t0 = performance.now();
  const res = await fn();
  countPerf(`route:${name}`, Number(res.headers.get("content-length") ?? 0), performance.now() - t0, res.status);
  return res;
}

/** Извлекает id созданной сделки из redirect-исключения Next.js (`NEXT_REDIRECT;...;/admin/deals/<id>`). */
export function redirectId(err: unknown): string | null {
  if (typeof err !== "object" || err === null) return null;
  const digest: unknown = Reflect.get(err, "digest");
  if (typeof digest !== "string" || !digest.startsWith("NEXT_REDIRECT")) return null;
  return digest.split(";")[2]?.split("/").pop() || null;
}

/** APK — zip-архив, первые два байта «PK» (паритет с `looksLikeApk` из `src/server/mobile-apk.ts`). */
export function looksLikeApk(data: Uint8Array): boolean {
  return data.length > 4 && data[0] === 0x50 && data[1] === 0x4b;
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return typeof value === "object" && value !== null && Symbol.asyncIterator in value;
}

/**
 * Читает сырое бинарное тело запроса (PKCS#7 / XML plist для `/api/ios-app/udid`) без порчи байтов.
 * Возвращает `null`, если длина тела достигает или превышает `maxExclusiveBytes`.
 */
export async function readUdidRawBody(req: FastifyRequest, maxExclusiveBytes: number): Promise<Buffer | null> {
  if (req.rawBody) return req.rawBody.length < maxExclusiveBytes ? req.rawBody : null;
  if (Buffer.isBuffer(req.body)) return req.body.length < maxExclusiveBytes ? req.body : null;
  if (typeof req.body === "string") {
    const buf = Buffer.from(req.body, "utf8");
    return buf.length < maxExclusiveBytes ? buf : null;
  }
  const source = isAsyncIterable(req.body) ? req.body : !req.raw.readableEnded ? req.raw : null;
  if (!source) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  let total = 0;
  let overflow = false;
  for await (const part of source) {
    const buf = Buffer.isBuffer(part)
      ? part
      : typeof part === "string"
        ? Buffer.from(part, "utf8")
        : part instanceof Uint8Array
          ? Buffer.from(part)
          : Buffer.alloc(0);
    total += buf.length;
    if (total >= maxExclusiveBytes) {
      overflow = true;
      continue;
    }
    if (!overflow && buf.length > 0) chunks.push(buf);
  }
  return overflow ? null : Buffer.concat(chunks, total);
}

/** Разбор multipart-формы голосового сообщения: поля `voice` (файл) и `replyToId`. */
export async function readVoiceMultipart(
  req: FastifyRequest,
): Promise<{ voice: { data: Uint8Array; name: string; mime: string } | null; replyRaw: string }> {
  if (!req.isMultipart()) throw new TypeError("Unsupported form content-type");
  let voice: { data: Uint8Array; name: string; mime: string } | null = null;
  let replyRaw = "";
  for await (const part of req.parts()) {
    if (part.type === "file") {
      if (part.fieldname === "voice" && voice === null) {
        const buf = await part.toBuffer();
        voice = { data: new Uint8Array(buf), name: part.filename || "", mime: part.mimetype || "" };
      } else {
        part.file.resume();
      }
    } else if (part.fieldname === "replyToId" && !replyRaw) {
      replyRaw = typeof part.value === "string" ? part.value : String(part.value ?? "");
    }
  }
  return { voice, replyRaw };
}

/** Разбор multipart-формы загрузки APK (поле `apk`, до 150 МБ — без буферизации сверх лимита). */
export async function readApkMultipart(
  req: FastifyRequest,
): Promise<{ found: boolean; name: string; data: Uint8Array; tooLarge: boolean }> {
  if (!req.isMultipart()) throw new TypeError("Unsupported form content-type");
  let found = false;
  let name = "";
  let data = new Uint8Array(0);
  let tooLarge = false;
  for await (const part of req.parts({ limits: { fileSize: MOBILE_APK_MAX_BYTES, files: 10 } })) {
    if (part.type === "file") {
      if (part.fieldname === "apk" && !found) {
        found = true;
        name = part.filename || "";
        try {
          const buf = await part.toBuffer();
          if (part.file.truncated) {
            tooLarge = true;
          } else {
            data = new Uint8Array(buf);
          }
        } catch (err) {
          const code = typeof err === "object" && err !== null ? Reflect.get(err, "code") : undefined;
          if (code === "FST_REQ_FILE_TOO_LARGE") {
            tooLarge = true;
          } else {
            throw err;
          }
        }
      } else {
        part.file.resume();
      }
    }
  }
  return { found, name, data, tooLarge };
}
