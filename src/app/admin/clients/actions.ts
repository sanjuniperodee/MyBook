"use server";

/**
 * Server actions: код — в src/server/crm-actions/clients.ts, выполняется в mybook-api через API v1 (ADR 0012/0013,
 * crmAction). Права, zod и лимиты проверяет само действие.
 */
import { crmAction } from "@/web/crm";
import type * as impl from "@/server/crm-actions/clients";

export const repeatSaleAction = crmAction<typeof impl.repeatSaleAction>("clients", "repeatSaleAction");
