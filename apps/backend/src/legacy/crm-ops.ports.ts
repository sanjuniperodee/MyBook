import type { Provider } from "@nestjs/common";
import { getSetting, listFields } from "@/modules/workspace";
import type { Container } from "@/server/container";
import { runCrmAction } from "@/server/crm-actions";
import { remindManyAction } from "@/server/crm-actions/admin";
import { setPayFormAction } from "@/server/crm-actions/sales";
import {
  confirmTwoFactorAction,
  disableTwoFactorAction,
  newBackupCodesAction,
  resetStaffTwoFactorAction,
  saveSecurityAction,
} from "@/server/crm-actions/security";
import { saveBotAction, saveCrmSettingsAction } from "@/server/crm-actions/settings-crm";
import { notifyTicketAction, updateTicketAction } from "@/server/crm-actions/support";
import { deleteRoleAction, saveRoleAction } from "@/server/crm-actions/team";
import { runCrmOp } from "@/server/crm-ops/registry";
import { loadSalesAnalytics } from "@/server/sales-analytics";
import { CRM_OPS_PORTS, type CrmOpsPorts } from "../modules/crm-ops/crm-ops.tokens";
import { runInLegacyRequest, toLegacyStaff } from "./legacy-request";
import { LEGACY_CONTAINER } from "./legacy.tokens";

/**
 * Адаптер переходного периода для Контекста 5A-1 (`CrmOpsApiModule`):
 * все вызовы `crm-actions/*`, `crm-ops/*` и `sales-analytics` выполняются внутри `runInLegacyRequest`,
 * чтобы в процессе NestJS не было ни одного обращения к `next/headers`.
 */
export const legacyCrmOpsPorts: Provider<CrmOpsPorts> = {
  provide: CRM_OPS_PORTS,
  useFactory: (c: Container): CrmOpsPorts => ({
    // ─── Доски задач ───────────────────────────────────────────────────────────────────────────────────────────
    listBoards: (viewer) => c.boards.boards.list(viewer),
    viewBoard: (viewer, boardId, opts) => c.boards.boards.view(viewer, boardId, opts),
    createCard: (viewer, input) => c.boards.cards.create(viewer, input),
    cardSummary: (viewer, cardId) => c.boards.cards.summary(viewer, cardId),
    cardDetail: (viewer, cardId) => c.boards.cards.detail(viewer, cardId),
    updateCard: async (viewer, cardId, patch) => {
      await c.boards.cards.update(viewer, cardId, patch);
    },
    removeCard: async (viewer, cardId) => {
      await c.boards.cards.remove(viewer, cardId);
    },
    moveCard: async (viewer, cardId, input) => {
      await c.boards.cards.move(viewer, cardId, input);
    },
    setCardDone: async (viewer, cardId, done, result) => {
      await c.boards.cards.setDone(viewer, cardId, done, result);
    },
    archiveCard: async (viewer, cardId, archived) => {
      await c.boards.cards.archive(viewer, cardId, archived);
    },
    setCardAssignees: async (viewer, cardId, userIds) => {
      await c.boards.cards.setAssignees(viewer, cardId, userIds);
    },
    setCardWatching: async (viewer, cardId, userId, on) => {
      await c.boards.cards.setWatching(viewer, cardId, userId, on);
    },
    setCardLabel: async (viewer, cardId, labelId, on) => {
      await c.boards.cards.setLabel(viewer, cardId, labelId, on);
    },
    addChecklist: (viewer, cardId, title, items) => c.boards.cards.addChecklist(viewer, cardId, title, items),
    addChecklistItem: (viewer, checklistId, text) => c.boards.cards.addItem(viewer, checklistId, text),
    updateChecklistItem: async (viewer, itemId, patch) => {
      await c.boards.cards.updateItem(viewer, itemId, patch);
    },
    deleteChecklistItem: async (viewer, itemId) => {
      await c.boards.cards.deleteItem(viewer, itemId);
    },
    commentCard: (viewer, cardId, text) => c.boards.cards.comment(viewer, cardId, text),
    attachCardFile: (viewer, cardId, file) => c.boards.cards.attach(viewer, cardId, file),
    calendarRange: (viewer, from, to, opts) => c.boards.calendar.range(viewer, from, to, opts),

    // ─── Веб-CRM ───────────────────────────────────────────────────────────────────────────────────────────────
    runCrmOp: (call, op, args) => runInLegacyRequest(call, () => runCrmOp(op, args)),
    runCrmAction: (call, op, args) => runInLegacyRequest(call, () => runCrmAction(op, args)),

    // ─── Книги CRM ─────────────────────────────────────────────────────────────────────────────────────────────
    bookList: (filter, opts) => c.reporting.bookList(filter, opts),
    remindMany: (call, clientIds) => runInLegacyRequest(call, () => remindManyAction(clientIds)),

    // ─── Поддержка ─────────────────────────────────────────────────────────────────────────────────────────────
    supportList: (filter) => c.support.tickets.list(filter),
    supportCounts: (createdBy) => c.support.tickets.counts(createdBy),
    supportTicketByNumber: (number) => c.support.tickets.byNumber(number),
    supportUpdate: (call, number, input) => runInLegacyRequest(call, () => updateTicketAction(number, input)),
    supportNotify: (call, number, id) => runInLegacyRequest(call, () => notifyTicketAction(number, id)),

    // ─── Отчёты, аналитика и настройки ─────────────────────────────────────────────────────────────────────────
    allStaff: () => c.access.queries.allStaff(),
    getSetting: (key) => getSetting(key),
    listFields: (entity) => listFields(entity),
    salesRegister: (range) => c.reporting.salesRegister(range),
    setPayForm: (call, dealId, form) => runInLegacyRequest(call, () => setPayFormAction(dealId, form)),
    loadSalesAnalytics: (call, staff, query) =>
      runInLegacyRequest(call, () => loadSalesAnalytics(toLegacyStaff(staff), query)),
    leadStats: (range) => c.reporting.leadStats(range),
    mergeClosedDays: () => c.sales.deals.mergeClosedDays(),
    saveCrmSettings: (call, form) => runInLegacyRequest(call, () => saveCrmSettingsAction({}, form)),
    saveBot: (call, input) => runInLegacyRequest(call, () => saveBotAction(input)),

    // ─── Роли и безопасность (2FA) ─────────────────────────────────────────────────────────────────────────────
    rolesWithMembers: () => c.access.queries.rolesWithMembers(),
    saveRole: (call, form) => runInLegacyRequest(call, () => saveRoleAction({}, form)),
    deleteRole: (call, roleId) => runInLegacyRequest(call, () => deleteRoleAction(roleId)),
    twoFactorStatus: () => c.access.queries.twoFactorStatus(),
    beginTwoFactor: (userId) => c.identity.accounts.beginTwoFactor(userId),
    confirmTwoFactor: (call, code) => runInLegacyRequest(call, () => confirmTwoFactorAction(code)),
    newBackupCodes: (call, code) => runInLegacyRequest(call, () => newBackupCodesAction(code)),
    disableTwoFactor: (call, code) => runInLegacyRequest(call, () => disableTwoFactorAction(code)),
    saveSecurity: (call, form) => runInLegacyRequest(call, () => saveSecurityAction({}, form)),
    resetStaffTwoFactor: (call, userId) => runInLegacyRequest(call, () => resetStaffTwoFactorAction(userId)),
  }),
  inject: [LEGACY_CONTAINER],
};
