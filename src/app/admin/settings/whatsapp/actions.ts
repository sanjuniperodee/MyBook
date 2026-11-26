"use server";

/**
 * Server actions: код — в src/server/crm-actions/settings-whatsapp.ts; на сайте с БД выполняется здесь же, на сайте без БД —
 * в mybook-api через API v1 (ADR 0012, A5 — Раздел 5, crmAction). Права, zod и лимиты проверяет само действие.
 */
import { crmAction } from "@/server/v1-local-bridge-crm";
import type * as impl from "@/server/crm-actions/settings-whatsapp";

export const saveWhatsappSettingsAction = crmAction<typeof impl.saveWhatsappSettingsAction>("settingsWhatsapp", "saveWhatsappSettingsAction");
export const saveWhatsappCallsAction = crmAction<typeof impl.saveWhatsappCallsAction>("settingsWhatsapp", "saveWhatsappCallsAction");
export const saveRuleSendingAction = crmAction<typeof impl.saveRuleSendingAction>("settingsWhatsapp", "saveRuleSendingAction");
export const saveLifecycleChatAction = crmAction<typeof impl.saveLifecycleChatAction>("settingsWhatsapp", "saveLifecycleChatAction");
export const gowaQrAction = crmAction<typeof impl.gowaQrAction>("settingsWhatsapp", "gowaQrAction");
export const gowaPairCodeAction = crmAction<typeof impl.gowaPairCodeAction>("settingsWhatsapp", "gowaPairCodeAction");
export const gowaStatusAction = crmAction<typeof impl.gowaStatusAction>("settingsWhatsapp", "gowaStatusAction");
export const gowaLogoutAction = crmAction<typeof impl.gowaLogoutAction>("settingsWhatsapp", "gowaLogoutAction");
export const gowaImportHistoryAction = crmAction<typeof impl.gowaImportHistoryAction>("settingsWhatsapp", "gowaImportHistoryAction");
export const saveCallRecordingDaysAction = crmAction<typeof impl.saveCallRecordingDaysAction>("settingsWhatsapp", "saveCallRecordingDaysAction");
