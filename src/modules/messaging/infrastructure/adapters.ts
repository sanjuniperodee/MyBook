import { site } from "@/config/site";
import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { CustomFieldsReader, LiveFeed, SettingsReader, StaffNotifier as StaffNotifierPort, WorkSchedule } from "@/shared/application";
import { parseBotConfig } from "@/modules/messaging/domain/botConfig";
import { nextWorkStart, parseWorkHours } from "@/shared/domain/schedule";
import { storeTimeZone } from "@/shared/domain/time";
import type { BotSettings, BotTimers, ChannelTransport, LiveUpdates, MediaGateway, StaffNotifier } from "../application";
import { DEFAULT_BOT_MODE, GOWA_CHANNEL, isBotMode, parseLessons, type BotCatalog, type Conversation } from "../domain";
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
  const viaGowa = async (conv: Conversation) => conv.channel === "whatsapp" && (conv.channelId === GOWA_CHANNEL || (await provider()) === "gowa");
  const fail = (err: unknown, what: string) => {
    if (GowaError.is(err)) return { ok: false as const, error: err.message };
    console.error(`[chats] gowa ${what}`, err);
    return { ok: false as const, error: "Не удалось выполнить в WhatsApp" };
  };
  /** Чат на сайте: сообщения клиент видит из нашей базы — правка и удаление в CRM сразу видны ему. */
  const local = (conv: Conversation) => conv.channel === "site";
  const unsupported = { ok: false as const, error: "Этот канал не поддерживает правку и удаление отправленного" };
  return {
    async send(conv, messageId, text, opts) {
      if (!(await viaGowa(conv))) return others.send(conv, messageId, text, opts);
      try {
        return { ok: true, externalId: await gowa.sendText(conv.chatId, text, opts) };
      } catch (err) {
        return fail(err, "send");
      }
    },
    async sendFile(conv, file, opts) {
      if (!(await viaGowa(conv))) return others.sendFile ? others.sendFile(conv, file, opts) : { ok: false, error: "Файлы можно отправлять только в WhatsApp через свой шлюз" };
      try {
        return { ok: true, externalId: await gowa.sendFile(conv.chatId, file, opts) };
      } catch (err) {
        return fail(err, "file");
      }
    },
    async edit(conv, externalId, text) {
      if (local(conv)) return { ok: true };
      if (!(await viaGowa(conv))) return unsupported;
      try {
        await gowa.edit(conv.chatId, externalId, text);
        return { ok: true };
      } catch (err) {
        return fail(err, "edit");
      }
    },
    async revoke(conv, externalId) {
      if (local(conv)) return { ok: true };
      if (!(await viaGowa(conv))) return unsupported;
      try {
        await gowa.revoke(conv.chatId, externalId);
        return { ok: true };
      } catch (err) {
        return fail(err, "revoke");
      }
    },
  };
}

/** Файлы вложений из шлюза GOWA. Файла в шлюзе нет (удалён, не скачан) — null, а не ошибка. */
export const gowaMediaGateway = (gowa: GowaClient): MediaGateway => ({
  download: (externalId, chatId) => gowa.download(externalId, chatId),
  async file(path, range) {
    try {
      const res = await gowa.media(path, range);
      return res.body ? { body: res.body, contentType: res.headers.get("content-type"), size: res.headers.get("content-length"), range: res.status === 206 ? res.headers.get("content-range") : null } : null;
    } catch (err) {
      if (GowaError.is(err) && err.code === "NOT_FOUND") return null;
      throw err;
    }
  },
});

/** Права, по которым переписка ищет, кого уведомить. */
export type MessagingPermission = "chats.view" | "deals.view" | "team.manage";

export const crmNotifier = (notifier: StaffNotifierPort<MessagingPermission>): StaffNotifier => ({
  notify: (assigneeId, permission, n) => notifier.notifyOwnerOr(assigneeId, permission, n),
  managers: (n) => notifier.notifyAllWith("team.manage", n),
});

export const realtimeUpdates = (live: LiveFeed): LiveUpdates => ({
  chatChanged: (conversationId) => void live.publish({ type: "chat", conversationId }),
  notificationsChanged: () => void live.publish({ type: "notify" }),
});

/** Что бот берёт с сайта: цены и сроки (действующий каталог), адрес, регистрация, темы книг, посадочные страницы. */
export interface BotSiteInfo {
  catalog(): Promise<BotCatalog>;
  site(): Promise<{ url: string; registrationOpen: boolean; themes: string[]; landings: string[]; themeLandings?: Record<string, string> }>;
}

/**
 * Бот-квалификатор: режим и вопросы — из настроек CRM, рабочее время и свои поля сделки — из рабочего пространства,
 * цены и темы книг — с сайта (порт контейнера).
 */
export const crmBotSettings = (deps: { settings: SettingsReader<"bot.mode" | "bot.config" | "crm.workHours" | "ai.knowledge" | "bot.lessons" | "bot.humanHold" | "bot.humanNight">; schedule: WorkSchedule; fields: CustomFieldsReader; site: BotSiteInfo }): BotSettings => ({
  mode: async () => {
    const v = await deps.settings.get("bot.mode");
    // Не задан — режим по умолчанию («всегда»); испорчен — выключен, чтобы бот не писал клиентам по ошибке.
    if (!v) return DEFAULT_BOT_MODE;
    return isBotMode(v) ? v : "off";
  },
  config: async () => parseBotConfig(await deps.settings.get("bot.config")),
  isWorkTime: (at) => deps.schedule.isWorkTime(at),
  nextWorkStart: async (at) => nextWorkStart(at, parseWorkHours(await deps.settings.get("crm.workHours"))),
  dealFields: () => deps.fields.list("deal"),
  catalog: () => deps.site.catalog(),
  site: () => deps.site.site(),
  timeZone: () => storeTimeZone(),
  knowledge: async () => (await deps.settings.get("ai.knowledge")) ?? "",
  lessons: async () => parseLessons(await deps.settings.get("bot.lessons")),
  humanHold: async () => (await deps.settings.get("bot.humanHold")) !== "off",
  humanNight: async () => (await deps.settings.get("bot.humanNight")) !== "off",
  brand: () => site.name,
});

/** Отложенные ходы бота в этом процессе: один таймер на диалог (новый заменяет прежний). Дальние сроки — планировщику. */
export function processTimers(maxDelayMs = 15 * 60_000): BotTimers {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  return {
    schedule(key, at, run) {
      const delay = Math.max(0, at.getTime() - Date.now());
      const prev = timers.get(key);
      if (prev) clearTimeout(prev);
      timers.delete(key);
      if (delay > maxDelayMs) return;
      const t = setTimeout(() => {
        timers.delete(key);
        run();
      }, delay + 50);
      t.unref?.();
      timers.set(key, t);
    },
    cancel(key) {
      const prev = timers.get(key);
      if (prev) clearTimeout(prev);
      timers.delete(key);
    },
  };
}

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
