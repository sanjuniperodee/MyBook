/**
 * CRM — чтение списков в API v1 (перенос /api/mobile/*): те же выборки src/app/api/_crm-lists и те же права, что у
 * маршрутов /api/mobile (apiStaff с теми же правами). Тип Handlers сверяет ответ функций со схемами контракта.
 */
import { apiStaff } from "@/server/api";
import { container } from "@/server/container";
import { mobileCalls, mobileClient, mobileClients, mobileStaff, mobileTasks, mobileToday } from "@/app/api/_crm-lists/work";
import { staffNotifications } from "@/modules/workspace";
import type { Handlers } from "../app";

export const crmListHandlers: Pick<Handlers, "crmToday" | "crmTasksList" | "crmCallsList" | "crmClientsList" | "crmClientCard" | "crmStaffList" | "crmNotificationsList" | "crmNotificationsRead"> = {
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

  async crmNotificationsRead({ req, input }) {
    const staff = await apiStaff(req);
    await container().workspace.inbox.markRead(staff.user.id, input.body.id);
    return { ok: true };
  },
};
