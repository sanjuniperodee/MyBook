/**
 * Ядро бота-квалификатора — чистая функция хода: состояние диалога + новые сообщения клиента → ответ, значения полей
 * сделки, события для журнала. Вместо «номера шага» бот помнит, что уже известно: каждое сообщение разбирается целиком
 * (получатель, повод, дата и формат — откуда бы они ни пришли), спрашивается только недостающее. Тот же ход выполняют
 * вебхук, тест-режим в настройках и тесты. Тексты клиенту — только из настроек (botConfig), цифры — из тарифов.
 */
import { fillTemplate } from "@/shared/domain/templates";
import { zonedDay } from "@/shared/domain/time";
import { humanDate, whenText, type DealField } from "./bot";
import { botText, faqFor, mentionsMonth, promoFor, optionLabel, parseDateAnswer, matchOption, questionFor, questionText, type BotConfig, type BotTextKey } from "./botConfig";
import { catalogVars, fillBotVars, fillFaqLines, type BotCatalog } from "./botFaq";
import { detectLang, faqIntents, handoffIntent, isAck, isAgree, isBareNo, isWillLook, isDecline, isDontKnow, isStop, langRequest, looksLikeContinuation, objectionKind, residual, type BotLang, type FaqIntent, type HandoffKind } from "./botNlu";
import { bookLink, findRecipient, themeLabel, themeMenuText, type Recipient } from "./botThemes";
import { mediaCaption } from "./wazzup";
import { newSellerAiState, type SellerAiState } from "./botSellerState";

/** offered — бот сделал предложение, клиент замолчал; invoiced — бот сам выставил счёт. */
export type BotOutcome = "finished" | "handoff" | "stopped_by_manager" | "abandoned" | "declined" | "skipped" | "disabled" | "offered" | "invoiced";
export type BotEventKind =
  | "started"
  | "skipped"
  | "blocked"
  | "answer"
  | "unrecognized"
  | "faq"
  | "media"
  | "handoff"
  | "finished"
  | "stopped_by_manager"
  | "abandoned"
  | "declined"
  | "offer"
  | "objection"
  | "agreed"
  | "follow_up"
  | "invoiced"
  | "offered";

export interface BotEvent {
  kind: BotEventKind;
  field?: string | null;
  intent?: string | null;
  reason?: string | null;
}

/** Состояние бота в диалоге (crm_conversations.bot_state). */
export interface BotState {
  /** Счётчик записи (compare-and-set): параллельный ход не затрёт этот. */
  version: number;
  /** waiting — бот решил ответить и ждёт паузы в сообщениях (или ответа менеджера в режиме fallback); done — всё. */
  phase: "waiting" | "active" | "done";
  /** С какого момента входящие относятся к боту. */
  since: string;
  /** Обработанные входящие (id сообщений): повторная доставка и параллельный ход не задают вопрос дважды. */
  seen: string[];
  /** Заявка заведена этим обращением (а не найдена открытая). */
  fresh: boolean;
  /** Перед первым ответом бот ждёт человека (fallback в рабочее время), а не только паузу: уведомления идут как обычно. */
  waitHuman: boolean;
  lang: BotLang;
  /** Снимок вопросов на старте: правка настроек не подвешивает идущие диалоги. */
  questions: string[];
  asking: string | null;
  retries: Record<string, number>;
  /** Что бот записал в поля сделки. */
  filled: Record<string, string | number>;
  /** Нераспознанные ответы — как написал клиент (в сводку). */
  raw: Record<string, string>;
  /** «Не знаю» — вопрос пропущен. */
  skipped: string[];
  /** На какие частые вопросы бот ответил и какие повторялись. */
  faq: FaqIntent[];
  repeated: FaqIntent[];
  /** Все намерения клиента по порядку (для сводки и метрик). */
  intents: string[];
  /** Первое сообщение клиента — в сводку. */
  first: string;
  /** Подтверждения голосовых и фото уже отправлены. */
  ack: string[];
  links: string[];
  theme: string | null;
  recipient: string | null;
  startedAt: string | null;
  lastBotAt: string | null;
  outcome: BotOutcome | null;
  reason: string | null;
  /** ask — опрос; offer — режим «Продаёт»: предложение сделано, бот доводит до «да». */
  stage: "ask" | "offer";
  /** Возражения после предложения (price, later) — на каждое бот отвечает один раз. */
  objections: string[];
  /** Напоминание после предложения уже отправлено. */
  followedUp: boolean;
  offeredAt: string | null;
  /** Кто ведёт беседу: шаблоны из настроек или AI-продажник (режим «Продаёт» с движком AI). */
  engine: "template" | "ai";
  /** Память AI-продажника (для шаблонной беседы не используется). */
  ai: SellerAiState;
}

export function newBotState(since: Date, fresh: boolean): BotState {
  return {
    version: 0,
    phase: "waiting",
    since: since.toISOString(),
    seen: [],
    fresh,
    waitHuman: false,
    lang: "ru",
    questions: [],
    asking: null,
    retries: {},
    filled: {},
    raw: {},
    skipped: [],
    faq: [],
    repeated: [],
    intents: [],
    first: "",
    ack: [],
    links: [],
    theme: null,
    recipient: null,
    startedAt: null,
    lastBotAt: null,
    outcome: null,
    reason: null,
    stage: "ask",
    objections: [],
    followedUp: false,
    offeredAt: null,
    engine: "template",
    ai: newSellerAiState(),
  };
}

/** Состояние из базы: недостающие поля — по умолчанию (запись могла быть сделана прежней версией). */
export function readBotState(raw: unknown): BotState | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const base = newBotState(new Date(0), false);
  const r = raw as Partial<BotState>;
  if (!r.phase) return null;
  return { ...base, ...r };
}

export interface BotInput {
  id: string;
  text: string;
  type: string;
  at: Date | string;
  /** Ссылка на вложение (для распознавания голосовых и фото моделью). */
  mediaUrl?: string | null;
}

/** Что AI понял из сообщения (необязательно): только дополняет детерминированный разбор. */
export interface BotHints {
  fields?: Record<string, string>;
  intents?: FaqIntent[];
  handoff?: HandoffKind | null;
  lang?: BotLang | null;
}

export interface BotEnv {
  config: BotConfig;
  fields: DealField[];
  /** Поля сделки до бота: заполненное не спрашивается и не перезаписывается. */
  dealValues: Record<string, unknown>;
  now: Date;
  tz: string;
  workTime: boolean;
  /** Когда начнётся рабочее время (вне его — «менеджер ответит завтра с 09:00»). */
  nextWorkStart: Date | null;
  catalog: BotCatalog;
  site: { url: string; registrationOpen: boolean; themes: string[]; landings: string[]; themeLandings?: Record<string, string> };
  client: { known: boolean; locale: BotLang | null };
  /** Имя для обращения (safeName). */
  name: string;
  hints?: BotHints | null;
  /** По сделке уже есть оплата (счёт оплачен или привязан заказ): предоплату не предлагаем. */
  paid?: boolean;
}

export interface BotTurn {
  state: BotState;
  /** Одно сообщение клиенту (абзацы через пустую строку) или null — промолчать. */
  reply: string | null;
  fields: Record<string, string | number>;
  events: BotEvent[];
  handoff: HandoffKind | null;
  done: boolean;
  /** Ответ на текущий вопрос не понят — можно спросить AI и повторить ход с подсказкой. */
  unclear: boolean;
}

const hasValue = (v: unknown) => v !== undefined && v !== null && v !== "";
/** Вопрос «для кого»: поле recipient или поле с подписью «Для кого», «Кому», «Получатель». */
export const isRecipientField = (f: Pick<DealField, "key" | "label">) => f.key === "recipient" || /для\s+кого|кому|получател/i.test(f.label);
const preview = (t: string) => t.replace(/\s+/g, " ").trim().slice(0, 200);

/** Что из сообщений — текст для разбора, что — голосовое, фото, пропущенный звонок. */
export function classifyInputs(inputs: BotInput[]) {
  const texts: string[] = [];
  let voice = false;
  let media = false;
  let missedCall = false;
  for (const i of inputs) {
    const t = i.text.trim();
    const caption = t && t !== mediaCaption(i.type) ? t : "";
    if (i.type === "text") {
      if (t) texts.push(t);
    } else if (i.type === "audio") voice = true;
    else if (i.type === "image" || i.type === "video" || i.type === "document") {
      media = true;
      if (caption) texts.push(caption);
    } else if (i.type === "missing_call") missedCall = true;
  }
  return { text: texts.join("\n").slice(0, 2000), texts, voice, media, missedCall };
}

/** Почему бот не начинает опрос (или null — начинает). */
export type BotSkipReason = "channel" | "no_questions" | "no_deal" | "client_has_order" | "client_has_book" | "deal_closed" | "deal_in_work" | "prior_chat" | "continuation" | "media_only" | "work_time" | "disabled";

export const skipReasonLabels: Record<BotSkipReason, string> = {
  channel: "канал без бота",
  no_questions: "нет вопросов",
  no_deal: "нет сделки",
  client_has_order: "у клиента есть заказ",
  client_has_book: "у клиента есть книга",
  deal_closed: "сделка закрыта",
  deal_in_work: "сделка уже в работе",
  prior_chat: "переписка была до CRM",
  continuation: "продолжение старого разговора",
  media_only: "только фото или файл",
  work_time: "рабочее время",
  disabled: "бот выключен",
};

/** Решение «начинать ли опрос» по фактам о клиенте, сделке и первых сообщениях. */
export function startBlocker(g: {
  channelOk: boolean;
  questions: number;
  deal: { orderId: string | null; firstStage: boolean; closed: boolean; assigned: boolean; unsorted: boolean } | null;
  fresh: boolean;
  client: { orders: number; books: number } | null;
  priorChat: boolean;
  inputs: BotInput[];
}): BotSkipReason | null {
  if (!g.channelOk) return "channel";
  if (!g.questions) return "no_questions";
  if (!g.deal) return "no_deal";
  if (g.deal.orderId || (g.client?.orders ?? 0) > 0) return "client_has_order";
  if ((g.client?.books ?? 0) > 0) return "client_has_book";
  if (g.deal.closed) return "deal_closed";
  if (!g.fresh && (!g.deal.firstStage || (g.deal.assigned && !g.deal.unsorted))) return "deal_in_work";
  if (g.priorChat) return "prior_chat";
  const c = classifyInputs(g.inputs);
  if (!c.text && !c.voice && (c.media || g.inputs.length)) return "media_only";
  if (c.text && !c.voice && looksLikeContinuation(c.text)) return "continuation";
  return null;
}

interface Ctx {
  s: BotState;
  env: BotEnv;
  byKey: Map<string, DealField>;
}

/** Повод «дарите» не спрашиваем у тех, кто пишет автобиографию или свою книгу: это не подарок. */
const notAGift = (s: Pick<BotState, "theme">, key: string) => key === "occasion" && (s.theme === "autobiography" || s.theme === "blank");

const missing = ({ s, env }: Ctx) => s.questions.filter((f) => !notAGift(s, f) && !hasValue(s.filled[f]) && !hasValue(env.dealValues[f]) && !s.skipped.includes(f) && !(f in s.raw));

function labelsFor(ctx: Ctx, f: DealField) {
  return f.options.map((o) => optionLabel(ctx.env.config, o, "kk"));
}

/** Полный текст вопроса на языке клиента: варианты списка с номерами, меню тем для «для кого». */
function fullQuestion(ctx: Ctx, key: string) {
  const q = ctx.env.config.questions.find((x) => x.field === key);
  const f = ctx.byKey.get(key);
  if (!q || !f) return "";
  const text = questionFor(q, ctx.s.lang);
  if (f.type === "select") return questionText(text, f.options.map((o) => optionLabel(ctx.env.config, o, ctx.s.lang)));
  if (isRecipientField(f)) {
    const menu = themeMenuText(ctx.env.site.themes, ctx.s.lang);
    return menu ? `${text}\n${menu}` : text;
  }
  return text;
}

const shortQuestion = (ctx: Ctx, key: string) => {
  const q = ctx.env.config.questions.find((x) => x.field === key);
  return q ? questionFor(q, ctx.s.lang) : "";
};

/** Значение поля из текста. strict — только уверенное (для полей, о которых бот не спрашивал). */
function answerFor(ctx: Ctx, f: DealField, text: string, strict: boolean): { value: string | number; recipient?: Recipient } | null {
  const { env } = ctx;
  if (isRecipientField(f)) {
    const r = findRecipient(text, { themes: env.site.themes, menu: !strict && f.type !== "select", strong: strict });
    if (r) {
      if (f.type !== "select") return { value: r.label.ru, recipient: r };
      const opt = matchOption(r.label.ru, f.options, { strict: true }) ?? matchOption(text, f.options, { labels: labelsFor(ctx, f), strict });
      return opt ? { value: opt, recipient: r } : null;
    }
  }
  if (f.type === "select") {
    const opt = matchOption(text, f.options, { labels: labelsFor(ctx, f), strict });
    return opt ? { value: opt } : null;
  }
  if (f.type === "date") {
    if (strict && !mentionsMonth(text) && !/\d{1,2}[./-]\d{1,2}/.test(text) && !/нов\S*\s+год|жаңа\s*жыл/iu.test(text)) return null;
    const d = parseDateAnswer(text, env.now, env.tz);
    return d ? { value: d } : null;
  }
  if (strict) return null;
  if (f.type === "number") {
    const m = /-?\d+(?:[.,]\d+)?/.exec(text.replace(/(?<=\d)\s(?=\d{3}\b)/g, ""));
    const n = m ? Number(m[0].replace(",", ".")) : NaN;
    return Number.isFinite(n) ? { value: n } : null;
  }
  if (f.type === "checkbox") return null;
  // Текстовое поле: любой содержательный ответ, кроме вопросов, «ок» и «не знаю».
  if (isAck(text) || isDontKnow(text) || faqIntents(text).length || handoffIntent(text) || residual(text).length < 2) return null;
  return { value: text.trim().slice(0, 300) };
}

/** Как показать записанное значение клиенту («Поняла: маме, день рождения, 21 ноября»). */
function shown(ctx: Ctx, key: string, value: string | number, r?: Recipient) {
  const f = ctx.byKey.get(key);
  const lang = ctx.s.lang;
  if (r) return r.label[lang].charAt(0).toLocaleLowerCase("ru") + r.label[lang].slice(1);
  if (f?.type === "date" && typeof value === "string") return humanDate(value, lang);
  if (f?.type === "select" && typeof value === "string") {
    const l = optionLabel(ctx.env.config, value, lang);
    return /^\d/.test(l) ? l : l.charAt(0).toLocaleLowerCase("ru") + l.slice(1);
  }
  return String(value);
}

/**
 * Шаблон бота → текст. faq — ответ на частый вопрос; "lines" — тексты продаж: строка с пустой переменной (нет акции,
 * предоплаты, даты) выпадает целиком.
 */
function render(ctx: Ctx, template: string, extra: Record<string, string> = {}, mode?: FaqIntent | "lines") {
  const { env, s } = ctx;
  const vars: Record<string, string> = {
    ...catalogVars(env.catalog, s.lang),
    акция: promoFor(env.config, s.lang),
    когда: env.nextWorkStart ? whenText(env.nextWorkStart, env.now, s.lang, env.tz) : "",
    ...(env.config.sell.on ? sellVars(ctx) : {}),
    ...extra,
  };
  // Ответ на частый вопрос: строки с пустой переменной (скрытый тариф, нет акции) выпадают; к цене — акция.
  const filled = mode ? fillFaqLines(template, vars, { appendPromo: mode === "price" }) : fillBotVars(template, vars);
  return fillTemplate(filled, { name: env.name, link: extra.ссылка ?? env.site.url });
}

const text = (ctx: Ctx, key: BotTextKey, extra?: Record<string, string>) => render(ctx, botText(ctx.env.config, ctx.s.lang, key), extra, SELL_TEXTS.has(key) ? "lines" : undefined);
/** Вне рабочего времени (и когда известно, когда оно начнётся) — текст «…{когда}». */
const laterText = (ctx: Ctx, now: BotTextKey, later: BotTextKey) => (!ctx.env.workTime && ctx.env.nextWorkStart ? text(ctx, later) : text(ctx, now));

// ─── режим «Продаёт» ───────────────────────────────────────────────────────

const SELL_TEXTS = new Set<BotTextKey>(["offer", "offerPrice", "deadlineOk", "deadlineExpress", "deadlineLate", "close", "closeShort", "agreed", "agreedLater", "invoiceSent", "objPrice", "objLater", "followUp"]);
const DAY = 86_400_000;
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const dayMs = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
/**
 * «5–7» рабочих дней → от 5 рабочих → 7 календарных. Нижняя граница: так менеджеры и продают (16.10 → 25.10 успели), а
 * запас владелец задаёт днями доставки в настройках.
 */
const calendarDays = (days: string) => {
  const n = Math.min(...(days.match(/\d+/g) ?? ["0"]).map(Number));
  return Math.ceil((n * 7) / 5);
};

export type DeadlineKind = "ok" | "express" | "late";

/**
 * Успеем ли к дате: дописать книгу (writeDays) + печать + доставка. fillBy — последний день, чтобы дописать.
 * Печать обычная не успевает — экспресс; и экспресс не успевает — late. Прошедшая дата — null (бот про срок молчит).
 */
export function deadlinePlan(
  eventIso: string,
  now: Date,
  tz: string,
  sell: { writeDays: number; deliveryDays: number; productionDays?: number },
  production: { standard: string; premium: string },
): { kind: DeadlineKind; fillBy: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventIso)) return null;
  const today = dayMs(zonedDay(now, tz));
  const event = dayMs(eventIso);
  if (!Number.isFinite(event) || event < today) return null;
  // Срок владельца для бота («книга готовится до 5 дней», календарных) важнее рабочих дней с витрины сайта.
  const standard = event - (sell.deliveryDays + (sell.productionDays || calendarDays(production.standard))) * DAY;
  if (standard >= today + sell.writeDays * DAY) return { kind: "ok", fillBy: isoDay(standard) };
  const express = event - (sell.deliveryDays + calendarDays(production.premium)) * DAY;
  if (express >= today + DAY) return { kind: "express", fillBy: isoDay(express) };
  return { kind: "late", fillBy: isoDay(event) };
}

/** Значение поля сделки: из ответа боту или из сделки. */
const valueOf = (ctx: Ctx, key: string) => (hasValue(ctx.s.filled[key]) ? ctx.s.filled[key] : ctx.env.dealValues[key]);

/** Дата события (первое поле-дата из вопросов) и формат (поле «формат»: электронная или нет). */
function sellFacts(ctx: Ctx) {
  const dateKey = ctx.s.questions.find((k) => ctx.byKey.get(k)?.type === "date") ?? [...ctx.byKey.values()].find((f) => f.type === "date")?.key;
  const date = dateKey ? valueOf(ctx, dateKey) : null;
  const formatKey = [...ctx.byKey.values()].find((f) => f.key === "format" || /формат/i.test(f.label))?.key;
  const format = formatKey ? String(valueOf(ctx, formatKey) ?? "") : "";
  return { date: typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null, digital: /электрон|digital|pdf/i.test(format) };
}

/** Какой книгой оформлять счёт бота: электронная, если клиент её выбрал, иначе печатная. */
export function sellPlan(state: BotState, env: Pick<BotEnv, "fields" | "dealValues">): "digital" | "hardcover" {
  const ctx: Ctx = { s: state, env: env as BotEnv, byKey: new Map(env.fields.map((f) => [f.key, f])) };
  return sellFacts(ctx).digital ? "digital" : "hardcover";
}

function sellVars(ctx: Ctx): Record<string, string> {
  const { env, s } = ctx;
  const { date } = sellFacts(ctx);
  const plan = date ? deadlinePlan(date, env.now, env.tz, env.config.sell, env.catalog.productionDays) : null;
  const prepay = env.config.sell.prepay;
  return {
    дата: date ? humanDate(date, s.lang) : "",
    заполнить_до: plan ? humanDate(plan.fillBy, s.lang) : "",
    предоплата: prepay > 0 ? `${new Intl.NumberFormat("ru-RU").format(prepay)} ₸` : "",
  };
}

/** Предложение после опроса: ценность, цена (если о ней ещё не отвечали), срок к дате, «Оформляем?». */
function offerParts(ctx: Ctx): string[] {
  const out = [text(ctx, "offer")];
  if (!ctx.s.faq.includes("price")) out.push(text(ctx, "offerPrice"));
  const { date, digital } = sellFacts(ctx);
  const plan = date && !digital ? deadlinePlan(date, ctx.env.now, ctx.env.tz, ctx.env.config.sell, ctx.env.catalog.productionDays) : null;
  if (plan) out.push(text(ctx, plan.kind === "ok" ? "deadlineOk" : plan.kind === "express" ? "deadlineExpress" : "deadlineLate"));
  out.push(text(ctx, "close"));
  return out;
}

/** Текст бота вне хода (счёт выставлен, напоминание) — с теми же переменными, что в ходе. */
export function botSellText(state: BotState, env: BotEnv, key: BotTextKey) {
  return text({ s: state, env, byKey: new Map(env.fields.map((f) => [f.key, f])) }, key);
}

/** Напоминание после предложения, если клиент замолчал (один раз). */
export function botFollowUp(prev: BotState, env: BotEnv): BotTurn {
  const s: BotState = { ...prev, followedUp: true, version: prev.version + 1 };
  const reply = botSellText(s, env, "followUp") || null;
  if (reply) s.lastBotAt = env.now.toISOString();
  return { state: s, reply, fields: {}, events: [{ kind: "follow_up" }], handoff: null, done: false, unclear: false };
}

/** Клиент молчит после предложения (и после напоминания): итог менеджеру, бот больше не пишет. */
export function offerExpired(prev: BotState): { state: BotState; events: BotEvent[] } {
  return { state: { ...prev, phase: "done", outcome: "offered", asking: null, version: prev.version + 1 }, events: [{ kind: "offered" }] };
}

/**
 * Один ход бота. state.phase = waiting — первый ход (приветствие); active — продолжение; done — ничего не делает.
 * Входящие, уже обработанные (state.seen), пропускаются.
 */
export function botTurn(prev: BotState, allInputs: BotInput[], env: BotEnv): BotTurn {
  const s: BotState = JSON.parse(JSON.stringify(prev));
  const idle: BotTurn = { state: prev, reply: null, fields: {}, events: [], handoff: null, done: prev.phase === "done", unclear: false };
  if (s.phase === "done") return idle;
  const inputs = allInputs.filter((i) => !s.seen.includes(i.id));
  const start = s.phase === "waiting";
  if (!inputs.length && !start) return idle;
  s.seen = [...s.seen, ...inputs.map((i) => i.id)].slice(-200);

  const byKey = new Map(env.fields.map((f) => [f.key, f]));
  const ctx: Ctx = { s, env, byKey };
  const events: BotEvent[] = [];
  const fields: Record<string, string | number> = {};
  const parts: string[] = [];
  const c = classifyInputs(inputs);
  const t = c.text;

  if (start) {
    s.phase = "active";
    s.startedAt = env.now.toISOString();
    s.questions = env.config.questions.filter((q) => byKey.has(q.field)).map((q) => q.field);
    s.lang = langRequest(t) ?? detectLang(t) ?? env.hints?.lang ?? env.client.locale ?? "ru";
    s.first = preview(c.texts[0] ?? (c.voice ? "🎤" : c.media ? "📷" : ""));
    events.push({ kind: "started", reason: s.lang });
    parts.push(text(ctx, "greeting"));
  } else {
    const req = langRequest(t);
    if (req) s.lang = req;
    else if (s.lang === "ru" && detectLang(t) === "kk") s.lang = "kk";
  }

  const handoff = handoffIntent(t) ?? (c.missedCall ? "call" : null) ?? env.hints?.handoff ?? null;
  const intents = [...new Set([...faqIntents(t), ...(env.hints?.intents ?? [])])];
  for (const i of [...intents, ...(handoff ? [`handoff:${handoff}`] : [])]) if (!s.intents.includes(i)) s.intents.push(i);

  // 1. Ответы на частые вопросы: каждый — один раз, повтор — «уточню у менеджера».
  for (const intent of intents) {
    const a = env.config.faq[intent];
    if (!a?.on) continue;
    if (!s.faq.includes(intent)) {
      parts.push(render(ctx, faqFor(env.config, intent, s.lang), s.links.length ? { ссылка: s.links[0] } : {}, intent));
      s.faq.push(intent);
      events.push({ kind: "faq", intent });
    } else if (!s.repeated.includes(intent)) {
      parts.push(text(ctx, "repeat"));
      s.repeated.push(intent);
    }
  }

  // 2. Голосовые и фото: одно подтверждение за диалог, поле не пишется.
  if (c.voice) {
    events.push({ kind: "media", reason: "voice" });
    if (!s.ack.includes("voice")) {
      parts.push(text(ctx, "voice"));
      s.ack.push("voice");
    }
  }
  if (c.media) {
    events.push({ kind: "media", reason: "file" });
    if (!s.ack.includes("media") && !t) {
      parts.push(text(ctx, "media"));
      s.ack.push("media");
    }
  }

  // Режим «Продаёт»: предложение уже сделано — доводим до «да», отвечаем на возражения, непонятное — человеку.
  if (s.stage === "offer") return offerTurn(ctx, prev, { t, c, handoff, intents, events, parts });

  // 3. Ответ на текущий вопрос и всё, что ещё можно понять из сообщения.
  const current = start ? null : s.asking;
  const filledNow: { key: string; value: string | number; r?: Recipient }[] = [];
  const set = (key: string, value: string | number, r?: Recipient) => {
    s.filled[key] = value;
    fields[key] = value;
    filledNow.push({ key, value, r });
    events.push({ kind: "answer", field: key });
    if (r) {
      s.recipient = r.key;
      if (r.theme) s.theme = r.theme;
    }
  };
  let answeredCurrent = false;
  let unclear = false;
  // «Стоп», «не пишите» — не ответ на вопрос «для кого»: поля не пишем, прощаемся ниже.
  const stop = isStop(t);
  if (current && t && !stop && missing(ctx).includes(current)) {
    const f = byKey.get(current);
    if (f) {
      const a = answerFor(ctx, f, t, false);
      if (a) {
        set(current, a.value, a.recipient);
        answeredCurrent = true;
      } else if (isDontKnow(t)) {
        s.skipped.push(current);
        events.push({ kind: "answer", field: current, reason: "unknown" });
        answeredCurrent = true;
      } else {
        const hinted = env.hints?.fields?.[current];
        const h = hinted ? answerFor(ctx, f, hinted, f.type !== "text") : null;
        if (h) {
          set(current, h.value, h.recipient);
          answeredCurrent = true;
        }
      }
    }
  }
  // Вопрос клиента («электронная есть?») — не выбор: варианты без спроса берём только из утверждений. Дата в вопросе
  // («успеете к 1 ноября?») — та самая дата, к которой нужна книга.
  const statements = t
    .split(/(?<=[.!?])\s+|\n+/)
    .filter((x) => !x.includes("?"))
    .join(" ");
  for (const key of missing(ctx)) {
    if (key === current || stop) continue;
    const f = byKey.get(key);
    if (!f || !t) continue;
    const source = isRecipientField(f) || f.type === "date" ? t : statements;
    const a = (source ? answerFor(ctx, f, source, true) : null) ?? (env.hints?.fields?.[key] && f.type !== "text" ? answerFor(ctx, f, env.hints.fields[key], true) : null);
    if (a) set(key, a.value, a.recipient);
  }

  // 4. Не понял ответ: один переспрос с подсказкой, после второго промаха — сохраняем как написано и идём дальше.
  let reasked = false;
  const attempt = !!current && !!t && !stop && !answeredCurrent && !isAck(t) && !intents.length && !handoff && residual(t).length >= 2;
  if (attempt && current) {
    unclear = true;
    s.retries[current] = (s.retries[current] ?? 0) + 1;
    const f = byKey.get(current);
    if ((f?.type === "date" && mentionsMonth(t)) || s.retries[current] >= 2) {
      s.raw[current] = t.slice(0, 300);
      events.push({ kind: "unrecognized", field: current });
    } else {
      parts.push(`${text(ctx, "reask")}\n${fullQuestion(ctx, current)}`);
      reasked = true;
    }
  }

  // 5. «Поняла: …», когда из сообщения взято больше, чем ответ на заданный вопрос.
  if (filledNow.length && (start || filledNow.length > 1 || filledNow.some((x) => x.key !== current))) {
    parts.push(text(ctx, "noted", { что: filledNow.map((x) => shown(ctx, x.key, x.value, x.r)).join(", ") }));
  }

  // 6. Ссылка на пример книги (или начать книгу) — один раз, когда стало понятно, для кого книга.
  const r = filledNow.find((x) => x.r)?.r;
  if (r && env.config.sendLink && !s.links.length) {
    const link = bookLink(r, env.site, s.lang, env.client.known);
    if (link) {
      parts.push(text(ctx, link.kind === "start" ? "linkStart" : "linkExample", { ссылка: link.url }));
      s.links.push(link.url);
    }
  }

  // 7. Человек нужен — передаём; «не интересует» — прощаемся; иначе следующий вопрос или конец.
  let done = false;
  if (handoff) {
    parts.push(laterText(ctx, "handoff", "handoffLater"));
    s.outcome = "handoff";
    s.reason = handoff;
    events.push({ kind: "handoff", reason: handoff });
    done = true;
  } else if (t && isDecline(t) && !filledNow.length && !answeredCurrent) {
    parts.push(text(ctx, "decline"));
    s.outcome = "declined";
    events.push({ kind: "declined" });
    done = true;
  } else if (!reasked) {
    const next = missing(ctx)[0];
    if (next) {
      // Тот же вопрос без новостей (стикер, «ок») — молчим: вопрос уже в чате. После ответа на частый вопрос —
      // напоминаем вопрос коротко, без списка вариантов (он выше в чате).
      if (start || next !== s.asking || s.lang !== prev.lang) parts.push(fullQuestion(ctx, next));
      else if (parts.length) parts.push(shortQuestion(ctx, next));
      s.asking = next;
    } else if (env.config.sell.on) {
      // Режим «Продаёт»: вместо «передала менеджеру» — предложение, бот остаётся в диалоге.
      parts.push(...offerParts(ctx));
      s.stage = "offer";
      s.asking = null;
      s.offeredAt = env.now.toISOString();
      events.push({ kind: "offer" });
    } else {
      parts.push(laterText(ctx, "finish", "finishLater"));
      s.outcome = "finished";
      events.push({ kind: "finished" });
      done = true;
    }
  }
  if (done) {
    s.phase = "done";
    s.asking = null;
  }
  const reply = parts.filter((p) => p.trim()).join("\n\n").trim() || null;
  if (reply) s.lastBotAt = env.now.toISOString();
  s.version = prev.version + 1;
  return { state: s, reply, fields, events, handoff: done && handoff ? handoff : null, done, unclear };
}

/** Ход после предложения. Каждое возражение — один ответ; второе возражение, вопрос без шаблона, файл — человеку. */
function offerTurn(
  ctx: Ctx,
  prev: BotState,
  m: { t: string; c: ReturnType<typeof classifyInputs>; handoff: HandoffKind | null; intents: FaqIntent[]; events: BotEvent[]; parts: string[] },
): BotTurn {
  const { s } = ctx;
  const { t, c, handoff, intents, events, parts } = m;
  const pass = (reason: string) => {
    parts.push(laterText(ctx, "handoff", "handoffLater"));
    s.outcome = "handoff";
    s.reason = reason;
    events.push({ kind: "handoff", reason });
  };
  let done = true;
  const agree = !handoff && !intents.length && !!t && isAgree(t);
  const objection = !handoff && !agree && t ? (objectionKind(t) ?? (isBareNo(t) ? "later" : null)) : null;
  if (handoff === "pay" || agree) {
    // Согласие: счёт выставит бот (QualifierBot) или менеджер — этот текст на случай, если бот счёт не выставил.
    parts.push(laterText(ctx, "agreed", "agreedLater"));
    s.outcome = "handoff";
    s.reason = "agreed";
    events.push({ kind: "agreed" });
  } else if (handoff) pass(handoff);
  else if (t && isDecline(t)) {
    parts.push(text(ctx, "decline"));
    s.outcome = "declined";
    events.push({ kind: "declined" });
  } else if (objection) {
    if (s.objections.length) pass("objection");
    else {
      parts.push(text(ctx, objection === "price" ? "objPrice" : "objLater"));
      s.objections.push(objection);
      events.push({ kind: "objection", reason: objection });
      done = false;
    }
  } else if (intents.length) {
    // Ответили на вопрос (цена, доставка…) — и снова «Оформляем?».
    if (parts.length) parts.push(text(ctx, "closeShort"));
    done = false;
  } else if (c.media && !t) {
    // Фото или файл после предложения — часто чек: смотрит менеджер. Подтверждение «передам менеджеру» уже в ответе.
    if (!parts.length) parts.push(laterText(ctx, "handoff", "handoffLater"));
    s.outcome = "handoff";
    s.reason = "media";
    events.push({ kind: "handoff", reason: "media" });
  } else if (t && !isAck(t) && !isWillLook(t) && residual(t).length >= 2) pass("question");
  else done = false;
  if (done) {
    s.phase = "done";
    s.asking = null;
  }
  const reply = parts.filter((p) => p.trim()).join("\n\n").trim() || null;
  if (reply) s.lastBotAt = ctx.env.now.toISOString();
  s.version = prev.version + 1;
  return { state: s, reply, fields: {}, events, handoff: done && handoff ? handoff : null, done, unclear: false };
}

/** Клиент замолчал посреди опроса: частичная сводка менеджеру, бот больше не пишет. */
export function abandonBot(prev: BotState): { state: BotState; events: BotEvent[] } {
  return { state: { ...prev, phase: "done", outcome: "abandoned", reason: prev.asking, asking: null, version: prev.version + 1 }, events: [{ kind: "abandoned", field: prev.asking }] };
}

const handoffLabels: Record<string, string> = {
  call: "просит позвонить",
  manager: "просит менеджера",
  paid: "сообщает, что оплатил(а)",
  pay: "хочет оплатить",
  complaint: "жалоба или вопрос по заказу",
  agreed: "согласен(на) оформить — нужен счёт",
  objection: "сомневается после предложения",
  question: "задал(а) вопрос после предложения",
  media: "прислал(а) файл после предложения",
  price: "спрашивает цену — подберите вариант и назовите цену",
};
const intentLabels: Record<string, string> = { price: "цену", delivery: "доставку", timing: "сроки", how: "как это работает", payment: "оплату", examples: "примеры", language: "язык книги" };

/** Заголовок итога для уведомления менеджеру. */
export function outcomeTitle(s: BotState) {
  if (s.outcome === "handoff") return `Клиент ${handoffLabels[s.reason ?? ""] ?? "просит человека"}`;
  if (s.outcome === "abandoned") return "Клиент не ответил боту";
  if (s.outcome === "declined") return "Клиенту не интересно";
  if (s.outcome === "offered") return "Бот сделал предложение, клиент молчит";
  if (s.outcome === "invoiced") return "Бот выставил счёт";
  if (s.stage === "offer" && s.phase !== "done") return "Бот сделал предложение";
  return "Бот собрал ответы";
}

/** Сводка для менеджера: что понял бот, о чём спрашивал клиент, что отправлено и чего не хватает. */
export function botSummary(s: BotState, fields: DealField[], dealValues: Record<string, unknown> = {}): string {
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const lines: string[] = [`🤖 ${outcomeTitle(s)}${s.lang === "kk" ? " · писал(а) по-казахски" : ""}`];
  const lack: string[] = [];
  for (const key of s.questions) {
    const f = byKey.get(key);
    if (!f) continue;
    const v = s.filled[key];
    if (notAGift(s, key) && !hasValue(v)) continue;
    let shownValue: string;
    if (hasValue(v)) shownValue = f.type === "date" && typeof v === "string" ? humanDate(v, "ru", true) : String(v);
    else if (hasValue(dealValues[key])) shownValue = `${String(dealValues[key])} (было в сделке)`;
    else if (s.raw[key]) shownValue = `не распознано: «${preview(s.raw[key])}»`;
    else if (s.skipped.includes(key)) shownValue = "клиент пока не знает";
    else {
      shownValue = "—";
      lack.push(f.label);
    }
    if (isRecipientField(f) && s.theme) shownValue += ` (тема «${themeLabel(s.theme, "ru")}»)`;
    lines.push(`${f.label}: ${shownValue}`);
  }
  const asked = s.intents.filter((i) => intentLabels[i]).map((i) => `${intentLabels[i]}${s.faq.includes(i as FaqIntent) ? "" : " (без ответа)"}`);
  if (asked.length) lines.push(`Спрашивал(а): ${asked.join(", ")}`);
  if (s.links.length) lines.push(`Отправлено: ${s.links.join(", ")}`);
  if (s.offeredAt) lines.push(`Предложение: сделано${s.followedUp ? ", напоминание отправлено" : ""}`);
  if (s.objections.length) lines.push(`Возражения: ${s.objections.map((o) => (o === "price" ? "дорого" : "подумает / позже")).join(", ")}`);
  if (s.engine === "ai") {
    if (s.ai.takeover) lines.push(`Бот подхватил переписку: клиент ждал менеджера ${s.ai.waitedMinutes} мин`);
    if (s.ai.summary) lines.push(`Заметка бота: ${s.ai.summary}`);
    if (s.ai.objections) lines.push(`Возражений: ${s.ai.objections}`);
  }
  if (s.first) lines.push(`Первое сообщение: «${s.first}»`);
  if (lack.length && s.outcome !== "finished") lines.push(`Не хватает: ${lack.join(", ")}`);
  return lines.join("\n");
}
