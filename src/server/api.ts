import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getCurrentUser } from "@/server/auth";
import type { User } from "@/shared/infrastructure/db/schema";
import type { BookRow, BookViewer } from "@/modules/authoring";
import { DomainError } from "@/shared/domain";
import { viewerOf } from "@/server/books";
import { container } from "@/server/container";
import { env } from "@/config/env";
import { can, getStaff, type Staff } from "@/server/access";
import type { Permission } from "@/modules/access/domain/permissions";
import { getMessages } from "@/i18n/server";
import type { Messages } from "@/i18n/messages";

type ApiMessages = Messages["api"];
export type ApiErrorKey = keyof ApiMessages;
type Params<K extends ApiErrorKey> = ApiMessages[K] extends (...a: infer A) => string ? A : [];

/** Ошибка с HTTP-статусом. message — ключ словаря api, текст подставляется на языке пользователя. */
export class HttpError<K extends ApiErrorKey = ApiErrorKey> extends Error {
  public params: unknown[];
  constructor(
    public status: number,
    public code: K,
    ...params: Params<K>
  ) {
    super(code);
    this.params = params;
  }
}

function isApiKey(t: ApiMessages, key: string): key is ApiErrorKey {
  return Object.prototype.hasOwnProperty.call(t, key);
}

/** Текст ошибки по ключу; незнакомая строка возвращается как есть. */
function translate(t: ApiMessages, key: string, params: unknown[] = []): string {
  if (!isApiKey(t, key)) return key;
  const v = t[key] as string | ((...a: unknown[]) => string);
  return typeof v === "function" ? v(...params) : v;
}

/** HTTP-статус для кода ошибки домена. */
function domainStatus(code: string) {
  if (code === "bookLocked" || code === "bookHasOrders" || code === "letterPrinted" || code === "reviewLocked") return 409;
  if (code === "reviewNotAllowed") return 403;
  if (/NotFound$/.test(code) || code === "letterClosed" || code === "letterInvalid") return 404;
  return 400;
}

function fail(t: ApiMessages, status: number, code: string, params?: unknown[]) {
  return NextResponse.json({ error: translate(t, code, params), code: isApiKey(t, code) ? code : undefined }, { status });
}

type Handler<C> = (req: Request, ctx: C) => Promise<Response>;

/** Оборачивает обработчик: единый формат ошибок { error }. */
export function api<C>(handler: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      const t = (await getMessages()).api;
      if (err instanceof HttpError) return fail(t, err.status, err.code, err.params);
      // Ошибки домена с кодом из словаря api (Authoring и др.) — сразу в ответ с подходящим статусом.
      if (DomainError.isDomainError(err) && isApiKey(t, err.code)) return fail(t, domainStatus(err.code), err.code);
      if (err instanceof SyntaxError) return fail(t, 400, "badRequest");
      if (err instanceof ZodError) {
        // В схемах сообщения — ключи словаря; встроенные сообщения zod (английские) заменяем общим текстом.
        const key = err.issues[0]?.message ?? "";
        return fail(t, 400, isApiKey(t, key) ? key : "badData");
      }
      console.error("[api]", err);
      return fail(t, 500, "server");
    }
  };
}

/** Проверка Origin для изменяющих запросов (защита от CSRF поверх SameSite=Lax). */
export function checkOrigin(req: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
  const origin = req.headers.get("origin");
  if (!origin) return;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const allowed = new Set([new URL(env.appUrl).host, host]);
  if (!allowed.has(new URL(origin).host)) throw new HttpError(403, "forbidden");
}

export async function apiUser(req: Request): Promise<User> {
  checkOrigin(req);
  const user = await getCurrentUser();
  if (!user) throw new HttpError(401, "unauthorized");
  return user;
}

export async function apiBook(req: Request, bookId: string, opts: { editable?: boolean } = {}): Promise<{ user: User; book: BookRow; viewer: BookViewer }> {
  const user = await apiUser(req);
  const viewer = viewerOf(user);
  const book = await container().authoring.queries.visibleBook(bookId, viewer);
  if (!book) throw new HttpError(404, "bookNotFound");
  if (opts.editable && book.status !== "draft") throw new HttpError(409, "bookLocked");
  return { user, book, viewer };
}

/** Пользователь API как читатель книг (владелец или сотрудник). */
export async function apiViewer(req: Request): Promise<{ user: User; viewer: BookViewer }> {
  const user = await apiUser(req);
  return { user, viewer: viewerOf(user) };
}

/** Сотрудник CRM с нужными правами (для API). */
export async function apiStaff(req: Request, ...perms: Permission[]): Promise<Staff> {
  await apiUser(req);
  const staff = await getStaff();
  if (!staff) throw new HttpError(403, "forbidden");
  if (!can(staff, ...perms)) throw new HttpError(403, "forbidden");
  return staff;
}
