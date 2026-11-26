"use server";

/**
 * Server actions: код — в src/server/crm-actions/admin.ts; на сайте с БД выполняется здесь же, на сайте без БД —
 * в mybook-api через API v1 (ADR 0012, A5 — Раздел 5, crmAction). Права, zod и лимиты проверяет само действие.
 */
import { crmAction } from "@/web/crm";
import type * as impl from "@/server/crm-actions/admin";
export type { AdminState } from "@/server/crm-actions/admin";

export const updateOrderAction = crmAction<typeof impl.updateOrderAction>("admin", "updateOrderAction");
export const saveAdminNoteAction = crmAction<typeof impl.saveAdminNoteAction>("admin", "saveAdminNoteAction");
export const generateFilesAction = crmAction<typeof impl.generateFilesAction>("admin", "generateFilesAction");
export const toggleBookLockAction = crmAction<typeof impl.toggleBookLockAction>("admin", "toggleBookLockAction");
export const createPromoAction = crmAction<typeof impl.createPromoAction>("admin", "createPromoAction");
export const togglePromoAction = crmAction<typeof impl.togglePromoAction>("admin", "togglePromoAction");
export const moveOrderAction = crmAction<typeof impl.moveOrderAction>("admin", "moveOrderAction");
export const startPostpayAction = crmAction<typeof impl.startPostpayAction>("admin", "startPostpayAction");
export const reviewOrderPaymentAction = crmAction<typeof impl.reviewOrderPaymentAction>("admin", "reviewOrderPaymentAction");
export const upgradeOrderToPrintedAction = crmAction<typeof impl.upgradeOrderToPrintedAction>("admin", "upgradeOrderToPrintedAction");
export const bulkStatusAction = crmAction<typeof impl.bulkStatusAction>("admin", "bulkStatusAction");
export const assignOrderAction = crmAction<typeof impl.assignOrderAction>("admin", "assignOrderAction");
export const updateOrderDetailsAction = crmAction<typeof impl.updateOrderDetailsAction>("admin", "updateOrderDetailsAction");
export const changeOrderTermsAction = crmAction<typeof impl.changeOrderTermsAction>("admin", "changeOrderTermsAction");
export const requestOrderRepriceAction = crmAction<typeof impl.requestOrderRepriceAction>("admin", "requestOrderRepriceAction");
export const voidOrderPaymentAction = crmAction<typeof impl.voidOrderPaymentAction>("admin", "voidOrderPaymentAction");
export const createTaskAction = crmAction<typeof impl.createTaskAction>("admin", "createTaskAction");
export const toggleTaskAction = crmAction<typeof impl.toggleTaskAction>("admin", "toggleTaskAction");
export const completeTaskAction = crmAction<typeof impl.completeTaskAction>("admin", "completeTaskAction");
export const updateTaskAction = crmAction<typeof impl.updateTaskAction>("admin", "updateTaskAction");
export const snoozeTaskAction = crmAction<typeof impl.snoozeTaskAction>("admin", "snoozeTaskAction");
export const deleteTaskAction = crmAction<typeof impl.deleteTaskAction>("admin", "deleteTaskAction");
export const addNoteAction = crmAction<typeof impl.addNoteAction>("admin", "addNoteAction");
export const deleteNoteAction = crmAction<typeof impl.deleteNoteAction>("admin", "deleteNoteAction");
export const updateClientTagsAction = crmAction<typeof impl.updateClientTagsAction>("admin", "updateClientTagsAction");
export const remindClientAction = crmAction<typeof impl.remindClientAction>("admin", "remindClientAction");
export const remindManyAction = crmAction<typeof impl.remindManyAction>("admin", "remindManyAction");
