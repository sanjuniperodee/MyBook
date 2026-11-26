"use server";

/**
 * Server actions: код — в src/server/crm-actions/security.ts; на сайте с БД выполняется здесь же, на сайте без БД —
 * в mybook-api через API v1 (ADR 0012, A5 — Раздел 5, crmAction). Права, zod и лимиты проверяет само действие.
 */
import { crmAction } from "@/server/v1-local-bridge-crm";
import type * as impl from "@/server/crm-actions/security";

export const startTwoFactorAction = crmAction<typeof impl.startTwoFactorAction>("security", "startTwoFactorAction");
export const confirmTwoFactorAction = crmAction<typeof impl.confirmTwoFactorAction>("security", "confirmTwoFactorAction");
export const newBackupCodesAction = crmAction<typeof impl.newBackupCodesAction>("security", "newBackupCodesAction");
export const disableTwoFactorAction = crmAction<typeof impl.disableTwoFactorAction>("security", "disableTwoFactorAction");
export const resetStaffTwoFactorAction = crmAction<typeof impl.resetStaffTwoFactorAction>("security", "resetStaffTwoFactorAction");
export const saveSecurityAction = crmAction<typeof impl.saveSecurityAction>("security", "saveSecurityAction");
