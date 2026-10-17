"use server";

import { container } from "@/server/container";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uuid } from "@/server/input";
import { assertStaff, audit } from "@/server/access";
import { saveSettings } from "@/modules/workspace";
import { isValidTime } from "@/shared/domain/schedule";
import { findSensitive, sensitiveLabels, type BotPreviewResult } from "@/modules/messaging";
import { BOT_CHANNELS, BOT_LANGS, MAX_QUESTIONS, defaultBotConfig, type BotTexts } from "@/modules/messaging/domain/botConfig";
import { pricesOutsideCatalog, promoAmounts } from "@/modules/messaging/domain/botFaq";
import { FAQ_INTENTS, type FaqIntent } from "@/modules/messaging/domain/botNlu";
import { BOT_MODES } from "@/modules/messaging/domain/bot";
import { botSiteInfo } from "@/server/bot-site";
import type { SettingsState } from "../state";

export async function saveCrmSettingsAction(_: SettingsState, form: FormData): Promise<SettingsState> {
  const staff = await assertStaff("settings.manage");
  const parsed = z
    .object({
      slaMinutes: z.coerce.number().int().min(1, "Норматив ответа — от 1 минуты").max(1440),
      reassignMinutes: z.coerce.number().int().min(0, "Передача дальше — 0 (выключено) или больше").max(1440).default(15),
      from: z.string().refine(isValidTime, "Время начала в формате ЧЧ:ММ"),
      to: z.string().refine(isValidTime, "Время окончания в формате ЧЧ:ММ"),
      autoDealFrom: z.enum(["off", "registered", "book_started", "book_half", "book_ready"]),
      maxDiscount: z.coerce.number().int().min(0).max(50, "Скидка из чата — не больше 50%"),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const days = form.getAll("days").map(Number).filter((d) => d >= 1 && d <= 7);
  if (!days.length) return { error: "Выберите хотя бы один рабочий день" };
  const d = parsed.data;
  await saveSettings(
    {
      "crm.slaMinutes": String(d.slaMinutes),
      "crm.reassignMinutes": String(d.reassignMinutes),
      "crm.workHours": JSON.stringify({ days: [...new Set(days)].sort(), from: d.from, to: d.to }),
      "crm.autoDealFrom": d.autoDealFrom,
      "crm.unsorted": form.get("unsorted") === "on" ? "on" : "off",
      "crm.maxDiscount": String(d.maxDiscount),
      "widget.enabled": form.get("widgetEnabled") === "on" ? "on" : "off",
      "widget.chat": form.get("widgetChat") === "on" ? "on" : "off",
    },
    staff.user.id,
  );
  await audit(staff, "settings.update", "settings", "crm", { ...d, days });
  revalidatePath("/admin/settings");
  return { ok: "Сохранено" };
}

// ─── шаблоны ответов ───────────────────────────────────────────────────────

const templateSchema = z.object({
  id: z.union([z.literal(""), uuid]).default(""),
  title: z.string().trim().min(1, "Название шаблона").max(60),
  text: z.string().trim().min(1, "Текст шаблона").max(2000),
});

export async function saveTemplateAction(_: SettingsState, form: FormData): Promise<SettingsState> {
  await assertStaff("settings.manage");
  const parsed = templateSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, title, text } = parsed.data;
  if (id) await container().workspace.templates.update(id, { title, text });
  else await container().workspace.templates.add({ title, text });
  revalidatePath("/admin/settings");
  return { ok: "Сохранено" };
}

export async function deleteTemplateAction(id: string) {
  await assertStaff("settings.manage");
  await container().workspace.templates.delete(uuid.parse(id));
  revalidatePath("/admin/settings");
}

// ─── бот-квалификатор ──────────────────────────────────────────────────────

const localized = (max: number) => z.object({ ru: z.string().trim().max(max), kk: z.string().trim().max(max) });
const botTextsSchema = z.object(Object.fromEntries((Object.keys(defaultBotConfig.texts.ru) as (keyof BotTexts)[]).map((k) => [k, z.string().trim().max(500, "Текст бота — до 500 знаков")])) as Record<keyof BotTexts, z.ZodString>);
const botConfigSchema = z.object({
  channels: z.array(z.enum(BOT_CHANNELS)).max(BOT_CHANNELS.length),
  waitMinutes: z.number().int().min(1, "Ожидание менеджера — от 1 минуты").max(120, "Ожидание менеджера — до 120 минут"),
  questions: z
    .array(z.object({ field: z.string().min(1, "Поле для ответа").max(40), text: localized(400).refine((t) => t.ru.length > 0, "Текст вопроса на русском") }))
    .max(MAX_QUESTIONS),
  texts: z.object({ ru: botTextsSchema, kk: botTextsSchema }),
  faq: z.object(Object.fromEntries(FAQ_INTENTS.map((i) => [i, z.object({ on: z.boolean(), text: localized(1000) })])) as Record<FaqIntent, z.ZodObject<{ on: z.ZodBoolean; text: ReturnType<typeof localized> }>>),
  promo: localized(300),
  optionLabels: z.record(z.string().max(100), z.string().trim().max(100)),
  sendLink: z.boolean(),
  ai: z.boolean(),
  sell: z.object({
    on: z.boolean(),
    prepay: z.number().int().min(0, "Предоплата — не меньше 0").max(1_000_000),
    writeDays: z.number().int().min(0).max(30, "Сколько пишут книгу — до 30 дней"),
    deliveryDays: z.number().int().min(0).max(30, "Доставка — до 30 дней"),
    followUpHours: z.number().int().min(0).max(72, "Напоминание — не позже 72 часов"),
    invoice: z.boolean(),
    prices: z.object({ hardcover: z.number().int().min(0).max(10_000_000), digital: z.number().int().min(0).max(10_000_000) }),
    engine: z.enum(["ai", "template"]),
    takeover: z.boolean(),
    persona: z.string().trim().max(1500, "Указания продажнику — до 1500 знаков"),
    maxTurns: z.number().int().min(4, "Потолок беседы — от 4 ответов").max(100, "Потолок беседы — до 100 ответов"),
  }),
});
const botSchema = botConfigSchema.extend({ mode: z.enum(BOT_MODES) });

const faqLabels: Record<FaqIntent, string> = { price: "Цена", how: "Как это работает", timing: "Сроки", delivery: "Доставка", payment: "Оплата", examples: "Примеры", language: "Язык книги" };

/** Тексты бота: цифры цен — только переменными из «Цен и тарифов», номеров и реквизитов — нет (бот их всё равно не отправит). */
async function botTextsProblem(config: z.infer<typeof botConfigSchema>): Promise<string | null> {
  const catalog = await botSiteInfo.catalog();
  const blocks: [string, string][] = [
    ...FAQ_INTENTS.flatMap((i) => BOT_LANGS.map((l) => [`ответе «${faqLabels[i]}» (${l.toUpperCase()})`, config.faq[i].text[l]] as [string, string])),
    ...BOT_LANGS.flatMap((l) => Object.values(config.texts[l]).map((t) => [`текстах бота (${l.toUpperCase()})`, t] as [string, string])),
    ...config.questions.flatMap((q) => BOT_LANGS.map((l) => [`вопросе (${l.toUpperCase()})`, q.text[l]] as [string, string])),
  ];
  for (const [where, text] of blocks) {
    const found = findSensitive(text);
    if (found.length) return `В ${where} ${sensitiveLabels[found[0].kind]} — бот такое не отправляет`;
    const prices = pricesOutsideCatalog(text, catalog);
    if (prices.length) return `В ${where} число «${prices[0]}» не из «Цен и тарифов» — подставьте переменную, например {цена.печатная}, а скидку напишите процентом в строке «Акция»`;
  }
  // Счёт от бота: предоплата не больше цены печатной (электронную дешевле предоплаты бот выставит целиком).
  if (config.sell.on && config.sell.invoice) {
    const price = config.sell.prices.hardcover || catalog.plans.find((p) => p.id === "hardcover" && !p.hidden)?.price || 0;
    if (price && config.sell.prepay > price) return `Предоплата больше цены печатной книги (${price.toLocaleString("ru-RU")} ₸)`;
  }
  const personaFound = findSensitive(config.sell.persona);
  if (personaFound.length) return `В указаниях продажнику ${sensitiveLabels[personaFound[0].kind]} — бот такое не отправляет`;
  for (const l of BOT_LANGS) {
    const found = findSensitive(config.promo[l]);
    if (found.length) return `В строке акции ${sensitiveLabels[found[0].kind]} — бот такое не отправляет`;
    // Точную цену со скидкой называет менеджер: в акции — проценты и слова, суммы — только «от» из тарифов.
    const amounts = promoAmounts(config.promo[l]);
    if (amounts.length) return `В строке акции (${l.toUpperCase()}) сумма «${amounts[0]}» — бот называет только цены «от» из «Цен и тарифов»; скидку напишите процентом или словами`;
  }
  return null;
}

export async function saveBotAction(input: z.input<typeof botSchema>): Promise<SettingsState> {
  const staff = await assertStaff("settings.manage");
  const parsed = botSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { mode, ...config } = parsed.data;
  // Продажнику на AI вопросы не обязательны: он выясняет нужное сам; квалификатору и шаблонному продажнику они нужны.
  const aiSeller = config.sell.on && config.sell.engine === "ai";
  if (mode !== "off" && !config.questions.length && !aiSeller) return { error: "Добавьте хотя бы один вопрос" };
  if (mode !== "off" && !config.channels.length) return { error: "Выберите хотя бы один канал" };
  const problem = await botTextsProblem(config);
  if (problem) return { error: problem };
  await saveSettings({ "bot.mode": mode, "bot.config": JSON.stringify(config) }, staff.user.id);
  await audit(staff, "settings.update", "settings", "bot", { mode, channels: config.channels, questions: config.questions.length, faq: FAQ_INTENTS.filter((i) => config.faq[i].on), ai: config.ai, sell: config.sell.on, engine: config.sell.engine, takeover: config.sell.takeover, invoice: config.sell.on && config.sell.invoice });
  revalidatePath("/admin/settings");
  return { ok: "Сохранено" };
}

const previewSchema = z.object({
  config: botConfigSchema,
  turns: z
    .array(z.array(z.object({ text: z.string().max(1000), type: z.enum(["text", "audio", "image"]) })).min(1).max(10))
    .min(1, "Напишите сообщение клиента")
    .max(20),
  workTime: z.boolean(),
  client: z.enum(["new", "account", "order"]),
  name: z.string().trim().max(60),
});

/** Тест-режим: прогнать диалог с несохранёнными настройками — без базы и без отправки клиенту. */
export async function previewBotAction(input: z.input<typeof previewSchema>): Promise<{ result: BotPreviewResult } | { error: string }> {
  await assertStaff("settings.manage");
  const parsed = previewSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  return { result: await container().messaging.previewBot(parsed.data) };
}
