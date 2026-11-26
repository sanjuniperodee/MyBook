"use server";

/**
 * Server actions: код — в src/server/crm-actions/site.ts; на сайте с БД выполняется здесь же, на сайте без БД —
 * в mybook-api через API v1 (ADR 0012, A5 — Раздел 5, crmAction). Права, zod и лимиты проверяет само действие.
 */
import { crmAction } from "@/web/crm";
import type * as impl from "@/server/crm-actions/site";
export type { SiteState } from "@/server/crm-actions/site";

export const setRegistrationAction = crmAction<typeof impl.setRegistrationAction>("site", "setRegistrationAction");
export const setGiftNoteAction = crmAction<typeof impl.setGiftNoteAction>("site", "setGiftNoteAction");
export const saveSellerAction = crmAction<typeof impl.saveSellerAction>("site", "saveSellerAction");
export const setMaxPhotosAction = crmAction<typeof impl.setMaxPhotosAction>("site", "setMaxPhotosAction");
