"use server";

/**
 * Server actions: код — в src/server/crm-actions/automations.ts; на сайте с БД выполняется здесь же, на сайте без БД —
 * в mybook-api через API v1 (ADR 0012, A5 — Раздел 5, crmAction). Права, zod и лимиты проверяет само действие.
 */
import { crmAction } from "@/server/v1-local-bridge-crm";
import type * as impl from "@/server/crm-actions/automations";

export const saveAutomationAction = crmAction<typeof impl.saveAutomationAction>("automations", "saveAutomationAction");
export const toggleAutomationAction = crmAction<typeof impl.toggleAutomationAction>("automations", "toggleAutomationAction");
export const retryAutomationRunAction = crmAction<typeof impl.retryAutomationRunAction>("automations", "retryAutomationRunAction");
export const deleteAutomationAction = crmAction<typeof impl.deleteAutomationAction>("automations", "deleteAutomationAction");
