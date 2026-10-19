import "server-only";
import { eq } from "drizzle-orm";
import { crmConversations } from "@/shared/infrastructure/db/schema";
import { env } from "@/config/env";
import type { SettingsReader, StaffNotifier } from "@/shared/application";
import { executor } from "@/shared/infrastructure/database";
import type { AppInfo, AutomationEffects, HolidayCalendar } from "../application";
import { parseHolidays } from "../domain";

/**
 * Задачу и запись в истории сделки ставит контекст Clients, сообщение клиенту отправляет контекст переписки,
 * уведомления — рабочее пространство; их подключает корень композиции.
 */
export const crmEffects = (
  ports: Pick<AutomationEffects, "createTask" | "sendMessage" | "canMessageNow" | "addNote">,
  notifier: StaffNotifier<"deals.view">,
): AutomationEffects => ({
  createTask: ports.createTask,
  sendMessage: ports.sendMessage,
  canMessageNow: ports.canMessageNow,
  addNote: ports.addNote,
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

/** Праздники для повторных продаж — настройка «Интеграции» → CRM (`automation.holidays`); пусто — праздники РК по умолчанию. */
export const settingsHolidays = (settings: SettingsReader<AutomationSettingKey>): HolidayCalendar => ({
  list: async () => parseHolidays(await settings.get("automation.holidays")),
});

export type AutomationSettingKey = "automation.holidays";
