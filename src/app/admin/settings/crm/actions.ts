"use server";

import { container } from "@/server/container";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uuid } from "@/server/input";
import { assertStaff, audit } from "@/server/access";
import { saveSettings } from "@/modules/workspace";
import { WORK_OFF_MAX, isValidTime, parseOffDates } from "@/shared/domain/schedule";
import { findSensitive, sensitiveLabels, type BotPreviewResult } from "@/modules/messaging";
import { BOT_CHANNELS, BOT_LANGS, MAX_QUESTIONS, REMIND_TOUCHES_MAX, defaultBotConfig, type BotTexts } from "@/modules/messaging/domain/botConfig";
import { faqIntentLabels, pricesOutsideCatalog, promoAmounts } from "@/modules/messaging/domain/botFaq";
import { FAQ_INTENTS, type FaqIntent } from "@/modules/messaging/domain/botNlu";
import { BOT_MODES } from "@/modules/messaging/domain/bot";
import { LESSON_MAX, MAX_LESSONS, lessonProblems } from "@/modules/messaging/domain/botCoach";
import { botSiteInfo } from "@/server/bot-site";
import type { SettingsState } from "../state";
import { HOLIDAYS_MAX, holidayIdFor, holidaysError, type Holiday } from "@/modules/automation/domain";
import { admin } from "@/i18n/admin";
import { DEFAULT_MERGE_CLOSED_DAYS, MERGE_CLOSED_DAYS_MAX } from "@/modules/sales/domain";

export async function saveCrmSettingsAction(_: SettingsState, form: FormData): Promise<SettingsState> {
  const staff = await assertStaff("settings.manage");
  const parsed = z
    .object({
      slaMinutes: z.coerce.number().int().min(1, "Норматив ответа — от 1 минуты").max(1440),
      reassignMinutes: z.coerce.number().int().min(0, "Передача дальше — 0 (выключено) или больше").max(1440).default(15),
      from: z.string().refine(isValidTime, "Время начала в формате ЧЧ:ММ"),
      to: z.string().refine(isValidTime, "Время окончания в формате ЧЧ:ММ"),
      autoDealFrom: z.enum(["off", "registered", "book_started", "book_half", "book_ready"]),
      maxDiscount: z.coerce.number().int().min(0).max(50, "Лимит скидки — не больше 50%"),
      mergeClosedDays: z.coerce
        .number()
        .int(admin.mergeClosedDaysInvalid(MERGE_CLOSED_DAYS_MAX))
        .min(0, admin.mergeClosedDaysInvalid(MERGE_CLOSED_DAYS_MAX))
        .max(MERGE_CLOSED_DAYS_MAX, admin.mergeClosedDaysInvalid(MERGE_CLOSED_DAYS_MAX))
        .default(DEFAULT_MERGE_CLOSED_DAYS),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const days = form.getAll("days").map(Number).filter((d) => d >= 1 && d <= 7);
  if (!days.length) return { error: "Выберите хотя бы один рабочий день" };
  const off = parseOffDates(String(form.get("off") ?? ""));
  if (off.bad.length) return { error: `Не понял даты выходных: ${off.bad.slice(0, 3).join(", ")}. Пишите «16.12.2026»` };
  if (off.dates.length > WORK_OFF_MAX) return { error: `Праздничных выходных — не больше ${WORK_OFF_MAX}; уберите прошедшие` };
  const d = parsed.data;
  await saveSettings(
    {
      "crm.slaMinutes": String(d.slaMinutes),
      "crm.reassignMinutes": String(d.reassignMinutes),
      "crm.workHours": JSON.stringify({ days: [...new Set(days)].sort(), from: d.from, to: d.to, ...(off.dates.length ? { off: off.dates } : {}) }),
      "crm.autoDealFrom": d.autoDealFrom,
      "crm.unsorted": form.get("unsorted") === "on" ? "on" : "off",
      "crm.digest": form.get("digest") === "on" ? "on" : "off",
      "referral.chatReward": form.get("chatReward") === "on" ? "on" : "off",
      "crm.maxDiscount": String(d.maxDiscount),
      "crm.mergeClosedDays": String(d.mergeClosedDays),
      "widget.enabled": form.get("widgetEnabled") === "on" ? "on" : "off",
      "widget.chat": form.get("widgetChat") === "on" ? "on" : "off",
    },
    staff.user.id,
  );
  await audit(staff, "settings.update", "settings", "crm", { ...d, days, off: off.dates });
  revalidatePath("/admin/settings");
  return { ok: "Сохранено" };
}

// ─── праздники для повторных продаж ────────────────────────────────────────

const holidaysSchema = z
  .array(z.object({ id: z.string().trim().max(30).default(""), day: z.string().trim().max(10), ru: z.string().trim().max(60), kk: z.string().trim().max(60) }))
  .max(HOLIDAYS_MAX * 2);

/** «31.12» → «12-31»; не день.месяц — null. */
const holidayDate = (day: string) => {
  const m = /^(\d{1,2})\.(\d{1,2})$/.exec(day);
  return m ? `${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
};

/**
 * Праздники для правила «Приближается праздник» (bots-10): день.месяц и названия на русском (сотрудникам и клиентам с
 * русским языком) и казахском. Код праздника сохраняется — по нему правило помнит, кому уже предложило к нему книгу.
 */
export async function saveHolidaysAction(input: z.input<typeof holidaysSchema>): Promise<{ ok: true } | { ok: false; error: string }> {
  const staff = await assertStaff("settings.manage");
  const parsed = holidaysSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: admin.badForm };
  const list: Holiday[] = [];
  for (const h of parsed.data) {
    const date = holidayDate(h.day);
    if (!date) return { ok: false, error: admin.holidayDateInvalid };
    list.push({ id: /^[a-z0-9-]{1,30}$/.test(h.id) ? h.id : holidayIdFor(date), date, ru: h.ru, kk: h.kk });
  }
  const error = holidaysError(list);
  if (error) return { ok: false, error: error === "holidaysTooMany" ? admin.holidaysTooMany(HOLIDAYS_MAX) : admin[error] };
  await saveSettings({ "automation.holidays": JSON.stringify(list) }, staff.user.id);
  await audit(staff, "settings.update", "settings", "holidays", { holidays: list.map((h) => `${h.date} ${h.ru}`) });
  revalidatePath("/admin/settings");
  revalidatePath("/admin/automations");
  return { ok: true };
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
    engine: z.enum(["ai", "template"]),
    takeover: z.boolean(),
    persona: z.string().trim().max(1500, "Указания продажнику — до 1500 знаков"),
    maxTurns: z.number().int().min(4, "Потолок беседы — от 4 ответов").max(100, "Потолок беседы — до 100 ответов"),
    hidePrices: z.boolean(),
    media: z.boolean(),
    speaksAs: z.enum(["manager", "assistant"]),
    botName: z.string().trim().min(1, "Имя продажника — не пустое").max(40, "Имя продажника — до 40 знаков"),
    managerName: z.string().trim().min(1, "Имя менеджера — не пустое").max(40, "Имя менеджера — до 40 знаков"),
    facts: z.string().trim().max(2000, "Факты для продажника — до 2000 знаков"),
    productionDays: z.number().int().min(1, "Срок изготовления — от 1 дня").max(30, "Срок изготовления — до 30 дней"),
    selfImprove: z.boolean(),
    remind: z.boolean(),
    lastStart: z.boolean(),
    remindMaxDays: z.number().int().min(1, "Повторное сообщение — от 1 до 180 дней вперёд").max(180, "Повторное сообщение — от 1 до 180 дней вперёд"),
    remindTouches: z.number().int().min(1, admin.remindTouchesInvalid(REMIND_TOUCHES_MAX)).max(REMIND_TOUCHES_MAX, admin.remindTouchesInvalid(REMIND_TOUCHES_MAX)),
  }),
});
const botSchema = botConfigSchema.extend({ mode: z.enum(BOT_MODES) });

const faqLabels = faqIntentLabels;

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
  // Счёт от бота (по «Ценам и тарифам»): предоплата не больше цены печатной (электронную дешевле предоплаты бот выставит целиком).
  if (config.sell.on && config.sell.invoice) {
    const price = catalog.plans.find((p) => p.id === "hardcover" && !p.hidden)?.price || 0;
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
  // Продолжение теста AI-продажника: состояние беседы и переписка (чужим руки сюда не попадают — действие для руководителя).
  resume: z
    .object({
      state: z.record(z.string(), z.unknown()),
      history: z.array(z.object({ from: z.enum(["client", "bot", "manager"]), text: z.string().max(3000), at: z.union([z.string(), z.date()]), author: z.string().nullish() })).max(120),
    })
    .nullish(),
});

/** Тест-режим: прогнать диалог с несохранёнными настройками — без базы и без отправки клиенту. */
export async function previewBotAction(input: z.input<typeof previewSchema>): Promise<{ result: BotPreviewResult } | { error: string }> {
  await assertStaff("settings.manage");
  const parsed = previewSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  return { result: await container().messaging.previewBot(parsed.data) };
}

// ─── работа над ошибками AI-продажника ──────────────────────────────────────

/** Разобрать беседы бота сейчас (не дожидаясь ночи): уроки обновятся, запуск попадёт в журнал. */
export async function runBotCoachAction(): Promise<{ ok?: string; error?: string }> {
  const staff = await assertStaff("settings.manage");
  const run = await container().messaging.coach.run({ force: true });
  revalidatePath("/admin/settings");
  if (!run) return { error: "Разбор не запустился: нужен AI-продажник (Бот → Продажи → движок AI) и подключённая модель." };
  await audit(staff, "settings.update", "settings", "bot.coach", { reviewed: run.reviewed, added: run.added.length, removed: run.removed.length });
  if (run.error) return { error: `Разбор не удался: ${run.error}` };
  return { ok: run.reviewed ? `Разобрано бесед: ${run.reviewed}. Новых уроков: ${run.added.length}, убрано: ${run.removed.length}.` : "Бесед бота за сутки не было — разбирать нечего." };
}

export async function deleteBotLessonAction(lessonId: string): Promise<void> {
  const staff = await assertStaff("settings.manage");
  const id = z.string().min(1).max(40).parse(lessonId);
  const { lessons } = await container().messaging.lessons();
  const removed = lessons.find((l) => l.id === id);
  if (!removed) return;
  await container().messaging.saveLessons(
    lessons.filter((l) => l.id !== id),
    staff.user.id,
  );
  await audit(staff, "settings.update", "settings", "bot.lessons", { removed: removed.text });
  revalidatePath("/admin/settings");
}

/** Свой урок владельца: та же проверка, что у уроков разбора (без сумм, ссылок, номеров и правил безопасности). */
export async function addBotLessonAction(text: string): Promise<{ error?: string }> {
  const staff = await assertStaff("settings.manage");
  const parsed = z.string().max(500).safeParse(text);
  if (!parsed.success) return { error: "Урок — до 220 знаков" };
  const clean = parsed.data.replace(/\s+/g, " ").trim();
  const problems = lessonProblems(clean);
  if (problems.length) return { error: `Так нельзя: ${problems.join(", ")}. Урок — правило тона и подхода, до ${LESSON_MAX} знаков.` };
  const { lessons } = await container().messaging.lessons();
  if (lessons.length >= MAX_LESSONS) return { error: `Уроков уже ${MAX_LESSONS} — удалите лишний.` };
  await container().messaging.saveLessons([...lessons, { id: crypto.randomUUID().slice(0, 8), text: clean, why: "добавил владелец", at: new Date().toISOString(), source: "owner" }], staff.user.id);
  await audit(staff, "settings.update", "settings", "bot.lessons", { added: clean });
  revalidatePath("/admin/settings");
  return {};
}

const materialPatch = z.object({
  id: z.string().min(1).max(40),
  caption: z.string().max(300),
  about: z.string().max(200),
  lang: z.enum(["any", "ru", "kk"]),
  on: z.boolean(),
});

/** Подборка материалов: подписи, язык, вкл/выкл и порядок (файлы добавляются через /api/admin/bot/materials). */
export async function saveBotMaterialsAction(items: unknown): Promise<{ error?: string }> {
  const staff = await assertStaff("settings.manage");
  const parsed = z.array(materialPatch).max(50).safeParse(items);
  if (!parsed.success) return { error: "Не удалось сохранить подборку" };
  const current = await container().messaging.materials();
  const byId = new Map(current.map((m) => [m.id, m]));
  // Только известные файлы, в новом порядке; что не пришло — остаётся в конце (добавлено в другой вкладке).
  const next = parsed.data.flatMap((p) => {
    const m = byId.get(p.id);
    return m ? [{ ...m, caption: p.caption.trim(), about: p.about.trim(), lang: p.lang, on: p.on }] : [];
  });
  const rest = current.filter((m) => !parsed.data.some((p) => p.id === m.id));
  for (const m of next) {
    const found = findSensitive(`${m.caption}`, []);
    if (found.length) return { error: `В подписи «${m.name}» ${sensitiveLabels[found[0].kind]} — бот такое не отправляет` };
  }
  await container().messaging.saveMaterials([...next, ...rest], staff.user.id);
  await audit(staff, "settings.update", "settings", "bot.materials", { count: next.length + rest.length });
  revalidatePath("/admin/settings");
  return {};
}

export async function deleteBotMaterialAction(id: string): Promise<void> {
  const staff = await assertStaff("settings.manage");
  const clean = z.string().min(1).max(40).parse(id);
  await container().messaging.removeMaterial(clean, staff.user.id);
  await audit(staff, "settings.update", "settings", "bot.materials", { removed: clean });
  revalidatePath("/admin/settings");
}
