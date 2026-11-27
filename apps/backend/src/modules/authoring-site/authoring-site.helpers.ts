import { Inject, Injectable } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { BookRow, BookViewer } from "@/modules/authoring";
import { isBookEditableBy } from "@/modules/authoring/domain";
import type { CurrentUser as AuthUser } from "@/modules/identity";
import { countPerf } from "@/shared/infrastructure/perfLog";
import { STAFF_ACCESS, type StaffAccessPort } from "../../core/auth/staff";
import { APP_CONFIG, type AppConfig } from "../../core/config/app-config";
import { ApiError } from "../../core/errors/api-error";
import { clientIp } from "../../core/http/client-ip";
import { AUTHORING, AUTHORING_BOOK_OWNERSHIP, type AuthoringFacade, type BookOwnershipPort } from "../authoring/authoring.tokens";

/** Схема UUID для параметров пути и полей тела (паритет с src/server/input.ts). */
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

/** Обёртка файлового маршрута (паритет с fileRoute в src/server/file-route.ts): замер в perfLog. */
export async function measureFile(name: string, fn: () => Promise<Response>): Promise<Response> {
  const t0 = performance.now();
  const res = await fn();
  countPerf(`route:${name}`, Number(res.headers.get("content-length") ?? 0), performance.now() - t0, res.status);
  return res;
}

/**
 * AbortSignal, который срабатывает при обрыве соединения клиентом до завершения ответа (без ложных срабатываний в inject).
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

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return typeof value === "object" && value !== null && Symbol.asyncIterator in value;
}

/**
 * Читает бинарное тело запроса (Buffer, строка или поток из passthrough-парсера application/octet-stream)
 * с жёстким потолком maxBytes (превышение → 413 fileChunk).
 */
export async function readBinaryBody(req: FastifyRequest, maxBytes: number): Promise<Buffer> {
  if (Buffer.isBuffer(req.body)) {
    if (req.body.length > maxBytes) throw new ApiError(413, "fileChunk");
    return req.body;
  }
  if (typeof req.body === "string") {
    const buf = Buffer.from(req.body, "utf8");
    if (buf.length > maxBytes) throw new ApiError(413, "fileChunk");
    return buf;
  }
  if (isAsyncIterable(req.body)) {
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const part of req.body) {
      const buf = Buffer.isBuffer(part) ? part : typeof part === "string" ? Buffer.from(part, "utf8") : Buffer.from(part as Uint8Array);
      total += buf.length;
      if (total > maxBytes) throw new ApiError(413, "fileChunk");
      chunks.push(buf);
    }
    return Buffer.concat(chunks, total);
  }
  return Buffer.alloc(0);
}

/**
 * Проверка доступа к книге на маршрутах сайта `@SiteRoute` (паритет с `apiViewer` / `apiBook` в src/server/api.ts,
 * без `next/headers`).
 */
@Injectable()
export class SiteBookAccessService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(STAFF_ACCESS) private readonly staffAccess: StaffAccessPort,
    @Inject(AUTHORING) private readonly authoring: AuthoringFacade,
    @Inject(AUTHORING_BOOK_OWNERSHIP) private readonly ownership: BookOwnershipPort,
  ) {}

  /** Определяет права пользователя на книгу bookId: владелец или сотрудник CRM (с проверкой роли, IP, 2FA и scope). */
  async viewerFor(req: FastifyRequest, user: AuthUser, bookId: string | null): Promise<BookViewer> {
    if (user.role === "admin" && !user.staffDisabled) {
      const resolved = await this.staffAccess.resolve(user, clientIp(req, this.config.edgeIpSecret));
      if (resolved && !resolved.gate) {
        const staff = resolved.context;
        let sees = false;
        if (staff.can("clients.view")) {
          if (staff.scope === "all") sees = true;
          else if (bookId) {
            const own = await this.ownership.bookOwnership(bookId);
            sees = !!own && staff.ownsClient(own.managerId);
          }
        }
        const acting = sees ? staff : null;
        return {
          userId: user.id,
          isStaff: !!acting?.can("clients.view"),
          staffEdits: !!acting?.can("clients.view", "clients.edit"),
        };
      }
    }
    return { userId: user.id, isStaff: false, staffEdits: false };
  }

  /** Загружает доступную книгу (чтение или правка черновика); чужая/недоступная → 404 bookNotFound, не черновик → 409 bookLocked. */
  async bookFor(req: FastifyRequest, user: AuthUser, bookId: string, editable = false): Promise<{ book: BookRow; viewer: BookViewer }> {
    const viewer = await this.viewerFor(req, user, bookId);
    const book = await this.authoring.queries.visibleBook(bookId, viewer);
    if (!book || (editable && !isBookEditableBy(book.userId, viewer))) throw new ApiError(404, "bookNotFound");
    if (editable && book.status !== "draft") throw new ApiError(409, "bookLocked");
    return { book, viewer };
  }
}
