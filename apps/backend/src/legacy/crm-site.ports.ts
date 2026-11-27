import type { Provider } from "@nestjs/common";
import { getSetting, subscribe, syncMobileBadge, vapidKeys } from "@/modules/workspace";
import { audit, canSeeOrder } from "@/server/access";
import { convertAudio } from "@/server/audio-convert";
import { boardsApi } from "@/server/boards-api";
import type { Container } from "@/server/container";
import { runCrmOp } from "@/server/crm-ops/registry";
import { serveStorageFile } from "@/server/range-file";
import { sensitiveFor } from "@/server/sensitive";
import { releaseTokenValid } from "@/server/support-release";
import {
  CRM_SITE_PORTS,
  type CrmSitePorts,
  type CrmSiteRequestContext,
  type StorageStreamInput,
} from "../modules/crm-site/crm-site.tokens";
import { runInLegacyRequest, toLegacyStaff } from "./legacy-request";
import { LEGACY_CONTAINER } from "./legacy.tokens";

const inRequest = <T>(ctx: CrmSiteRequestContext, fn: () => T): T =>
  runInLegacyRequest({ staff: ctx.staff, token: ctx.token, ip: ctx.ip, locale: ctx.locale }, fn);

/** Синтетический Request для `serveStorageFile` / `viaFilesService` (Range, If-None-Match, signal) без `next/headers`. */
function storageRequestOf(input: StorageStreamInput): Request {
  const headers = new Headers();
  if (input.range) headers.set("range", input.range);
  if (input.ifNoneMatch) headers.set("if-none-match", input.ifNoneMatch);
  return new Request("http://localhost/", { headers, signal: input.signal });
}

/**
 * Адаптер переходного периода для 28 не-денежных маршрутов сайта CRM (`CrmSiteModule`):
 * связывает порты NestJS со старым контейнером и серверными утилитами без обращений к `next/headers` и `after()`.
 */
export const legacyCrmSitePorts: Provider<CrmSitePorts> = {
  provide: CRM_SITE_PORTS,
  useFactory: (c: Container): CrmSitePorts => ({
    // ─── Чаты и материалы бота ────────────────────────────────────────────
    chatsInbox: (ctx, input) => inRequest(ctx, () => runCrmOp("chats.inbox", input)),
    findConversation: (id) => c.messaging.queries.conversation(id),
    chatMessages: (conversationId, limit, before) => c.messaging.view.messages(conversationId, limit, before),
    sensitiveFor: (conv, text) => sensitiveFor(conv, text),
    sendChatUpload: async (conversationId, file, caption, authorId, opts) => {
      const msg = await c.messaging.sendUpload(conversationId, file, caption, authorId, opts);
      return { id: msg.id, status: msg.status, error: "error" in msg && msg.error ? msg.error : null };
    },
    convertAudio: (data, to) => convertAudio(data, to),
    findMessageMedia: (messageId) => c.messaging.media.find(messageId),
    findDealById: (dealId) => c.sales.deals.findById(dealId),
    openMessageMedia: (attachment, range) => c.messaging.media.open(attachment, range),
    addBotMaterial: (file, meta, actorId) => c.messaging.addMaterial(file, meta, actorId),
    botMaterialFile: (id) => c.messaging.materialFile(id),

    // ─── Доски, вложения задач и поддержка ────────────────────────────────
    boardsDispatch: (ctx, req, path) => inRequest(ctx, () => boardsApi(req, path)),
    boardCardFile: (viewer, cardId, attachmentId) => c.boards.cards.file(viewer, cardId, attachmentId),
    serveBoardFile: (storageKey, mime, req, headers) =>
      serveStorageFile(storageKey, mime, storageRequestOf(req), headers, (r) => c.boards.openFile(storageKey, r)),
    createSupportTicket: (input, uploads, actor, opts) => c.support.tickets.create(input, uploads, actor, opts),
    linkSupportChat: async (ticketId, conversationId, messageIds, actor) => {
      await c.support.tickets.linkChat(ticketId, conversationId, messageIds, actor);
    },
    processSupportTicket: async (ticketId) => {
      await c.support.tickets.process(ticketId);
    },
    scheduleBackground: (fn) => {
      void Promise.resolve().then(fn);
    },
    findSupportTicket: (ticketId) => c.support.tickets.byId(ticketId),
    findSupportAttachment: (ticketId, attachmentId) => c.support.attachment(ticketId, attachmentId),
    serveSupportAttachment: (attachment, req, headers) =>
      serveStorageFile(
        attachment.key,
        attachment.mime || "application/octet-stream",
        storageRequestOf(req),
        headers,
        (r) => c.support.openAttachment(attachment, r),
      ),
    isReleaseTokenValid: (token) => releaseTokenValid(token),
    markSupportReleased: (input) => c.support.tickets.released(input),

    // ─── Каталог WhatsApp ─────────────────────────────────────────────────
    catalogRemoteImage: (url) => c.messaging.gowa.catalogImage(url),
    catalogProductImage: (id) => c.messaging.catalog.image(id),

    // ─── Live/SSE, уведомления, push и упаковка заказа ────────────────────
    liveState: (context) => c.reporting.live(context),
    subscribeLive: (onEvent) => subscribe(onEvent),
    markNotificationsRead: (userId, id) => c.workspace.inbox.markRead(userId, id),
    syncMobileBadge: (userId) => syncMobileBadge(userId),
    vapidKeys: () => vapidKeys(),
    subscribePush: (userId, input) => c.workspace.inbox.subscribe(userId, input),
    unsubscribePush: (userId, endpoint) => c.workspace.inbox.unsubscribe(userId, endpoint),
    findOrderDetails: async (orderId) => (await c.ordering.queries.orderDetails(orderId)) ?? null,
    canSeeOrder: (staff, orderId) => canSeeOrder(toLegacyStaff(staff), orderId),
    preparePrintFiles: async (job) => {
      await c.printFiles.prepare(job);
    },
    getPrintFile: (job, kind) => c.printFiles.getFile(job, kind),

    // ─── Экспорты и аудит ─────────────────────────────────────────────────
    audit: (staff, action, entity, entityId, details) => audit(toLegacyStaff(staff), action, entity, entityId, details),
    allStaff: () => c.access.queries.allStaff(),
    getSetting: (key) => getSetting(key),
    exportClients: (input) => c.reporting.clients(input),
    exportExpenses: (first, last) => c.reporting.expenses(first, last),
    exportFinance: (range) => c.reporting.finance(range),
    exportLeadStats: (range) => c.reporting.leadStats(range),
    exportOrders: (filters, viewer) => c.reporting.orderExport(filters, viewer),
    exportPayments: (days, viewer) => c.reporting.paymentsExport(days, viewer),
    exportProfit: (range) => c.reporting.profit(range),
    exportSalesRegister: (range) => c.reporting.salesRegister(range),
    exportVcard: (input) => c.reporting.vcardClients(input),
  }),
  inject: [LEGACY_CONTAINER],
};
