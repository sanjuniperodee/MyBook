"use server";

/**
 * Server actions: код — в src/server/crm-actions/team.ts; на сайте с БД выполняется здесь же, на сайте без БД —
 * в mybook-api через API v1 (ADR 0012, A5 — Раздел 5, crmAction). Права, zod и лимиты проверяет само действие.
 */
import { crmAction } from "@/server/v1-local-bridge-crm";
import type * as impl from "@/server/crm-actions/team";
export type { TeamState } from "@/server/crm-actions/team";

export const createStaffAction = crmAction<typeof impl.createStaffAction>("team", "createStaffAction");
export const setStaffRoleAction = crmAction<typeof impl.setStaffRoleAction>("team", "setStaffRoleAction");
export const setStaffExtensionAction = crmAction<typeof impl.setStaffExtensionAction>("team", "setStaffExtensionAction");
export const setStaffPhoneAction = crmAction<typeof impl.setStaffPhoneAction>("team", "setStaffPhoneAction");
export const setStaffDisabledAction = crmAction<typeof impl.setStaffDisabledAction>("team", "setStaffDisabledAction");
export const revokeStaffAction = crmAction<typeof impl.revokeStaffAction>("team", "revokeStaffAction");
export const resetStaffPasswordAction = crmAction<typeof impl.resetStaffPasswordAction>("team", "resetStaffPasswordAction");
export const saveRoleAction = crmAction<typeof impl.saveRoleAction>("team", "saveRoleAction");
export const deleteRoleAction = crmAction<typeof impl.deleteRoleAction>("team", "deleteRoleAction");
export const savePlanAction = crmAction<typeof impl.savePlanAction>("team", "savePlanAction");
