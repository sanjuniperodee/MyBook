import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { crmTasks } from "@/lib/db/schema";
import { linkCodeFromText } from "@/lib/crm/channels";
import { findLink, linkAttribution } from "@/lib/crm/links";
import { notifyOwnerOr } from "@/lib/crm/notify";
import { publish } from "@/lib/crm/realtime";
import { getSetting } from "@/lib/crm/settings";
import { isWorkTime, parseWorkHours } from "@/lib/crm/schedule";
import { listFields } from "@/lib/crm/fields";
import { parseBotConfig } from "@/lib/crm/bot-logic";
import { executor } from "@/shared/infrastructure/database";
import type { BotSettings, ChannelTransport, LinkAttribution, LiveUpdates, StaffNotifier, Tasks } from "../application";
import type { BotMode } from "../domain";

/** Исходящие по каналу диалога: виджет забирает сообщения сам, почта и мессенджеры — через свои интеграции. */
export const channelTransport: ChannelTransport = {
  async send(conv, messageId, text) {
    if (conv.channel === "site") return { ok: true, externalId: null };
    if (conv.channel === "email") {
      const { sendEmailReply } = await import("@/lib/crm/email");
      const r = await sendEmailReply(conv, messageId, text);
      return r.ok ? { ok: true, externalId: null } : r;
    }
    const { sendWazzupMessage, WazzupError } = await import("@/lib/crm/wazzup");
    try {
      return { ok: true, externalId: await sendWazzupMessage({ channelId: conv.channelId, chatType: conv.channel, chatId: conv.chatId, text, crmMessageId: messageId }) };
    } catch (err) {
      if (err instanceof WazzupError) return { ok: false, error: err.message };
      console.error("[chats] send", err);
      return { ok: false, error: "Не удалось отправить" };
    }
  },
};

export const linkAttributionFromText: LinkAttribution = {
  async fromText(text) {
    const code = linkCodeFromText(text);
    const link = code ? await findLink(code) : null;
    return link ? (linkAttribution(link) as Record<string, string>) : null;
  },
};

export const crmNotifier: StaffNotifier = {
  notify: (assigneeId, permission, n) => notifyOwnerOr(assigneeId, permission, n),
};

export const realtimeUpdates: LiveUpdates = {
  chatChanged: (conversationId) => void publish({ type: "chat", conversationId }),
  notificationsChanged: () => void publish({ type: "notify" }),
};

export const crmBotSettings: BotSettings = {
  mode: async () => ((await getSetting("bot.mode")) || "off") as BotMode,
  config: async () => parseBotConfig(await getSetting("bot.config")),
  isWorkTime: async (at) => isWorkTime(at, parseWorkHours(await getSetting("crm.workHours"))),
  dealFields: async () => (await listFields("deal")).map((f) => ({ key: f.key, label: f.label, type: f.type, options: f.options })),
};

export const crmTasksAdapter: Tasks = {
  async create(t) {
    await executor().insert(crmTasks).values(t);
  },
};

/** Что показывает виджет на сайте: кнопка WhatsApp, онлайн-чат. */
export async function widgetSettings() {
  const { getSettings } = await import("@/lib/crm/settings");
  const { shopWhatsapp } = await import("@/lib/crm/links");
  const s = await getSettings(["widget.enabled", "widget.chat"]);
  const enabled = s["widget.enabled"] !== "off";
  return { enabled, chat: enabled && s["widget.chat"] !== "off", whatsapp: enabled ? await shopWhatsapp() : "" };
}

/** Посетитель чата на сайте: в базе храним только хэш его токена, сам токен знает лишь браузер. */
export const siteIds = {
  uuid: () => randomUUID(),
  visitorChatId: (token: string) => `v_${createHash("sha256").update(`site-chat:${token}`).digest("hex").slice(0, 32)}`,
};
