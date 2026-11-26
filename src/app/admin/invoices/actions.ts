"use server";

/**
 * Server actions: код — в src/server/crm-actions/invoices.ts; на сайте с БД выполняется здесь же, на сайте без БД —
 * в mybook-api через API v1 (ADR 0012, A5 — Раздел 5, crmAction). Права, zod и лимиты проверяет само действие.
 */
import { crmAction } from "@/server/v1-local-bridge-crm";
import type * as impl from "@/server/crm-actions/invoices";
export type { InvoiceResult, InvoiceFormInfo, AccessAccount } from "@/server/crm-actions/invoices";

export const invoiceFormInfoAction = crmAction<typeof impl.invoiceFormInfoAction>("invoices", "invoiceFormInfoAction");
export const issueInvoiceAction = crmAction<typeof impl.issueInvoiceAction>("invoices", "issueInvoiceAction");
export const cancelInvoiceAction = crmAction<typeof impl.cancelInvoiceAction>("invoices", "cancelInvoiceAction");
export const resendInvoiceAction = crmAction<typeof impl.resendInvoiceAction>("invoices", "resendInvoiceAction");
export const invoiceAccountsAction = crmAction<typeof impl.invoiceAccountsAction>("invoices", "invoiceAccountsAction");
export const resendInvoiceAccessAction = crmAction<typeof impl.resendInvoiceAccessAction>("invoices", "resendInvoiceAccessAction");
