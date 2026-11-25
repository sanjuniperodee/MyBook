/**
 * API v1 — коммерческое предложение (КП / предложения клиенту из чата): ссылка на оплату заказа, ссылка на книгу
 * в работе, персональная скидка с одноразовым промокодом (право promo.give). Те же данные и действие sendOfferAction,
 * что в панели «Оплата и скидка» веб-чата CRM.
 */
import { z } from "zod";
import { route, schemas, uuid, type RouteDef } from "./core";
import { Done } from "./crm";

export const ChatOfferHourOption = z
  .object({
    hours: z.number().int(),
    label: z.string(),
  })
  .register(schemas, { id: "ChatOfferHourOption" });

export const ChatOffers = z
  .object({
    /** Неоплаченный заказ — ссылка на оплату. */
    order: z.object({ number: z.number().int() }).nullable(),
    /** Книга в работе — ссылка на книгу. */
    book: z.object({ title: z.string() }).nullable(),
    /** Предел персональной скидки, %; 0 — скидку давать нельзя. */
    maxDiscount: z.number().int(),
    /** Доступные размеры скидки, % (шаг 5% + предел, как в чате CRM). */
    percents: z.array(z.number().int()),
    /** Сроки действия скидки, часы. */
    hours: z.array(z.number().int()),
    /** Подписи сроков действия скидки (с сервера, как в веб-чате CRM). */
    hourOptions: z.array(ChatOfferHourOption),
    /** Может ли сотрудник отправлять сообщения в этом диалоге (chats.send + «только свои»). */
    canSend: z.boolean(),
  })
  .register(schemas, { id: "ChatOffers" });

export const ChatOfferBody = z
  .object({
    kind: z.enum(["order", "book", "discount"]),
    percent: z.number().int().optional(),
    hours: z.number().int().optional(),
  })
  .strict()
  .register(schemas, { id: "ChatOfferBody" });

const ChatParams = z.object({ chatId: uuid });

export const crmKpRoutes = {
  crmChatOffers: route({
    method: "GET",
    path: "/api/v1/crm/chats/{chatId}/offers",
    auth: "staff",
    tag: "crm",
    summary: "КП и предложения клиенту из чата: оплата заказа, ссылка на книгу, персональная скидка",
    params: ChatParams,
    response: ChatOffers,
  }),
  crmChatOfferSend: route({
    method: "POST",
    path: "/api/v1/crm/chats/{chatId}/offers",
    auth: "staff",
    tag: "crm",
    summary: "Отправить КП/предложение клиенту в чат (скидка — с промокодом, право promo.give)",
    params: ChatParams,
    body: ChatOfferBody,
    response: Done,
  }),
} satisfies Record<string, RouteDef>;
