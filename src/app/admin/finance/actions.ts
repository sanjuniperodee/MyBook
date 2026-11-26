"use server";

/**
 * Server actions: код — в src/server/crm-actions/finance.ts; на сайте с БД выполняется здесь же, на сайте без БД —
 * в mybook-api через API v1 (ADR 0012, A5 — Раздел 5, crmAction). Права, zod и лимиты проверяет само действие.
 */
import { crmAction } from "@/server/v1-local-bridge-crm";
import type * as impl from "@/server/crm-actions/finance";
export type { FinanceState } from "@/server/crm-actions/finance";

export const reviewDealPaymentAction = crmAction<typeof impl.reviewDealPaymentAction>("finance", "reviewDealPaymentAction");
export const resolveFinanceIssueAction = crmAction<typeof impl.resolveFinanceIssueAction>("finance", "resolveFinanceIssueAction");
export const undoFinanceResolutionAction = crmAction<typeof impl.undoFinanceResolutionAction>("finance", "undoFinanceResolutionAction");
