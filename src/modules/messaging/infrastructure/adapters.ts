import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { CustomFieldsReader, LiveFeed, SettingsReader, StaffNotifier as StaffNotifierPort, WorkSchedule } from "@/shared/application";
import { crmTasks } from "@/shared/infrastructure/db/schema";
import { parseBotConfig } from "@/modules/messaging/domain/botConfig";
import { executor } from "@/shared/infrastructure/database";
import type { BotSettings, ChannelTransport, LiveUpdates, StaffNotifier, Tasks } from "../application";
import { GOWA_CHANNEL, type BotMode } from "../domain";
import type { EmailChannel } from "./email";
import { GowaError, type GowaClient } from "./gowa";
import { WazzupError, type WazzupClient } from "./wazzup";

/** Исходящие по каналу диалога: виджет забирает сообщения сам, почта и мессенджеры — через свои интеграции. */
export const channelTransport = (wazzup: WazzupClient, email: Pick<EmailChannel, "reply">): ChannelTransport => ({
  async send(conv, messageId, text) {
    if (conv.channel === "site") return { ok: true, externalId: null };
    if (conv.channel === "email") {
      const r = await email.reply(conv, messageId, text);
      return r.ok ? { ok: true, externalId: null } : r;
    }
    try {
      return { ok: true, externalId: await wazzup.send({ channelId: conv.channelId, chatType: conv.channel, chatId: conv.chatId, text, crmMessageId: messageId }) };
    } catch (err) {
      if (WazzupError.is(err)) return { ok: false, error: err.message };
      console.error("[chats] send", err);
      return { ok: false, error: "Не удалось отправить" };
    }
  },
});

/**
 * WhatsApp через свой шлюз GOWA: диалоги, пришедшие через него, и все WhatsApp-диалоги, когда в «Интеграциях»
 * выбран GOWA (в том числе начатые при Wazzup). Остальное — как раньше, через channelTransport (others).
 */
export function whatsappTransport(gowa: GowaClient, provider: () => Promise<"wazzup" | "gowa">, others: ChannelTransport): ChannelTransport {
  return {
    async send(conv, messageId, text) {
      if (conv.channel !== "whatsapp" || (conv.channelId !== GOWA_CHANNEL && (await provider()) !== "gowa")) return others.send(conv, messageId, text);
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

/** Права, по которым переписка ищет, кого уведомить. */
export type MessagingPermission = "chats.view" | "deals.view";

export const crmNotifier = (notifier: StaffNotifierPort<MessagingPermission>): StaffNotifier => ({
  notify: (assigneeId, permission, n) => notifier.notifyOwnerOr(assigneeId, permission, n),
});

export const realtimeUpdates = (live: LiveFeed): LiveUpdates => ({
  chatChanged: (conversationId) => void live.publish({ type: "chat", conversationId }),
  notificationsChanged: () => void live.publish({ type: "notify" }),
});

/** Бот-квалификатор: режим и вопросы — из настроек CRM, рабочее время и свои поля сделки — из рабочего пространства. */
export const crmBotSettings = (deps: { settings: SettingsReader<"bot.mode" | "bot.config">; schedule: WorkSchedule; fields: CustomFieldsReader }): BotSettings => ({
  mode: async () => ((await deps.settings.get("bot.mode")) || "off") as BotMode,
  config: async () => parseBotConfig(await deps.settings.get("bot.config")),
  isWorkTime: (at) => deps.schedule.isWorkTime(at),
  dealFields: () => deps.fields.list("deal"),
});

export const crmTasksAdapter: Tasks = {
  async create(t) {
    await executor().insert(crmTasks).values(t);
  },
};

/** Что показывает виджет на сайте: кнопка WhatsApp, онлайн-чат. */
export async function widgetSettings(settings: SettingsReader<"widget.enabled" | "widget.chat">, whatsapp: () => Promise<string>) {
  const s = await settings.getMany(["widget.enabled", "widget.chat"]);
  const enabled = s["widget.enabled"] !== "off";
  return { enabled, chat: enabled && s["widget.chat"] !== "off", whatsapp: enabled ? await whatsapp() : "" };
}

/** Посетитель чата на сайте: в базе храним только хэш его токена, сам токен знает лишь браузер. */
export const siteIds = {
  uuid: () => randomUUID(),
  visitorChatId: (token: string) => `v_${createHash("sha256").update(`site-chat:${token}`).digest("hex").slice(0, 32)}`,
};
