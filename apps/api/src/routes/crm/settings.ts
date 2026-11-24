/**
 * Настройки CRM в приложении: «Отдел продаж» (как форма на вкладке «CRM» страницы «Интеграции») и режим AI-продажника.
 * Значения читаются так же, как на вкладке; сохранение — те же действия сайта, отказ — текстом.
 */
import { apiStaff } from "@/server/api";
import { container } from "@/server/container";
import { getSetting } from "@/modules/workspace";
import { parseBotConfig } from "@/modules/messaging/domain/botConfig";
import { parseWorkHours } from "@/shared/domain/schedule";
import { saveBotAction, saveCrmSettingsAction } from "@/app/admin/settings/crm/actions";
import type { Handlers } from "../../app";
import { refused } from "./common";

const AUTO_DEAL = [
  { id: "off", label: "не заводить (только заказы)" },
  { id: "registered", label: "зарегистрировался" },
  { id: "book_started", label: "начал книгу" },
  { id: "book_half", label: "написал половину книги" },
  { id: "book_ready", label: "почти закончил книгу" },
];

const BOT_MODES = [
  { id: "off", label: "Выключен", hint: "Отвечают только менеджеры." },
  { id: "always", label: "Всегда сразу", hint: "Бот отвечает на каждое новое обращение после короткой паузы и замолкает, как только напишет человек." },
  { id: "fallback", label: "Если менеджер не ответил", hint: "В рабочее время бот ждёт ответа человека, ночью отвечает сразу." },
  { id: "off_hours", label: "Только вне рабочего времени", hint: "Днём пишут менеджеры, ночью и в выходные — бот." },
];

/** «2026-12-16» → «16.12.2026», как в поле формы сайта. */
const ruDate = (iso: string) => iso.split("-").reverse().join(".");

export const crmSettingsHandlers: Pick<Handlers, "crmSettingsSales" | "crmSettingsSalesSave" | "crmSettingsBotMode"> = {
  async crmSettingsSales({ req }) {
    await apiStaff(req, "settings.manage");
    const [sla, workHours, autoDealFrom, unsorted, maxDiscount, wEnabled, wChat, reassign, mergeDays, digest, chatReward, wHelp, autoLetters, botMode] = await Promise.all([
      getSetting("crm.slaMinutes"),
      getSetting("crm.workHours"),
      getSetting("crm.autoDealFrom"),
      getSetting("crm.unsorted"),
      getSetting("crm.maxDiscount"),
      getSetting("widget.enabled"),
      getSetting("widget.chat"),
      getSetting("crm.reassignMinutes"),
      container().sales.deals.mergeClosedDays(),
      getSetting("crm.digest"),
      getSetting("referral.chatReward"),
      getSetting("widget.help"),
      getSetting("notify.auto"),
      getSetting("bot.mode"),
    ]);
    const wh = parseWorkHours(workHours);
    return {
      canManage: true,
      workDays: wh.days,
      from: wh.from,
      to: wh.to,
      off: (wh.off ?? []).map(ruDate).join("\n"),
      slaMinutes: Number(sla) || 15,
      reassignMinutes: reassign === "" || reassign === null ? 15 : Number(reassign) || 0,
      autoDealFrom: autoDealFrom || "off",
      autoDealOptions: AUTO_DEAL,
      mergeClosedDays: mergeDays,
      maxDiscount: Number(maxDiscount) || 0,
      unsorted: unsorted !== "off",
      digest: digest !== "off",
      autoLetters: autoLetters !== "off",
      chatReward: chatReward === "on",
      widgetEnabled: wEnabled !== "off",
      widgetChat: wChat !== "off",
      widgetHelp: wHelp !== "off",
      botMode: botMode || "off",
      botModes: BOT_MODES,
    };
  },

  async crmSettingsSalesSave({ req, input }) {
    await apiStaff(req, "settings.manage");
    const b = input.body;
    const form = new FormData();
    for (const d of b.workDays) form.append("days", String(d));
    form.set("from", b.from);
    form.set("to", b.to);
    form.set("off", b.off);
    form.set("slaMinutes", String(b.slaMinutes));
    form.set("reassignMinutes", String(b.reassignMinutes));
    form.set("autoDealFrom", b.autoDealFrom);
    form.set("mergeClosedDays", String(b.mergeClosedDays));
    form.set("maxDiscount", String(b.maxDiscount));
    // Флажки — как у формы сайта: «on» или поля нет.
    const flags = { unsorted: b.unsorted, digest: b.digest, autoLetters: b.autoLetters, chatReward: b.chatReward, widgetEnabled: b.widgetEnabled, widgetChat: b.widgetChat, widgetHelp: b.widgetHelp };
    for (const [k, on] of Object.entries(flags)) if (on) form.set(k, "on");
    const r = await saveCrmSettingsAction({}, form);
    if (r.error) return refused(r.error);
    return { ok: true as const, message: r.ok ?? "Сохранено" };
  },

  async crmSettingsBotMode({ req, input }) {
    await apiStaff(req, "settings.manage");
    // Меняется только режим: остальные настройки бота сохраняются как есть (с теми же проверками, что у формы бота).
    const config = parseBotConfig(await getSetting("bot.config"));
    const r = await saveBotAction({ ...config, mode: input.body.mode });
    if (r.error) return refused(r.error);
    const label = BOT_MODES.find((m) => m.id === input.body.mode)?.label ?? input.body.mode;
    return { ok: true as const, message: `AI-продажник: ${label.toLowerCase()}` };
  },
};
