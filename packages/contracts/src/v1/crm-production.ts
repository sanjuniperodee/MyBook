/**
 * API v1 — «Книги» в приложении CRM: книги клиентов по этапам (пишутся, заброшены, почти готовы, заказаны), поиск и тема,
 * ход работы, напоминание авторам. Данные — reporting.bookList, как у страницы CRM; напоминание — remindManyAction.
 */
import { z } from "zod";
import { route, schemas, uuid, type RouteDef } from "./core";
import { Choice } from "./crm";

const int = z.number().int();

export const BookRow = z
  .object({
    bookId: uuid,
    title: z.string(),
    /** «Книга маме · Алия → мама». */
    line: z.string(),
    ownerId: uuid,
    owner: z.string(),
    status: z.string(),
    /** Ход работы 0…1 и подпись («12 из 40 ответов»). */
    progress: z.number(),
    progressText: z.string(),
    idleDays: int,
    stale: z.boolean(),
    photos: int,
    occasion: z.string().nullable(),
    remindedLabel: z.string().nullable(),
    dealId: uuid.nullable(),
    dealNumber: int.nullable(),
  })
  .register(schemas, { id: "BookRow" });

export const BooksList = z
  .object({
    filter: z.string(),
    filters: z.array(Choice),
    themes: z.array(Choice),
    rows: z.array(BookRow),
    /** Клиенты с незаказанными черновиками — им можно напомнить разом. */
    remindable: z.array(uuid),
    canRemind: z.boolean(),
    staleDays: int,
  })
  .register(schemas, { id: "BooksList" });

export const RemindBody = z.object({ clientIds: z.array(uuid).min(1).max(300) }).strict().register(schemas, { id: "RemindBody" });
export const RemindResult = z.object({ sent: int, skipped: int }).register(schemas, { id: "RemindResult" });

export const crmProductionRoutes = {
  crmBooks: route({ method: "GET", path: "/api/v1/crm/books", auth: "staff", tag: "crm", summary: "Книги клиентов: этап, поиск, тема, ход работы", query: z.object({ f: z.enum(["all", "writing", "stalled", "ready", "ordered"]).optional(), q: z.string().max(100).optional(), theme: z.string().max(40).optional() }), response: BooksList }),
  crmBooksRemind: route({ method: "POST", path: "/api/v1/crm/books/remind", auth: "staff", tag: "crm", summary: "Напомнить авторам (письмо или WhatsApp, как кнопка «Напомнить всем»)", body: RemindBody, response: RemindResult }),
} satisfies Record<string, RouteDef>;
