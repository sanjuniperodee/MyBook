"use server";

/**
 * Server actions: код — в src/server/crm-actions/templates.ts; на сайте с БД выполняется здесь же, на сайте без БД —
 * в mybook-api через API v1 (ADR 0012, A5 — Раздел 5, crmAction). Права, zod и лимиты проверяет само действие.
 */
import { crmAction } from "@/web/crm";
import type * as impl from "@/server/crm-actions/templates";

export const saveMyTemplateAction = crmAction<typeof impl.saveMyTemplateAction>("templates", "saveMyTemplateAction");
export const deleteMyTemplateAction = crmAction<typeof impl.deleteMyTemplateAction>("templates", "deleteMyTemplateAction");
export const duplicateTemplateAction = crmAction<typeof impl.duplicateTemplateAction>("templates", "duplicateTemplateAction");
export const reorderMyTemplatesAction = crmAction<typeof impl.reorderMyTemplatesAction>("templates", "reorderMyTemplatesAction");
