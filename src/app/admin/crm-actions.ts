"use server";

/**
 * Server actions: код — в src/server/crm-actions/crm.ts; на сайте с БД выполняется здесь же, на сайте без БД —
 * в mybook-api через API v1 (ADR 0012, A5 — Раздел 5, crmAction). Права, zod и лимиты проверяет само действие.
 */
import { crmAction } from "@/server/v1-local-bridge-crm";
import type * as impl from "@/server/crm-actions/crm";
export type { WhatsappCallStart } from "@/server/crm-actions/crm";

export const setClientManagerAction = crmAction<typeof impl.setClientManagerAction>("crm", "setClientManagerAction");
export const setClientChannelAction = crmAction<typeof impl.setClientChannelAction>("crm", "setClientChannelAction");
export const setClientLocaleAction = crmAction<typeof impl.setClientLocaleAction>("crm", "setClientLocaleAction");
export const callAction = crmAction<typeof impl.callAction>("crm", "callAction");
export const whatsappDialAction = crmAction<typeof impl.whatsappDialAction>("crm", "whatsappDialAction");
export const whatsappAnswerAction = crmAction<typeof impl.whatsappAnswerAction>("crm", "whatsappAnswerAction");
export const openChatAction = crmAction<typeof impl.openChatAction>("crm", "openChatAction");
export const sendEmailAction = crmAction<typeof impl.sendEmailAction>("crm", "sendEmailAction");
export const markCallHandledAction = crmAction<typeof impl.markCallHandledAction>("crm", "markCallHandledAction");
export const setClientPhonesAction = crmAction<typeof impl.setClientPhonesAction>("crm", "setClientPhonesAction");
export const setClientNoMarketingAction = crmAction<typeof impl.setClientNoMarketingAction>("crm", "setClientNoMarketingAction");
export const setDealNoMarketingAction = crmAction<typeof impl.setDealNoMarketingAction>("crm", "setDealNoMarketingAction");
export const setShiftAction = crmAction<typeof impl.setShiftAction>("crm", "setShiftAction");
export const setClientFieldsAction = crmAction<typeof impl.setClientFieldsAction>("crm", "setClientFieldsAction");
export const revealContactAction = crmAction<typeof impl.revealContactAction>("crm", "revealContactAction");
