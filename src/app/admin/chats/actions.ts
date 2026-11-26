"use server";

/**
 * Server actions: код — в src/server/crm-actions/chats.ts; на сайте с БД выполняется здесь же, на сайте без БД —
 * в mybook-api через API v1 (ADR 0012, A5 — Раздел 5, crmAction). Права, zod и лимиты проверяет само действие.
 */
import { crmAction } from "@/web/crm";
import type * as impl from "@/server/crm-actions/chats";

export const sendMessageAction = crmAction<typeof impl.sendMessageAction>("chats", "sendMessageAction");
export const markReadAction = crmAction<typeof impl.markReadAction>("chats", "markReadAction");
export const assignConversationAction = crmAction<typeof impl.assignConversationAction>("chats", "assignConversationAction");
export const setConversationStatusAction = crmAction<typeof impl.setConversationStatusAction>("chats", "setConversationStatusAction");
export const stopBotAction = crmAction<typeof impl.stopBotAction>("chats", "stopBotAction");
export const startBotAction = crmAction<typeof impl.startBotAction>("chats", "startBotAction");
export const createDealFromChatAction = crmAction<typeof impl.createDealFromChatAction>("chats", "createDealFromChatAction");
export const sendInternalNoteAction = crmAction<typeof impl.sendInternalNoteAction>("chats", "sendInternalNoteAction");
export const sendOfferAction = crmAction<typeof impl.sendOfferAction>("chats", "sendOfferAction");
export const editMessageAction = crmAction<typeof impl.editMessageAction>("chats", "editMessageAction");
export const resendMessageAction = crmAction<typeof impl.resendMessageAction>("chats", "resendMessageAction");
export const deleteMessageAction = crmAction<typeof impl.deleteMessageAction>("chats", "deleteMessageAction");
export const pinChatAction = crmAction<typeof impl.pinChatAction>("chats", "pinChatAction");
export const createTemplateAction = crmAction<typeof impl.createTemplateAction>("chats", "createTemplateAction");
export const forwardTargetsAction = crmAction<typeof impl.forwardTargetsAction>("chats", "forwardTargetsAction");
export const forwardMessageAction = crmAction<typeof impl.forwardMessageAction>("chats", "forwardMessageAction");
export const transcribeMessageAction = crmAction<typeof impl.transcribeMessageAction>("chats", "transcribeMessageAction");
export const botTraceAction = crmAction<typeof impl.botTraceAction>("chats", "botTraceAction");
export const setPhoneHolderAction = crmAction<typeof impl.setPhoneHolderAction>("chats", "setPhoneHolderAction");
