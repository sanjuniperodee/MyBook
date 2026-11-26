"use server";

/**
 * Server actions: код — в src/server/crm-actions/settings-kaspi.ts; на сайте с БД выполняется здесь же, на сайте без БД —
 * в mybook-api через API v1 (ADR 0012, A5 — Раздел 5, crmAction). Права, zod и лимиты проверяет само действие.
 */
import { crmAction } from "@/web/crm";
import type * as impl from "@/server/crm-actions/settings-kaspi";

export const requestKaspiCodeAction = crmAction<typeof impl.requestKaspiCodeAction>("settingsKaspi", "requestKaspiCodeAction");
export const confirmKaspiCodeAction = crmAction<typeof impl.confirmKaspiCodeAction>("settingsKaspi", "confirmKaspiCodeAction");
export const setKaspiEnabledAction = crmAction<typeof impl.setKaspiEnabledAction>("settingsKaspi", "setKaspiEnabledAction");
export const saveKaspiApiUrlAction = crmAction<typeof impl.saveKaspiApiUrlAction>("settingsKaspi", "saveKaspiApiUrlAction");
export const saveKaspiAlertAfterAction = crmAction<typeof impl.saveKaspiAlertAfterAction>("settingsKaspi", "saveKaspiAlertAfterAction");
export const kaspiStatusAction = crmAction<typeof impl.kaspiStatusAction>("settingsKaspi", "kaspiStatusAction");
export const disconnectKaspiAction = crmAction<typeof impl.disconnectKaspiAction>("settingsKaspi", "disconnectKaspiAction");
export const ensureKaspiWebhookSecretAction = crmAction<typeof impl.ensureKaspiWebhookSecretAction>("settingsKaspi", "ensureKaspiWebhookSecretAction");
