"use server";

/**
 * Server actions: код — в src/server/crm-actions/settings-ai.ts; на сайте с БД выполняется здесь же, на сайте без БД —
 * в mybook-api через API v1 (ADR 0012, A5 — Раздел 5, crmAction). Права, zod и лимиты проверяет само действие.
 */
import { crmAction } from "@/web/crm";
import type * as impl from "@/server/crm-actions/settings-ai";

export const saveAiAction = crmAction<typeof impl.saveAiAction>("settingsAi", "saveAiAction");
export const testAiAction = crmAction<typeof impl.testAiAction>("settingsAi", "testAiAction");
export const saveProofreadAction = crmAction<typeof impl.saveProofreadAction>("settingsAi", "saveProofreadAction");
export const testProofreadAction = crmAction<typeof impl.testProofreadAction>("settingsAi", "testProofreadAction");
export const saveWriterAction = crmAction<typeof impl.saveWriterAction>("settingsAi", "saveWriterAction");
export const testWriterAction = crmAction<typeof impl.testWriterAction>("settingsAi", "testWriterAction");
export const saveSellerAction = crmAction<typeof impl.saveSellerAction>("settingsAi", "saveSellerAction");
export const saveRoutingAction = crmAction<typeof impl.saveRoutingAction>("settingsAi", "saveRoutingAction");
export const saveMediaAction = crmAction<typeof impl.saveMediaAction>("settingsAi", "saveMediaAction");
export const testSellerAction = crmAction<typeof impl.testSellerAction>("settingsAi", "testSellerAction");
