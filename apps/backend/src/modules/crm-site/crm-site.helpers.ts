import type { Readable } from "node:stream";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Locale } from "@/i18n/config";
import type { BoardViewer } from "@/modules/boards";
import { countPerf } from "@/shared/infrastructure/perfLog";
import type { StaffMember } from "../../core/auth/staff";
import type { AppConfig } from "../../core/config/app-config";
import { ApiError } from "../../core/errors/api-error";
import { clientIp } from "../../core/http/client-ip";
import type { CrmSiteRequestContext } from "./crm-site.tokens";

/** Схема UUID для параметров пути и полей тела (паритет с `src/server/input.ts`). */
export const uuidSchema = z.string().uuid();

/** Проверяет параметр пути на UUID; неверный формат → 400 badRequest (до обращения к БД). */
export function requireUuid(value: string): string {
  const parsed = uuidSchema.safeParse(value);
  if (!parsed.success) throw new ApiError(400, "badRequest");
  return parsed.data;
}

/** Разбирает сырой JSON тела маршрута сайта; синтаксическая ошибка → 400 badRequest. */
export function parseJsonBody(raw: Buffer): unknown {
  try {
    return JSON.parse(raw.toString("utf8"));
  } catch {
    throw new ApiError(400, "badRequest");
  }
}

/** Разбирает JSON-строку; синтаксическая ошибка → 400 badRequest. */
export function parseJsonText(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new ApiError(400, "badRequest");
  }
}

/** Безопасно разбирает JSON тела; при ошибке или пустом теле возвращает `fallback`. */
export function safeParseJson(raw: Buffer, fallback: unknown = null): unknown {
  if (raw.length === 0) return fallback;
  try {
    return JSON.parse(raw.toString("utf8"));
  } catch {
    return fallback;
  }
}

/** Обёртка файлового маршрута (паритет с `fileRoute` в `src/server/file-route.ts`): замер в perfLog. */
export async function measureFile(name: string, fn: () => Promise<Response>): Promise<Response> {
  const t0 = performance.now();
  const res = await fn();
  countPerf(`route:${name}`, Number(res.headers.get("content-length") ?? 0), performance.now() - t0, res.status);
  return res;
}

/**
 * AbortSignal, срабатывающий при обрыве соединения клиентом до завершения ответа
 * (без ложных срабатываний в Fastify `inject`).
 */
export function createRequestAbort(req: FastifyRequest, reply: FastifyReply): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const onAborted = () => controller.abort();
  const onClose = () => {
    if (!reply.raw.writableEnded) controller.abort();
  };
  req.raw.on("aborted", onAborted);
  reply.raw.on("close", onClose);
  return {
    signal: controller.signal,
    cleanup: () => {
      req.raw.off("aborted", onAborted);
      reply.raw.off("close", onClose);
    },
  };
}

/** Контекст сотрудника для вызовов переходного слоя legacy без `next/headers`. */
export function callContext(
  req: FastifyRequest,
  config: AppConfig,
  staff: StaffMember,
  token: string | null,
  locale: Locale,
): CrmSiteRequestContext {
  return {
    staff,
    token,
    ip: clientIp(req, config.edgeIpSecret),
    locale,
  };
}

/** Представление сотрудника для модуля досок задач (паритет с `boardViewer` в `src/server/boards-api.ts`). */
export function boardViewerOf(staff: StaffMember): BoardViewer {
  return {
    userId: staff.user.id,
    name: staff.user.name || staff.user.email,
    seesAll: staff.scope === "all",
    allTasks: staff.context.can("tasks.all"),
    manageBoards: staff.context.can("boards.manage"),
  };
}

/** Один файл из multipart-запроса. */
export interface MultipartFilePart {
  name: string;
  mime: string;
  data: Buffer;
}

/** Разобранная multipart-форма: текстовые поля и файлы по имени поля. */
export interface ParsedMultipartForm {
  fields: Map<string, string[]>;
  files: Map<string, MultipartFilePart[]>;
}

/** Превышение лимита количества файлов в `@fastify/multipart` (`FST_FILES_LIMIT`). */
export class MultipartFilesLimitError extends Error {
  constructor() {
    super("Too many multipart files");
  }
}

/** Первый текст поля multipart-формы (или пустая строка). */
export function formText(form: ParsedMultipartForm, key: string): string {
  return form.fields.get(key)?.[0] ?? "";
}

/** Все непустые файлы поля multipart-формы. */
export function formFiles(form: ParsedMultipartForm, key: string): MultipartFilePart[] {
  return (form.files.get(key) ?? []).filter((f) => f.data.length > 0);
}

/** Читает multipart/form-data из FastifyRequest через `req.parts()`. */
export async function readMultipartForm(req: FastifyRequest): Promise<ParsedMultipartForm> {
  if (!req.isMultipart()) throw new TypeError("Unsupported form content-type");
  const fields = new Map<string, string[]>();
  const files = new Map<string, MultipartFilePart[]>();
  try {
    for await (const part of req.parts()) {
      if (part.type === "file") {
        const data = await part.toBuffer();
        const list = files.get(part.fieldname) ?? [];
        list.push({ name: part.filename || "", mime: part.mimetype || "", data });
        files.set(part.fieldname, list);
      } else {
        const list = fields.get(part.fieldname) ?? [];
        list.push(typeof part.value === "string" ? part.value : String(part.value ?? ""));
        fields.set(part.fieldname, list);
      }
    }
  } catch (err) {
    if (typeof err === "object" && err !== null && Reflect.get(err, "code") === "FST_FILES_LIMIT") {
      throw new MultipartFilesLimitError();
    }
    throw err;
  }
  return { fields, files };
}

/**
 * Собирает стандартный Web `Request` из `FastifyRequest` (для `boardsApi`):
 * поддерживает GET без тела, JSON/сырой буфер и multipart/form-data (загрузка файла в карточку).
 */
export async function buildWebRequest(req: FastifyRequest, raw: Buffer, appUrl: string): Promise<Request> {
  const url = new URL(req.url, appUrl).toString();
  const headers = new Headers();
  const isMultipart = req.isMultipart();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    const lower = key.toLowerCase();
    if (isMultipart && (lower === "content-type" || lower === "content-length")) continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else {
      headers.set(key, value);
    }
  }
  if (req.method === "GET" || req.method === "HEAD") {
    return new Request(url, { method: req.method, headers });
  }
  if (isMultipart) {
    const form = new FormData();
    for await (const part of req.parts()) {
      if (part.type === "file") {
        const data = await part.toBuffer();
        form.append(part.fieldname, new File([new Uint8Array(data)], part.filename || "file", { type: part.mimetype || "application/octet-stream" }));
      } else {
        form.append(part.fieldname, typeof part.value === "string" ? part.value : String(part.value ?? ""));
      }
    }
    return new Request(url, { method: req.method, headers, body: form });
  }
  return new Request(url, {
    method: req.method,
    headers,
    body: raw.length > 0 ? new Uint8Array(raw) : undefined,
  });
}

/** Адаптирует Node.js `Readable` в Web `ReadableStream<Uint8Array>` без приведений типов. */
export function nodeStreamToWeb(stream: Readable): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      stream.on("data", (chunk: Buffer | string) => {
        const bytes = typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk;
        controller.enqueue(new Uint8Array(bytes));
      });
      stream.on("end", () => controller.close());
      stream.on("error", (err) => controller.error(err));
    },
    cancel() {
      stream.destroy();
    },
  });
}
