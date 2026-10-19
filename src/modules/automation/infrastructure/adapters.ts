import "server-only";
import { eq } from "drizzle-orm";
import { crmConversations, crmTasks } from "@/shared/infrastructure/db/schema";
import { env } from "@/config/env";
import type { StaffNotifier } from "@/shared/application";
import { executor } from "@/shared/infrastructure/database";
import type { AppInfo, AutomationEffects } from "../application";

/** Сообщение клиенту отправляет контекст переписки, уведомления — рабочее пространство; их подключает корень композиции. */
export const crmEffects = (sendMessage: AutomationEffects["sendMessage"], canMessageNow: AutomationEffects["canMessageNow"], notifier: StaffNotifier<"deals.view">): AutomationEffects => ({
  async createTask(t) {
    await executor().insert(crmTasks).values(t);
  },
  sendMessage,
  canMessageNow,
  async assignConversation(conversationId, userId) {
    await executor().update(crmConversations).set({ assigneeId: userId }).where(eq(crmConversations.id, conversationId));
  },
  async notify(userIds, n) {
    await (userIds === "staff" ? notifier.notifyAllWith("deals.view", n) : notifier.notify(userIds, n));
  },
});

export const appInfo: AppInfo = {
  get url() {
    return env.appUrl;
  },
};
