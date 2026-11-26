"use server";

/**
 * Server actions: код — в src/server/crm-actions/settings-mail.ts; на сайте с БД выполняется здесь же, на сайте без БД —
 * в mybook-api через API v1 (ADR 0012, A5 — Раздел 5, crmAction). Права, zod и лимиты проверяет само действие.
 */
import { crmAction } from "@/web/crm";
import type * as impl from "@/server/crm-actions/settings-mail";

export const saveEmailAction = crmAction<typeof impl.saveEmailAction>("settingsMail", "saveEmailAction");
export const testImapAction = crmAction<typeof impl.testImapAction>("settingsMail", "testImapAction");
export const saveSmtpAction = crmAction<typeof impl.saveSmtpAction>("settingsMail", "saveSmtpAction");
export const testSmtpAction = crmAction<typeof impl.testSmtpAction>("settingsMail", "testSmtpAction");
export const sendTestMailAction = crmAction<typeof impl.sendTestMailAction>("settingsMail", "sendTestMailAction");
