"use server";

/**
 * Server actions: код — в src/server/crm-actions/settings-crm.ts; на сайте с БД выполняется здесь же, на сайте без БД —
 * в mybook-api через API v1 (ADR 0012, A5 — Раздел 5, crmAction). Права, zod и лимиты проверяет само действие.
 */
import { crmAction } from "@/web/crm";
import type * as impl from "@/server/crm-actions/settings-crm";

export const saveCrmSettingsAction = crmAction<typeof impl.saveCrmSettingsAction>("settingsCrm", "saveCrmSettingsAction");
export const saveHolidaysAction = crmAction<typeof impl.saveHolidaysAction>("settingsCrm", "saveHolidaysAction");
export const saveTemplateAction = crmAction<typeof impl.saveTemplateAction>("settingsCrm", "saveTemplateAction");
export const deleteTemplateAction = crmAction<typeof impl.deleteTemplateAction>("settingsCrm", "deleteTemplateAction");
export const saveBotAction = crmAction<typeof impl.saveBotAction>("settingsCrm", "saveBotAction");
export const previewBotAction = crmAction<typeof impl.previewBotAction>("settingsCrm", "previewBotAction");
export const runBotCoachAction = crmAction<typeof impl.runBotCoachAction>("settingsCrm", "runBotCoachAction");
export const deleteBotLessonAction = crmAction<typeof impl.deleteBotLessonAction>("settingsCrm", "deleteBotLessonAction");
export const addBotLessonAction = crmAction<typeof impl.addBotLessonAction>("settingsCrm", "addBotLessonAction");
export const saveBotMaterialsAction = crmAction<typeof impl.saveBotMaterialsAction>("settingsCrm", "saveBotMaterialsAction");
export const deleteBotMaterialAction = crmAction<typeof impl.deleteBotMaterialAction>("settingsCrm", "deleteBotMaterialAction");
