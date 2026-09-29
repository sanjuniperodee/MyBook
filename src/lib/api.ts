import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getCurrentUser } from "./auth";
import { findAccessibleBook, isEditable } from "./books";
import type { Book, User } from "./db/schema";
import { env } from "./env";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

type Handler<C> = (req: Request, ctx: C) => Promise<Response>;

/** Оборачивает обработчик: единый формат ошибок { error }. */
export function api<C>(handler: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof HttpError) return NextResponse.json({ error: err.message }, { status: err.status });
      if (err instanceof SyntaxError) return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
      if (err instanceof ZodError) return NextResponse.json({ error: err.issues[0]?.message ?? "Некорректные данные" }, { status: 400 });
      console.error("[api]", err);
      return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
    }
  };
}

/** Проверка Origin для изменяющих запросов (защита от CSRF поверх SameSite=Lax). */
function checkOrigin(req: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
  const origin = req.headers.get("origin");
  if (!origin) return;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const allowed = new Set([new URL(env.appUrl).host, host]);
  if (!allowed.has(new URL(origin).host)) throw new HttpError(403, "Запрос отклонён");
}

export async function apiUser(req: Request): Promise<User> {
  checkOrigin(req);
  const user = await getCurrentUser();
  if (!user) throw new HttpError(401, "Нужно войти в аккаунт");
  return user;
}

export async function apiBook(req: Request, bookId: string, opts: { editable?: boolean } = {}): Promise<{ user: User; book: Book }> {
  const user = await apiUser(req);
  const book = await findAccessibleBook(bookId, user);
  if (!book) throw new HttpError(404, "Книга не найдена");
  if (opts.editable && !isEditable(book)) throw new HttpError(409, "Книга уже передана в печать и не может быть изменена");
  return { user, book };
}
