"use server";

/**
 * Server actions: код — в src/server/crm-actions/notify.ts; на сайте с БД выполняется здесь же, на сайте без БД —
 * в mybook-api через API v1 (ADR 0012, A5 — Раздел 5, crmAction). Права, zod и лимиты проверяет само действие.
 */
import { crmAction } from "@/server/v1-local-bridge-crm";
import type * as impl from "@/server/crm-actions/notify";

export const myNotifyPrefsAction = crmAction<typeof impl.myNotifyPrefsAction>("notify", "myNotifyPrefsAction");
export const saveMyNotifyPrefsAction = crmAction<typeof impl.saveMyNotifyPrefsAction>("notify", "saveMyNotifyPrefsAction");
