"use server";

/**
 * Server actions: код — в src/server/crm-actions/marketing.ts; на сайте с БД выполняется здесь же, на сайте без БД —
 * в mybook-api через API v1 (ADR 0012, A5 — Раздел 5, crmAction). Права, zod и лимиты проверяет само действие.
 */
import { crmAction } from "@/server/v1-local-bridge-crm";
import type * as impl from "@/server/crm-actions/marketing";
export type { LinkState } from "@/server/crm-actions/marketing";

export const addSpendAction = crmAction<typeof impl.addSpendAction>("marketing", "addSpendAction");
export const removeSpendAction = crmAction<typeof impl.removeSpendAction>("marketing", "removeSpendAction");
export const createLinkAction = crmAction<typeof impl.createLinkAction>("marketing", "createLinkAction");
export const archiveLinkAction = crmAction<typeof impl.archiveLinkAction>("marketing", "archiveLinkAction");
export const saveWhatsappNumberAction = crmAction<typeof impl.saveWhatsappNumberAction>("marketing", "saveWhatsappNumberAction");
