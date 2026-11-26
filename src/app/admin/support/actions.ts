"use server";

/**
 * Server actions: код — в src/server/crm-actions/support.ts; на сайте с БД выполняется здесь же, на сайте без БД —
 * в mybook-api через API v1 (ADR 0012, A5 — Раздел 5, crmAction). Права, zod и лимиты проверяет само действие.
 */
import { crmAction } from "@/server/v1-local-bridge-crm";
import type * as impl from "@/server/crm-actions/support";
export type { ChatHit, ChatLine } from "@/server/crm-actions/support";

export const updateTicketAction = crmAction<typeof impl.updateTicketAction>("support", "updateTicketAction");
export const notifyTicketAction = crmAction<typeof impl.notifyTicketAction>("support", "notifyTicketAction");
export const reprocessTicketAction = crmAction<typeof impl.reprocessTicketAction>("support", "reprocessTicketAction");
export const searchChatsAction = crmAction<typeof impl.searchChatsAction>("support", "searchChatsAction");
export const chatMessagesAction = crmAction<typeof impl.chatMessagesAction>("support", "chatMessagesAction");
export const linkChatAction = crmAction<typeof impl.linkChatAction>("support", "linkChatAction");
