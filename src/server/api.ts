import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getCurrentUser } from "@/server/auth";
import type { User } from "@/shared/infrastructure/db/schema";
import { isBookEditableBy, type BookRow, type BookViewer } from "@/modules/authoring";
import { DomainError } from "@/shared/domain";
import { viewerOf } from "@/server/books";
import { domainStatus, errorText, isApiKey, isErrorKey, type ApiMessages, type ErrorKey, type ErrorParams } from "@/server/errors";
import { container } from "@/server/container";
import { env } from "@/config/env";
import { can, ForbiddenError, getStaff, type Staff } from "@/server/access";
import type { Permission } from "@/shared/domain/permissions";
import { getMessages } from "@/i18n/server";

const HTTP_ERROR = Symbol.for("mybook.http-error");

/** Ошибка с HTTP-статусом. message — ключ словаря api (текст на языке пользователя) или admin (для CRM, по-русски). */
export class HttpError<K extends ErrorKey = ErrorKey> extends Error {
  readonly [HTTP_ERROR] = true;
  public params: unknown[];
  constructor(
    public status: number,
    public code: K,
    ...params: ErrorParams<K>
  ) {
    super(code);
    this.params = params;
  }
  /** Проверка по метке, а не instanceof: класс в разных слоях бандла Next.js загружается заново. */
  static is(err: unknown): err is HttpError {
    return typeof err === "object" && err !== null && (err as Record<symbol, unknown>)[HTTP_ERROR] === true;
  }
}

function fail(t: ApiMessages, status: number, code: string, params?: unknown[]) {
  return NextResponse.json({ error: errorText(t, code, params), code: isErrorKey(t, code) ? code : undefined }, { status });
}

type Handler<C> = (req: Request, ctx: C) => Promise<Response>;

/** Оборачивает обработчик: единый формат ошибок { error }. */
export function api<C>(handler: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      const t = (await getMessages()).api;
      if (HttpError.is(err)) return fail(t, err.status, err.code, err.params);
      // Нет прав (assertStaff, assertVisible) — как у apiStaff: 403, а не общая ошибка сервера.
      if (ForbiddenError.is(err)) return fail(t, 403, "forbidden");
      // Ошибки домена с кодом из словаря api (Authoring и др.) — сразу в ответ с подходящим статусом.
      if (DomainError.isDomainError(err) && isApiKey(t, err.code)) return fail(t, domainStatus(err.code), err.code, [...err.params]);
      if (err instanceof SyntaxError) return fail(t, 400, "badRequest");
      if (err instanceof ZodError) {
        // В схемах сообщения — ключи словаря (api или admin); встроенные сообщения zod (английские) заменяем общим текстом.
        const key = err.issues[0]?.message ?? "";
        return fail(t, 400, isErrorKey(t, key) ? key : "badData");
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
  const allowed = new Set([new URL(env.appUrl).host]);
  if (host) allowed.add(host);
  if (!allowed.has(originHost(origin))) throw new HttpError(403, "forbidden");
}

/** Хост из заголовка Origin; у «null» (песочные iframe, часть приватных режимов) и мусора — пустая строка, её нет среди разрешённых. */
function originHost(origin: string): string {
  try {
    return new URL(origin).host;
  } catch {
    return "";
  }
}

export async function apiUser(req: Request): Promise<User> {
  checkOrigin(req);
  const user = await getCurrentUser();
  if (!user) throw new HttpError(401, "unauthorized");
  return user;
}

export async function apiBook(req: Request, bookId: string, opts: { editable?: boolean } = {}): Promise<{ user: User; book: BookRow; viewer: BookViewer }> {
  const user = await apiUser(req);
  const viewer = await viewerOf(user);
  const book = await container().authoring.queries.visibleBook(bookId, viewer);
  // Для правки: книгу, которую сотруднику менять нельзя (нет clients.edit), — как будто её нет.
  if (!book || (opts.editable && !isBookEditableBy(book.userId, viewer))) throw new HttpError(404, "bookNotFound");
  if (opts.editable && book.status !== "draft") throw new HttpError(409, "bookLocked");
  return { user, book, viewer };
}

/** Пользователь API как читатель книг (владелец или сотрудник). */
export async function apiViewer(req: Request): Promise<{ user: User; viewer: BookViewer }> {
  const user = await apiUser(req);
  return { user, viewer: await viewerOf(user) };
}

/** Сотрудник CRM с нужными правами (для API). */
export async function apiStaff(req: Request, ...perms: Permission[]): Promise<Staff> {
  await apiUser(req);
  const staff = await getStaff();
  if (!staff) throw new HttpError(403, "forbidden");
  if (!can(staff, ...perms)) throw new HttpError(403, "forbidden");
  return staff;
}
