"use server";

/**
 * Server actions: код — в src/server/crm-actions/deals-fields.ts; на сайте с БД выполняется здесь же, на сайте без БД —
 * в mybook-api через API v1 (ADR 0012, A5 — Раздел 5, crmAction). Права, zod и лимиты проверяет само действие.
 */
import { crmAction } from "@/server/v1-local-bridge-crm";
import type * as impl from "@/server/crm-actions/deals-fields";
export type { FieldState } from "@/server/crm-actions/deals-fields";

export const saveFieldAction = crmAction<typeof impl.saveFieldAction>("dealsFields", "saveFieldAction");
export const deleteFieldAction = crmAction<typeof impl.deleteFieldAction>("dealsFields", "deleteFieldAction");
