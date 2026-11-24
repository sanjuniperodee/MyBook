/**
 * Письма близких в API v1: приглашение по ссылке (вкл/выкл, новая ссылка, свой текст), письма — правка, скрыть/показать,
 * удалить, порядок в книге. Лимиты — как у сайта (сверяет tests/api-v1.test.ts).
 */
import { z } from "zod";
import { Ok, iso, route, schemas, uuid, type RouteDef } from "./core";

const LetterStatus = z.enum(["pending", "approved", "hidden"]);

export const Letter = z
  .object({
    id: uuid,
    authorName: z.string(),
    relation: z.string(),
    text: z.string(),
    /** pending — пришло и ждёт автора, approved — в книге, hidden — скрыто. */
    status: LetterStatus,
    createdAt: iso,
  })
  .register(schemas, { id: "Letter" });

/** Приглашение близких: ссылка (null — приём выключен), свой текст и готовое сообщение со ссылкой для «Поделиться». */
export const LetterInvite = z
  .object({
    enabled: z.boolean(),
    url: z.string().nullable(),
    /** Свой текст приглашения ('' — текст по виду книги). */
    text: z.string(),
    shareText: z.string().nullable(),
  })
  .register(schemas, { id: "LetterInvite" });

export const LettersView = z.object({ letters: z.array(Letter), invite: LetterInvite, max: z.number().int() }).register(schemas, { id: "LettersView" });

export const LetterInviteBody = z.object({ enabled: z.boolean(), regenerate: z.boolean().optional() }).strict().register(schemas, { id: "LetterInviteBody" });
export const LetterInviteText = z.object({ text: z.string().trim().max(500) }).strict().register(schemas, { id: "LetterInviteText" });

export const LetterPatch = z
  .object({
    status: LetterStatus,
    authorName: z.string().trim().min(1).max(80),
    relation: z.string().trim().max(80),
    text: z.string().trim().min(1).max(8000),
  })
  .partial()
  .strict()
  .register(schemas, { id: "LetterPatch" });

export const LetterSaved = z.object({ letter: Letter }).register(schemas, { id: "LetterSaved" });
export const LettersOrder = z.object({ ids: z.array(uuid).max(200) }).strict().register(schemas, { id: "LettersOrder" });

const BookParams = z.object({ bookId: uuid });
const LetterParams = z.object({ bookId: uuid, letterId: uuid });

export const lettersRoutes = {
  lettersGet: route({ method: "GET", path: "/api/v1/books/{bookId}/letters", auth: "user", tag: "letters", summary: "Письма близких и приглашение", params: BookParams, response: LettersView }),
  letterInviteSet: route({ method: "POST", path: "/api/v1/books/{bookId}/letters/invite", auth: "user", tag: "letters", summary: "Включить или выключить приём писем по ссылке; regenerate — новая ссылка", params: BookParams, body: LetterInviteBody, response: LetterInvite }),
  letterInviteText: route({ method: "PUT", path: "/api/v1/books/{bookId}/letters/invite-text", auth: "user", tag: "letters", summary: "Свой текст приглашения ('' — по умолчанию)", params: BookParams, body: LetterInviteText, response: LetterInvite }),
  lettersReorder: route({ method: "PUT", path: "/api/v1/books/{bookId}/letters/order", auth: "user", tag: "letters", summary: "Порядок писем в книге (id в нужной очерёдности)", params: BookParams, body: LettersOrder, response: Ok }),
  letterUpdate: route({ method: "PATCH", path: "/api/v1/books/{bookId}/letters/{letterId}", auth: "user", tag: "letters", summary: "Правка письма: текст, подпись, в книге или скрыто", params: LetterParams, body: LetterPatch, response: LetterSaved }),
  letterDelete: route({ method: "DELETE", path: "/api/v1/books/{bookId}/letters/{letterId}", auth: "user", tag: "letters", summary: "Удалить письмо", params: LetterParams, response: Ok }),
} as const satisfies Record<string, RouteDef>;
