import "server-only";
import { eq } from "drizzle-orm";
import { crmConversations, crmTasks } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { getSetting } from "@/lib/crm/settings";
import { isWorkTime, parseWorkHours, workMinutesBetween } from "@/lib/crm/schedule";
import { notify, staffWith } from "@/lib/crm/notify";
import { executor } from "@/shared/infrastructure/database";
import type { AppInfo, AutomationEffects, WorkSchedule } from "../application";

/** График читается из настроек не чаще раза в 30 секунд: проход по просроченным чатам спрашивает его на каждый диалог. */
let cached: { at: number; value: ReturnType<typeof parseWorkHours> } | null = null;
async function hours() {
  if (!cached || Date.now() - cached.at > 30_000) cached = { at: Date.now(), value: parseWorkHours(await getSetting("crm.workHours")) };
  return cached.value;
}

export const crmWorkSchedule: WorkSchedule = {
  isWorkTime: async (at) => isWorkTime(at, await hours()),
  workMinutesBetween: async (from, to) => workMinutesBetween(from, to, await hours()),
};

export const crmEffects: AutomationEffects = {
  async createTask(t) {
    await executor().insert(crmTasks).values(t);
  },
  async sendMessage(conversationId, text) {
    const { sendChatMessage } = await import("@/lib/crm/chats");
    await sendChatMessage(conversationId, text, null);
  },
  async assignConversation(conversationId, userId) {
    await executor().update(crmConversations).set({ assigneeId: userId }).where(eq(crmConversations.id, conversationId));
  },
  async notify(userIds, n) {
    await notify(userIds === "staff" ? await staffWith("deals.view") : userIds, n);
  },
};

export const appInfo: AppInfo = {
  get url() {
    return env.appUrl;
  },
};
