import "server-only";
import { NextResponse } from "next/server";
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
      if (err instanceof Error && err.constructor === Error && /[\u0400-\u04FF]/.test(err.message)) return NextResponse.json({ error: err.message }, { status: 400 });
      throw err;
    }
  });
}
