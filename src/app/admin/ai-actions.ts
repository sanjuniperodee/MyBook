"use server";

/**
 * Server actions: код — в src/server/crm-actions/ai.ts; на сайте с БД выполняется здесь же, на сайте без БД —
 * в mybook-api через API v1 (ADR 0012, A5 — Раздел 5, crmAction). Права, zod и лимиты проверяет само действие.
 */
import { crmAction } from "@/server/v1-local-bridge-crm";
import type * as impl from "@/server/crm-actions/ai";
export type { FieldProposal } from "@/server/crm-actions/ai";

export const aiSuggestReplyAction = crmAction<typeof impl.aiSuggestReplyAction>("ai", "aiSuggestReplyAction");
export const aiSummaryAction = crmAction<typeof impl.aiSummaryAction>("ai", "aiSummaryAction");
export const aiExtractFieldsAction = crmAction<typeof impl.aiExtractFieldsAction>("ai", "aiExtractFieldsAction");
export const aiApplyFieldsAction = crmAction<typeof impl.aiApplyFieldsAction>("ai", "aiApplyFieldsAction");
export const aiNextStepTaskAction = crmAction<typeof impl.aiNextStepTaskAction>("ai", "aiNextStepTaskAction");
export const aiTemplateDraftAction = crmAction<typeof impl.aiTemplateDraftAction>("ai", "aiTemplateDraftAction");
