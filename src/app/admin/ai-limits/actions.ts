"use server";

/**
 * Server actions: код — в src/server/crm-actions/ai-limits.ts, выполняется в mybook-api через API v1 (ADR 0012/0013,
 * crmAction). Права, zod и лимиты проверяет само действие.
 */
import { crmAction } from "@/web/crm";
import type * as impl from "@/server/crm-actions/ai-limits";
export type { AiLimitsState } from "@/server/crm-actions/ai-limits";

export const saveGlobalLimitsAction = crmAction<typeof impl.saveGlobalLimitsAction>("aiLimits", "saveGlobalLimitsAction");
export const saveUserLimitsAction = crmAction<typeof impl.saveUserLimitsAction>("aiLimits", "saveUserLimitsAction");
export const clearUserLimitsAction = crmAction<typeof impl.clearUserLimitsAction>("aiLimits", "clearUserLimitsAction");
export const resetUsageAction = crmAction<typeof impl.resetUsageAction>("aiLimits", "resetUsageAction");
