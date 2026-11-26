/**
 * CRM — чтение списков в API v1 (перенос /api/mobile/*): те же выборки src/server/crm-lists и те же права, что у
 * маршрутов /api/mobile (apiStaff с теми же правами). Тип Handlers сверяет ответ функций со схемами контракта.
 */
import { apiStaff, HttpError } from "@/server/api";
import { assertVisible } from "@/server/access";
import { container } from "@/server/container";
import { mobileCalls, mobileClient, mobileClients, mobileStaff, mobileTasks, mobileToday } from "@/server/crm-lists/work";
import { mobileOrder, mobileOrders } from "@/server/crm-lists/orders";
import { mobileChatDetail, mobileChatList, mobileDealDetail, mobileDeals, mobileMessages } from "@/server/crm-lists/data";
import { staffNotifications } from "@/modules/workspace";
import type { Handlers } from "../app";

export const crmListHandlers: Pick<Handlers, "crmToday" | "crmTasksList" | "crmCallsList" | "crmClientsList" | "crmClientCard" | "crmStaffList" | "crmNotificationsList" | "crmNotificationsRead" | "crmChatsList" | "crmChatGet" | "crmChatMessages" | "crmDealsList" | "crmDealGet" | "crmOrdersList" | "crmOrder"> = {
  async crmToday({ req }) {
    return mobileToday(await apiStaff(req));
  },

  async crmTasksList({ req, input }) {
    return { tasks: await mobileTasks(await apiStaff(req), { done: input.done === "1", who: input.who, kind: input.kind, q: input.q }) };
  },

  async crmCallsList({ req, input }) {
    return mobileCalls(await apiStaff(req, "calls.view"), input.f ?? "all", input.days ?? 14);
  },

  async crmClientsList({ req, input }) {
    return mobileClients(await apiStaff(req, "clients.view"), { q: input.q, sort: input.sort ?? "new", page: input.page ?? 1, mine: input.mine === "1" });
  },

  async crmClientCard({ req, input }) {
    return mobileClient(await apiStaff(req, "clients.view"), input.clientId);
  },

  async crmStaffList({ req }) {
    return mobileStaff(await apiStaff(req));
  },

  async crmNotificationsList({ req, input }) {
    const staff = await apiStaff(req);
    return { notifications: await staffNotifications(staff.user.id, input.limit ?? 60) };
  },

  async crmChatsList({ req, input }) {
    return { chats: await mobileChatList(await apiStaff(req, "chats.view"), input.f ?? "open", input.q) };
  },

  async crmChatGet({ req, input }) {
    return mobileChatDetail(await apiStaff(req, "chats.view"), input.chatId, input.limit ?? 50);
  },

  async crmChatMessages({ req, input }) {
    const staff = await apiStaff(req, "chats.view");
    const conv = await container().messaging.queries.conversation(input.chatId);
    if (!conv) throw new HttpError(404, "notFound");
    assertVisible(staff, conv.assigneeId);
    const before = input.before && !Number.isNaN(Date.parse(input.before)) ? new Date(input.before) : undefined;
    return { ...(await mobileMessages(conv.id, input.limit ?? 40, before)), unread: conv.unread, status: conv.status };
  },

  async crmDealsList({ req, input }) {
    return mobileDeals(await apiStaff(req, "deals.view"), { p: input.p, mine: input.mine, a: input.a, q: input.q, task: input.task, stale: input.stale, src: input.src });
  },

  async crmDealGet({ req, input }) {
    return mobileDealDetail(await apiStaff(req, "deals.view"), input.dealId);
  },

  async crmNotificationsRead({ req, input }) {
    const staff = await apiStaff(req);
    await container().workspace.inbox.markRead(staff.user.id, input.body.id);
    return { ok: true };
  },

  async crmOrdersList({ req }) {
    return mobileOrders(await apiStaff(req, "orders.view"));
  },

  async crmOrder({ req, input }) {
    return mobileOrder(await apiStaff(req, "orders.view"), input.orderId);
  },
};
