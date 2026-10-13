import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { crmTasks } from "@/shared/infrastructure/db/schema";
import { notifyOwnerOr } from "@/modules/workspace";
import { publish } from "@/modules/workspace";
import { getSetting } from "@/modules/workspace";
import { isWorkTime, parseWorkHours } from "@/modules/workspace/domain/schedule";
import { listFields } from "@/modules/workspace";
import { parseBotConfig } from "@/modules/messaging/domain/botConfig";
import { executor } from "@/shared/infrastructure/database";
import type { BotSettings, ChannelTransport, LiveUpdates, StaffNotifier, Tasks } from "../application";
import { GOWA_CHANNEL, type BotMode } from "../domain";
import { GowaError, type GowaClient } from "./gowa";

/** Исходящие по каналу диалога: виджет забирает сообщения сам, почта и мессенджеры — через свои интеграции. */
const channelTransport: ChannelTransport = {
  async send(conv, messageId, text) {
    if (conv.channel === "site") return { ok: true, externalId: null };
    if (conv.channel === "email") {
      const { sendEmailReply } = await import("@/modules/messaging/infrastructure/email");
      const r = await sendEmailReply(conv, messageId, text);
      return r.ok ? { ok: true, externalId: null } : r;
    }
    const { sendWazzupMessage, WazzupError } = await import("@/modules/messaging/infrastructure/wazzup");
    try {
      return { ok: true, externalId: await sendWazzupMessage({ channelId: conv.channelId, chatType: conv.channel, chatId: conv.chatId, text, crmMessageId: messageId }) };
    } catch (err) {
      if (err instanceof WazzupError) return { ok: false, error: err.message };
      console.error("[chats] send", err);
      return { ok: false, error: "Не удалось отправить" };
    }
  },
};

/**
 * WhatsApp через свой шлюз GOWA: диалоги, пришедшие через него, и все WhatsApp-диалоги, когда в «Интеграциях»
 * выбран GOWA (в том числе начатые при Wazzup). Остальное — как раньше, через channelTransport.
 */
export function whatsappTransport(gowa: GowaClient, provider: () => Promise<"wazzup" | "gowa">): ChannelTransport {
  return {
    async send(conv, messageId, text) {
      if (conv.channel !== "whatsapp" || (conv.channelId !== GOWA_CHANNEL && (await provider()) !== "gowa")) return channelTransport.send(conv, messageId, text);
      try {
        return { ok: true, externalId: await gowa.sendText(conv.chatId, text) };
      } catch (err) {
        if (GowaError.is(err)) return { ok: false, error: err.message };
        console.error("[chats] gowa send", err);
        return { ok: false, error: "Не удалось отправить" };
      }
    },
  };
}

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
export async function widgetSettings(whatsapp: () => Promise<string>) {
  const { getSettings } = await import("@/modules/workspace");
  const s = await getSettings(["widget.enabled", "widget.chat"]);
  const enabled = s["widget.enabled"] !== "off";
  return { enabled, chat: enabled && s["widget.chat"] !== "off", whatsapp: enabled ? await whatsapp() : "" };
}

/** Посетитель чата на сайте: в базе храним только хэш его токена, сам токен знает лишь браузер. */
export const siteIds = {
  uuid: () => randomUUID(),
  visitorChatId: (token: string) => `v_${createHash("sha256").update(`site-chat:${token}`).digest("hex").slice(0, 32)}`,
};
