import type { Provider } from "@nestjs/common";
import { listFields, staffNotifications } from "@/modules/workspace";
import type { Container } from "@/server/container";
import { remindClientAction, updateClientTagsAction } from "@/server/crm-actions/admin";
import { botTraceAction, sendOfferAction, startBotAction, stopBotAction } from "@/server/crm-actions/chats";
import { createClientAction, issueClientAccessAction } from "@/server/crm-actions/clients-new";
import {
  setClientChannelAction,
  setClientFieldsAction,
  setClientLocaleAction,
  setClientManagerAction,
  setClientNoMarketingAction,
  setClientPhonesAction,
} from "@/server/crm-actions/crm";
import {
  createClientFromDealAction,
  deleteDealAction,
  linkDealClientAction,
  mergeDealAction,
  movePipelineAction,
  setDealAgreedGiftsAction,
  setDealAgreedPlanAction,
  updateDealAction,
} from "@/server/crm-actions/deals";
import { mobileChatDetail, mobileChatList, mobileDealDetail, mobileDeals, mobileMessages } from "@/server/crm-lists/data";
import { mobileOrder, mobileOrders } from "@/server/crm-lists/orders";
import { mobileCalls, mobileClient, mobileClients, mobileStaff, mobileTasks, mobileToday } from "@/server/crm-lists/work";
import { discountLimit } from "@/server/discount";
import { payFormOptions } from "@/server/pay-form";
import { POST as receiptRoute } from "@/server/site-handlers/admin/deals-id-receipts";
import {
  CRM_CHATS_PORTS,
  CRM_CLIENTS_PORTS,
  CRM_DEALS_PORTS,
  CRM_LISTS_PORTS,
  type CrmChatsPorts,
  type CrmClientsPorts,
  type CrmDealsPorts,
  type CrmListsPorts,
} from "../modules/crm-core/crm-core.tokens";
import { runInLegacyRequest, toLegacyStaff } from "./legacy-request";
import { LEGACY_CONTAINER } from "./legacy.tokens";

/**
 * Адаптер портов Контекста 4A («CRM-1: списки, сделки, клиенты, чаты и КП») к старому контейнеру, `crm-lists/*`,
 * `crm-actions/*` и `deals-id-receipts`. Все вызовы `crm-actions/*` и обработчика чека выполняются внутри
 * `runInLegacyRequest`, поэтому нет ни одного обращения к `next/headers`.
 */
export const legacyCrmListsPorts: Provider<CrmListsPorts> = {
  provide: CRM_LISTS_PORTS,
  useFactory: (c: Container): CrmListsPorts => ({
    today: (staff) => mobileToday(toLegacyStaff(staff)),
    tasks: (staff, opts) => mobileTasks(toLegacyStaff(staff), opts),
    calls: (staff, filter, days) => mobileCalls(toLegacyStaff(staff), filter, days),
    clients: (staff, opts) => mobileClients(toLegacyStaff(staff), opts),
    clientCard: (staff, clientId) => mobileClient(toLegacyStaff(staff), clientId),
    staffList: (staff) => mobileStaff(toLegacyStaff(staff)),
    notifications: (userId, limit) => staffNotifications(userId, limit),
    markNotificationsRead: async (userId, id) => {
      await c.workspace.inbox.markRead(userId, id);
    },
    chats: (staff, filter, q) => mobileChatList(toLegacyStaff(staff), filter, q),
    chatDetail: (staff, chatId, limit) => mobileChatDetail(toLegacyStaff(staff), chatId, limit),
    conversation: async (chatId) => (await c.messaging.queries.conversation(chatId)) ?? null,
    chatMessages: (conversationId, limit, before) => mobileMessages(conversationId, limit, before),
    deals: (staff, query) => mobileDeals(toLegacyStaff(staff), query),
    dealDetail: (staff, dealId) => mobileDealDetail(toLegacyStaff(staff), dealId),
    orders: (staff) => mobileOrders(toLegacyStaff(staff)),
    orderDetail: (staff, orderId) => mobileOrder(toLegacyStaff(staff), orderId),
  }),
  inject: [LEGACY_CONTAINER],
};

export const legacyCrmDealsPorts: Provider<CrmDealsPorts> = {
  provide: CRM_DEALS_PORTS,
  useFactory: (c: Container): CrmDealsPorts => ({
    findDeal: async (dealId) => (await c.sales.deals.findById(dealId)) ?? null,
    dealById: async (dealId) => (await c.reporting.dealById(dealId)) ?? null,
    listFields: (entity) => listFields(entity),
    agreedPlan: (dealId) => c.sales.agreedPlan.get(dealId),
    agreedGifts: (dealId) => c.sales.agreedGifts.get(dealId),
    discountLimit: (staff) => discountLimit(toLegacyStaff(staff)),
    updateDeal: (meta, form) => runInLegacyRequest(meta, () => updateDealAction({}, form)),
    setAgreedPlan: (meta, dealId, plan) => runInLegacyRequest(meta, () => setDealAgreedPlanAction(dealId, plan)),
    setAgreedGifts: (meta, dealId, gifts) => runInLegacyRequest(meta, () => setDealAgreedGiftsAction(dealId, gifts)),
    duplicates: (deal) => c.sales.queries.duplicates(deal),
    findClientByPhone: (phone) => c.sales.deals.findClientByPhone(phone),
    clientBrief: async (clientId) => (await c.reporting.clientBrief(clientId)) ?? null,
    listPipelines: () => c.sales.queries.listPipelines(),
    listStages: () => c.sales.queries.listStages(),
    createClientFromDeal: (meta, dealId, form) => runInLegacyRequest(meta, () => createClientFromDealAction(dealId, {}, form)),
    linkDealClient: (meta, dealId, clientId) => runInLegacyRequest(meta, () => linkDealClientAction(dealId, clientId)),
    mergeDeal: (meta, targetId, sourceId) => runInLegacyRequest(meta, () => mergeDealAction(targetId, sourceId)),
    movePipeline: (meta, dealId, pipelineId) => runInLegacyRequest(meta, () => movePipelineAction(dealId, pipelineId)),
    deleteDeal: (meta, dealId) => runInLegacyRequest(meta, () => deleteDealAction(dealId)),
  }),
  inject: [LEGACY_CONTAINER],
};

export const legacyCrmClientsPorts: Provider<CrmClientsPorts> = {
  provide: CRM_CLIENTS_PORTS,
  useFactory: (c: Container): CrmClientsPorts => ({
    clientById: async (clientId) => (await c.reporting.clientById(clientId)) ?? null,
    listFields: (entity) => listFields(entity),
    noMarketingFor: async (target) => Boolean(await c.messaging.chats.noMarketingFor(target)),
    allStaff: () => c.access.queries.allStaff(),
    listStages: () => c.sales.queries.listStages(),
    listPipelines: () => c.sales.queries.listPipelines(),
    discountLimit: (staff) => discountLimit(toLegacyStaff(staff)),
    payFormOptions: () => payFormOptions(),
    issueClientAccess: (meta, clientId) => runInLegacyRequest(meta, () => issueClientAccessAction(clientId)),
    remindClient: (meta, clientId) => runInLegacyRequest(meta, () => remindClientAction(clientId)),
    setClientPhones: (meta, clientId, raw) => runInLegacyRequest(meta, () => setClientPhonesAction(clientId, raw)),
    updateClientTags: (meta, clientId, tags) => runInLegacyRequest(meta, () => updateClientTagsAction(clientId, tags)),
    setClientFields: (meta, form) => runInLegacyRequest(meta, () => setClientFieldsAction({}, form)),
    setClientNoMarketing: (meta, clientId, on) => runInLegacyRequest(meta, () => setClientNoMarketingAction(clientId, on)),
    setClientLocale: (meta, clientId, locale) => runInLegacyRequest(meta, () => setClientLocaleAction(clientId, locale)),
    setClientChannel: (meta, clientId, channel) => runInLegacyRequest(meta, () => setClientChannelAction(clientId, channel)),
    setClientManager: (meta, clientId, managerId) => runInLegacyRequest(meta, () => setClientManagerAction(clientId, managerId)),
    createClient: (meta, form) =>
      runInLegacyRequest(meta, async () => {
        const r = await createClientAction({}, form);
        if (!r.done) return { error: r.error };
        const d = r.done;
        return {
          done: {
            clientId: d.clientId,
            clientName: d.clientName,
            dealId: d.dealId,
            dealNumber: d.dealNumber,
            parts: d.parts.map((p) => ({
              dealId: p.dealId,
              dealNumber: p.dealNumber,
              agreed: p.agreed,
              prepaid: p.prepaid,
              paymentId: p.paymentId,
            })),
            count: d.count,
            loginText: d.loginText,
            password: d.password,
            loginUrl: d.loginUrl,
            message: d.message,
            agreed: d.agreed,
            prepaid: d.prepaid,
            remainder: d.remainder,
            tasks: d.tasks,
          },
        };
      }),
    uploadDealReceipt: (meta, input) =>
      runInLegacyRequest(meta, async (): Promise<{ ok: true } | { ok: false; response: Response }> => {
        const form = new FormData();
        if (input.amount) form.set("amount", input.amount);
        if (input.paymentId) form.set("paymentId", input.paymentId);
        if (input.file) form.set("file", input.file, input.file.name || "receipt");
        const headers: Record<string, string> = {};
        if (meta.token) headers.authorization = `Bearer ${meta.token}`;
        const res = await receiptRoute(new Request(input.url, { method: "POST", headers, body: form }), {
          params: Promise.resolve({ id: input.dealId }),
        });
        if (!res.ok) return { ok: false, response: res };
        return { ok: true };
      }),
  }),
  inject: [LEGACY_CONTAINER],
};

export const legacyCrmChatsPorts: Provider<CrmChatsPorts> = {
  provide: CRM_CHATS_PORTS,
  useFactory: (c: Container): CrmChatsPorts => ({
    conversation: async (chatId) => (await c.messaging.queries.conversation(chatId)) ?? null,
    botTrace: (meta, chatId, messageId) => runInLegacyRequest(meta, () => botTraceAction(chatId, messageId)),
    botTraces: (chatId, limit) => c.messaging.botTraces(chatId, limit),
    startBot: (meta, chatId) => runInLegacyRequest(meta, () => startBotAction(chatId)),
    stopBot: (meta, chatId) => runInLegacyRequest(meta, () => stopBotAction(chatId)),
    chatOffers: (clientId, canPromo) => c.marketing.service.chatOffers(clientId, canPromo),
    sendOffer: (meta, chatId, request) => runInLegacyRequest(meta, () => sendOfferAction(chatId, request)),
  }),
  inject: [LEGACY_CONTAINER],
};

export const legacyCrmCorePorts: Provider[] = [
  legacyCrmListsPorts,
  legacyCrmDealsPorts,
  legacyCrmClientsPorts,
  legacyCrmChatsPorts,
];

export const LEGACY_CRM_CORE_TOKENS = [CRM_LISTS_PORTS, CRM_DEALS_PORTS, CRM_CLIENTS_PORTS, CRM_CHATS_PORTS] as const;
