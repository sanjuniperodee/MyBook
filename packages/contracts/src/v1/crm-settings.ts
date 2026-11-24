/**
 * API v1 — настройки CRM, которые разумно менять с телефона: «Отдел продаж» (рабочее время, норматив ответа, передача
 * заявки, когда заводить сделку с сайта, лимит скидки, переключатели) и режим AI-продажника. Ключи интеграций, тексты бота,
 * шаблоны, правила автоматизаций, цены, лимиты AI и команда — страницы CRM в приложении. Сохранение — те же действия сайта
 * (saveCrmSettingsAction, saveBotAction): права settings.manage, проверки, журнал действий.
 */
import { z } from "zod";
import { route, schemas, type RouteDef } from "./core";
import { Choice, Done } from "./crm";

const time = z.string().regex(/^\d{2}:\d{2}$/);

export const CrmSalesSettings = z
  .object({
    canManage: z.boolean(),
    /** Рабочие дни 1–7 (пн–вс), время смены и праздничные выходные «16.12.2026» через запятую. */
    workDays: z.array(z.number().int().min(1).max(7)),
    from: time,
    to: time,
    off: z.string(),
    slaMinutes: z.number().int(),
    /** Не взял заявку — следующему через N минут; 0 — выключено. */
    reassignMinutes: z.number().int(),
    autoDealFrom: z.string(),
    autoDealOptions: z.array(Choice),
    mergeClosedDays: z.number().int(),
    maxDiscount: z.number().int(),
    unsorted: z.boolean(),
    digest: z.boolean(),
    autoLetters: z.boolean(),
    chatReward: z.boolean(),
    widgetEnabled: z.boolean(),
    widgetChat: z.boolean(),
    widgetHelp: z.boolean(),
    /** Режим AI-продажника: off | fallback | off_hours | always. */
    botMode: z.string(),
    botModes: z.array(z.object({ id: z.string(), label: z.string(), hint: z.string() })),
  })
  .register(schemas, { id: "CrmSalesSettings" });

export const CrmSalesSettingsBody = z
  .object({
    workDays: z.array(z.number().int().min(1).max(7)).min(1, "Выберите хотя бы один рабочий день"),
    from: time,
    to: time,
    off: z.string().max(2000).default(""),
    slaMinutes: z.number().int().min(1).max(1440),
    reassignMinutes: z.number().int().min(0).max(1440),
    autoDealFrom: z.enum(["off", "registered", "book_started", "book_half", "book_ready"]),
    mergeClosedDays: z.number().int().min(0).max(365),
    maxDiscount: z.number().int().min(0).max(50),
    unsorted: z.boolean(),
    digest: z.boolean(),
    autoLetters: z.boolean(),
    chatReward: z.boolean(),
    widgetEnabled: z.boolean(),
    widgetChat: z.boolean(),
    widgetHelp: z.boolean(),
  })
  .strict()
  .register(schemas, { id: "CrmSalesSettingsBody" });

export const BotModeBody = z.object({ mode: z.enum(["off", "fallback", "off_hours", "always"]) }).strict().register(schemas, { id: "BotModeBody" });

export const crmSettingsRoutes = {
  crmSettingsSales: route({ method: "GET", path: "/api/v1/crm/settings/sales", auth: "staff", tag: "crm", summary: "Настройки отдела продаж и режим AI-продажника", response: CrmSalesSettings }),
  crmSettingsSalesSave: route({ method: "PUT", path: "/api/v1/crm/settings/sales", auth: "staff", tag: "crm", summary: "Сохранить настройки отдела продаж", body: CrmSalesSettingsBody, response: Done }),
  crmSettingsBotMode: route({ method: "PUT", path: "/api/v1/crm/settings/bot-mode", auth: "staff", tag: "crm", summary: "Режим AI-продажника (остальные настройки бота — как есть)", body: BotModeBody, response: Done }),
} satisfies Record<string, RouteDef>;
