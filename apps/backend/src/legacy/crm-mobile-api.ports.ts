import type { Provider } from "@nestjs/common";
import { staffViewer } from "@/server/access";
import { convertAudio } from "@/server/audio-convert";
import type { Container } from "@/server/container";
import {
  addNoteAction,
  completeTaskAction,
  createTaskAction,
  deleteTaskAction,
  moveOrderAction,
  snoozeTaskAction,
  toggleTaskAction,
  updateTaskAction,
} from "@/server/crm-actions/admin";
import { aiTemplateDraftAction } from "@/server/crm-actions/ai";
import { chatProductsAction, orderItemsAction, sendCatalogLinkAction, sendProductAction } from "@/server/crm-actions/catalog";
import {
  assignConversationAction,
  createDealFromChatAction,
  deleteMessageAction,
  editMessageAction,
  forwardMessageAction,
  forwardTargetsAction,
  markReadAction,
  pinChatAction,
  resendMessageAction,
  sendInternalNoteAction,
  sendMessageAction,
  setConversationStatusAction,
  transcribeMessageAction,
} from "@/server/crm-actions/chats";
import { callAction, markCallHandledAction, openChatAction, setShiftAction } from "@/server/crm-actions/crm";
import { acceptDealAction, assignDealAction, createDealAction, moveDealAction, rejectDealAction } from "@/server/crm-actions/deals";
import {
  deleteMyTemplateAction,
  duplicateTemplateAction,
  reorderMyTemplatesAction,
  saveMyTemplateAction,
} from "@/server/crm-actions/templates";
import { taskJson } from "@/server/crm-lists/work";
import { autoShiftOnVisit } from "@/server/shift";
import { loadTaskDetail } from "@/server/task-detail";
import { CRM_MOBILE_API_PORTS, type CrmMobileApiPorts, type CrmRequestContext } from "../modules/crm-mobile-api/crm-mobile-api.tokens";
import { runInLegacyRequest, toLegacyStaff } from "./legacy-request";
import { LEGACY_CONTAINER } from "./legacy.tokens";

const iso = (d: Date | null): string | null => d?.toISOString() ?? null;

const inRequest = <T>(ctx: CrmRequestContext, fn: () => T): T =>
  runInLegacyRequest({ staff: ctx.staff, token: ctx.token, ip: ctx.ip, locale: ctx.locale }, fn);

/**
 * Адаптер портов Контекста 4B («CRM-1: мобильный API v1») к старому контейнеру и серверным действиям
 * `src/server/crm-actions/*`. Все вызовы обёрнуты в `runInLegacyRequest` — ноль обращений к `next/headers`.
 */
export const legacyCrmMobileApiPorts: Provider<CrmMobileApiPorts> = {
  provide: CRM_MOBILE_API_PORTS,
  useFactory: (c: Container): CrmMobileApiPorts => ({
    // Профиль сотрудника, смена, «Обзор»
    autoShiftOnVisit: (ctx) => inRequest(ctx, () => autoShiftOnVisit(toLegacyStaff(ctx.staff))),
    setShift: (ctx, onShift) => inRequest(ctx, () => setShiftAction(onShift)),
    live: (context) => c.reporting.live(context),
    dashboard: (staff, period) => c.reporting.dashboard(period, staffViewer(toLegacyStaff(staff))),
    stageCounts: () => c.reporting.stageCounts(),
    listStages: () => c.sales.queries.listStages(),

    // Личные шаблоны ответов
    listTemplates: (userId) => c.messaging.view.templates(userId),
    saveMyTemplate: (ctx, id, title, text) => inRequest(ctx, () => saveMyTemplateAction(id, title, text)),
    deleteMyTemplate: (ctx, id) => inRequest(ctx, () => deleteMyTemplateAction(id)),
    duplicateTemplate: (ctx, id) => inRequest(ctx, () => duplicateTemplateAction(id)),
    reorderMyTemplates: (ctx, ids) => inRequest(ctx, () => reorderMyTemplatesAction(ids)),
    aiTemplateDraft: (ctx, chatId, messageId) => inRequest(ctx, () => aiTemplateDraftAction(chatId, messageId)),

    // Звонки
    callDial: (ctx, target) => inRequest(ctx, () => callAction(target)),
    markCallHandled: (ctx, callId) => inRequest(ctx, () => markCallHandledAction(callId)),

    // Каталог WhatsApp в чате и корзина клиента
    chatProducts: (ctx) => inRequest(ctx, () => chatProductsAction()),
    sendProduct: (ctx, chatId, productId) => inRequest(ctx, () => sendProductAction(chatId, productId)),
    sendCatalogLink: (ctx, chatId) => inRequest(ctx, () => sendCatalogLinkAction(chatId)),
    orderItems: (ctx, messageId) => inRequest(ctx, () => orderItemsAction(messageId)),

    // Чаты и сообщения
    openChat: (ctx, target) => inRequest(ctx, () => openChatAction(target)),
    forwardTargets: (ctx, q) => inRequest(ctx, () => forwardTargetsAction(q)),
    assignConversation: (ctx, chatId, userId) => inRequest(ctx, () => assignConversationAction(chatId, userId)),
    createDealFromChat: (ctx, chatId) => inRequest(ctx, () => createDealFromChatAction(chatId)),
    forwardMessage: (ctx, chatId, messageId, targetIds) => inRequest(ctx, () => forwardMessageAction(chatId, messageId, targetIds)),
    sendInternalNote: (ctx, chatId, text) => inRequest(ctx, () => sendInternalNoteAction(chatId, text)),
    pinChat: (ctx, chatId, pinned) => inRequest(ctx, () => pinChatAction(chatId, pinned)),
    markRead: async (ctx, chatId) => {
      await inRequest(ctx, () => markReadAction(chatId));
    },
    setConversationStatus: (ctx, chatId, status) => inRequest(ctx, () => setConversationStatusAction(chatId, status)),
    sendMessage: (ctx, chatId, text, override, replyToId) =>
      inRequest(ctx, () => sendMessageAction(chatId, text, override, replyToId)),
    findConversation: async (chatId) => {
      const conv = await c.messaging.queries.conversation(chatId);
      return conv ? { id: conv.id, assigneeId: conv.assigneeId } : null;
    },
    convertAudio: (data, to) => convertAudio(data, to),
    sendUpload: async (conversationId, upload, caption, staffUserId, opts) => {
      const msg = await c.messaging.sendUpload(conversationId, upload, caption, staffUserId, opts);
      return { id: msg.id, status: msg.status, error: "error" in msg && msg.error ? msg.error : null };
    },
    editMessage: (ctx, chatId, messageId, text) => inRequest(ctx, () => editMessageAction(chatId, messageId, text)),
    deleteMessage: (ctx, chatId, messageId) => inRequest(ctx, () => deleteMessageAction(chatId, messageId)),
    resendMessage: (ctx, chatId, messageId) => inRequest(ctx, () => resendMessageAction(chatId, messageId)),
    transcribeMessage: (ctx, chatId, messageId) => inRequest(ctx, () => transcribeMessageAction(chatId, messageId)),

    // Сделки
    createDeal: (ctx, form) => inRequest(ctx, () => createDealAction({}, form)),
    acceptDeal: (ctx, dealId) => inRequest(ctx, () => acceptDealAction(dealId)),
    assignDeal: (ctx, dealId, userId) => inRequest(ctx, () => assignDealAction(dealId, userId)),
    moveDeal: (ctx, dealId, stageId, lostReason) => inRequest(ctx, () => moveDealAction(dealId, stageId, lostReason)),
    addNote: (ctx, form) => inRequest(ctx, () => addNoteAction({}, form)),
    rejectDeal: (ctx, dealId, spam, reason) => inRequest(ctx, () => rejectDealAction(dealId, spam, reason)),

    // Задачи
    createTask: (ctx, form) => inRequest(ctx, () => createTaskAction({}, form)),
    taskDetail: (ctx, taskId) =>
      inRequest(ctx, async () => {
        const legacyStaff = toLegacyStaff(ctx.staff);
        const d = await loadTaskDetail(legacyStaff, taskId);
        if (!d) return null;
        return {
          item: { ...taskJson(d.raw, legacyStaff, new Date()), contact: d.row.contact },
          task: {
            ...d.task,
            dueAt: iso(d.task.dueAt),
            doneAt: iso(d.task.doneAt),
            done: !!d.task.doneAt,
            remindBeforeMin: d.row.remindBeforeMin,
          },
          deal: d.deal,
          client: d.client,
          contact: d.contact,
          order: d.order,
          chat: d.chat,
          notes: d.notes.map((n) => ({ ...n, at: n.at.toISOString() })),
          others: d.others.map((o) => ({ ...o, dueAt: iso(o.dueAt) })),
          reach: d.row.contact ?? null,
        };
      }),
    updateTask: (ctx, taskId, patch) => inRequest(ctx, () => updateTaskAction(taskId, patch)),
    deleteTask: (ctx, taskId) => inRequest(ctx, () => deleteTaskAction(taskId)),
    completeTask: (ctx, taskId, body) => inRequest(ctx, () => completeTaskAction(taskId, body)),
    snoozeTask: (ctx, taskId, by) => inRequest(ctx, () => snoozeTaskAction(taskId, by)),
    toggleTask: (ctx, taskId) => inRequest(ctx, () => toggleTaskAction(taskId)),

    // Заказы (канбан)
    moveOrder: (ctx, orderId, status) => inRequest(ctx, () => moveOrderAction(orderId, status)),
  }),
  inject: [LEGACY_CONTAINER],
};
