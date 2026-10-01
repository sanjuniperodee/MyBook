import "server-only";
import { eq } from "drizzle-orm";
import { crmConversations, crmTasks } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { getSetting } from "@/lib/crm/settings";
import { isWorkTime, parseWorkHours, workMinutesBetween } from "@/lib/crm/schedule";
import { notify, staffWith } from "@/lib/crm/notify";
import { executor } from "@/shared/infrastructure/database";
import type { AppInfo, AutomationEffects, WorkSchedule } from "../application";

/** График из настроек CRM (getSetting сам кэширует значения на несколько секунд). */
const hours = async () => parseWorkHours(await getSetting("crm.workHours"));

export const crmWorkSchedule: WorkSchedule = {
  isWorkTime: async (at) => isWorkTime(at, await hours()),
  workMinutesBetween: async (from, to) => workMinutesBetween(from, to, await hours()),
};

/** Сообщение клиенту отправляет контекст переписки — его подключает корень композиции. */
export const crmEffects = (sendMessage: AutomationEffects["sendMessage"]): AutomationEffects => ({
  async createTask(t) {
    await executor().insert(crmTasks).values(t);
  },
  sendMessage,
  async assignConversation(conversationId, userId) {
    await executor().update(crmConversations).set({ assigneeId: userId }).where(eq(crmConversations.id, conversationId));
  },
  async notify(userIds, n) {
    await notify(userIds === "staff" ? await staffWith("deals.view") : userIds, n);
  },
});

export const appInfo: AppInfo = {
  get url() {
    return env.appUrl;
  },
};
