"use server";

/**
 * Server actions: код — в src/server/crm-actions/deals.ts; на сайте с БД выполняется здесь же, на сайте без БД —
 * в mybook-api через API v1 (ADR 0012, A5 — Раздел 5, crmAction). Права, zod и лимиты проверяет само действие.
 */
import { crmAction } from "@/web/crm";
import type * as impl from "@/server/crm-actions/deals";
export type { DealFormState, DealActionResult, ClientFromDealState } from "@/server/crm-actions/deals";

export const createDealAction = crmAction<typeof impl.createDealAction>("deals", "createDealAction");
export const updateDealAction = crmAction<typeof impl.updateDealAction>("deals", "updateDealAction");
export const setDealAgreedPlanAction = crmAction<typeof impl.setDealAgreedPlanAction>("deals", "setDealAgreedPlanAction");
export const setDealAgreedGiftsAction = crmAction<typeof impl.setDealAgreedGiftsAction>("deals", "setDealAgreedGiftsAction");
export const moveDealAction = crmAction<typeof impl.moveDealAction>("deals", "moveDealAction");
export const assignDealAction = crmAction<typeof impl.assignDealAction>("deals", "assignDealAction");
export const deleteDealAction = crmAction<typeof impl.deleteDealAction>("deals", "deleteDealAction");
export const linkDealClientAction = crmAction<typeof impl.linkDealClientAction>("deals", "linkDealClientAction");
export const saveStageAction = crmAction<typeof impl.saveStageAction>("deals", "saveStageAction");
export const saveEntryStageAction = crmAction<typeof impl.saveEntryStageAction>("deals", "saveEntryStageAction");
export const moveStageAction = crmAction<typeof impl.moveStageAction>("deals", "moveStageAction");
export const deleteStageAction = crmAction<typeof impl.deleteStageAction>("deals", "deleteStageAction");
export const acceptDealAction = crmAction<typeof impl.acceptDealAction>("deals", "acceptDealAction");
export const rejectDealAction = crmAction<typeof impl.rejectDealAction>("deals", "rejectDealAction");
export const declineRejectionAction = crmAction<typeof impl.declineRejectionAction>("deals", "declineRejectionAction");
export const mergeDealAction = crmAction<typeof impl.mergeDealAction>("deals", "mergeDealAction");
export const unblockAction = crmAction<typeof impl.unblockAction>("deals", "unblockAction");
export const addBlocklistAction = crmAction<typeof impl.addBlocklistAction>("deals", "addBlocklistAction");
export const createPipelineAction = crmAction<typeof impl.createPipelineAction>("deals", "createPipelineAction");
export const renamePipelineAction = crmAction<typeof impl.renamePipelineAction>("deals", "renamePipelineAction");
export const deletePipelineAction = crmAction<typeof impl.deletePipelineAction>("deals", "deletePipelineAction");
export const movePipelineAction = crmAction<typeof impl.movePipelineAction>("deals", "movePipelineAction");
export const bulkDealsAction = crmAction<typeof impl.bulkDealsAction>("deals", "bulkDealsAction");
export const saveViewAction = crmAction<typeof impl.saveViewAction>("deals", "saveViewAction");
export const deleteViewAction = crmAction<typeof impl.deleteViewAction>("deals", "deleteViewAction");
export const createClientFromDealAction = crmAction<typeof impl.createClientFromDealAction>("deals", "createClientFromDealAction");
export const saveStageOrderAction = crmAction<typeof impl.saveStageOrderAction>("deals", "saveStageOrderAction");
