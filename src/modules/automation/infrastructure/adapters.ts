import "server-only";
import { eq } from "drizzle-orm";
import { crmConversations } from "@/shared/infrastructure/db/schema";
import { env } from "@/config/env";
import type { StaffNotifier } from "@/shared/application";
import { executor } from "@/shared/infrastructure/database";
import type { AppInfo, AutomationEffects } from "../application";

/**
 * Задачу ставит сервис задач (контекст Clients), сообщение клиенту отправляет контекст переписки, уведомления —
 * рабочее пространство; их подключает корень композиции.
 */
export const crmEffects = (createTask: AutomationEffects["createTask"], sendMessage: AutomationEffects["sendMessage"], canMessageNow: AutomationEffects["canMessageNow"], notifier: StaffNotifier<"deals.view">): AutomationEffects => ({
  createTask,
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
