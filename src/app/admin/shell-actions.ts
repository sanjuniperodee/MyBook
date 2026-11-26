"use server";

/**
 * Server actions: код — в src/server/crm-actions/shell.ts; на сайте с БД выполняется здесь же, на сайте без БД —
 * в mybook-api через API v1 (ADR 0012, A5 — Раздел 5, crmAction). Права, zod и лимиты проверяет само действие.
 */
import { crmAction } from "@/web/crm";
import type * as impl from "@/server/crm-actions/shell";

export const autoShiftOnVisitAction = crmAction<typeof impl.autoShiftOnVisitAction>("shell", "autoShiftOnVisitAction");
