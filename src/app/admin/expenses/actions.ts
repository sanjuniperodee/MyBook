"use server";

/**
 * Server actions: код — в src/server/crm-actions/expenses.ts; на сайте с БД выполняется здесь же, на сайте без БД —
 * в mybook-api через API v1 (ADR 0012, A5 — Раздел 5, crmAction). Права, zod и лимиты проверяет само действие.
 */
import { crmAction } from "@/web/crm";
import type * as impl from "@/server/crm-actions/expenses";
export type { ExpenseFormInput } from "@/server/crm-actions/expenses";

export const addExpenseAction = crmAction<typeof impl.addExpenseAction>("expenses", "addExpenseAction");
export const updateExpenseAction = crmAction<typeof impl.updateExpenseAction>("expenses", "updateExpenseAction");
export const removeExpenseAction = crmAction<typeof impl.removeExpenseAction>("expenses", "removeExpenseAction");
export const importExpensesAction = crmAction<typeof impl.importExpensesAction>("expenses", "importExpensesAction");
