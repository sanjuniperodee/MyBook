"use server";

/**
 * Server actions: код — в src/server/crm-actions/ai-designer.ts; на сайте с БД выполняется здесь же, на сайте без БД —
 * в mybook-api через API v1 (ADR 0012, A5 — Раздел 5, crmAction). Права, zod и лимиты проверяет само действие.
 */
import { crmAction } from "@/server/v1-local-bridge-crm";
import type * as impl from "@/server/crm-actions/ai-designer";
export type { AiDesignerState } from "@/server/crm-actions/ai-designer";

export const saveFreeLimitAction = crmAction<typeof impl.saveFreeLimitAction>("aiDesigner", "saveFreeLimitAction");
export const grantCreditsAction = crmAction<typeof impl.grantCreditsAction>("aiDesigner", "grantCreditsAction");
export const saveDesignerSettingsAction = crmAction<typeof impl.saveDesignerSettingsAction>("aiDesigner", "saveDesignerSettingsAction");
