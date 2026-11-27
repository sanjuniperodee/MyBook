import "server-only";
import { createHash } from "node:crypto";
import { api } from "@/server/api";

/**
 * Обёртка роутов мобильного приложения: как api(), но сообщение, которое действие CRM бросило обычной ошибкой по-русски
 * («Диалог не найден», «Укажите причину отказа»), уходит в приложение текстом с кодом 400, а не общим «ошибка сервера».
 * Технические ошибки (база, сеть) по-прежнему — 500 без подробностей.
 */
export function mobile<C>(handler: (req: Request, ctx: C) => Promise<Response>) {
  return api<C>(async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof Error && err.constructor === Error && /[\u0400-\u04FF]/.test(err.message)) return Response.json({ error: err.message }, { status: 400 });
      throw err;
    }
  });
}

/**
 * JSON с ETag: приложение присылает If-None-Match прошлого ответа — если ничего не изменилось, уходит пустой 304 вместо
 * десятков килобайт (список чатов и лента обновляются по каждому событию CRM, а меняется обычно одна строка).
 */
export function jsonWithEtag(req: Request, data: unknown): Response {
  const body = JSON.stringify(data);
  const tag = `"${createHash("sha1").update(body).digest("base64url").slice(0, 27)}"`;
  const headers = { ETag: tag, "Cache-Control": "private, no-cache" };
  if (req.headers.get("if-none-match") === tag) return new Response(null, { status: 304, headers });
  return new Response(body, { headers: { ...headers, "Content-Type": "application/json" } });
}
