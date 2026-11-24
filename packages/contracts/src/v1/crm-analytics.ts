/**
 * API v1 — отчёты руководителя для приложения CRM: «Реестр продаж» (покупатели периода, форма оплаты сделки), «Аналитика
 * продаж» (деньги, воронка, каналы, команда, скорость ответа, телефония, отказы) и «Статистика лидов» (заявки периода и
 * их разрезы). Модели — те же функции сайта (salesRegisterScreen, loadSalesAnalytics, leadStatsScreen); доли — 0…1,
 * суммы — целые тенге; подписи времени ответа — готовым текстом (рабочие минуты считает сервер).
 */
import { z } from "zod";
import { route, schemas, uuid, type RouteDef } from "./core";
import { Choice, Done } from "./crm";
import { MoneyFlow, MoneyPeriod } from "./crm-finance";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const ratio = z.number().nullable();
const int = z.number().int();
const Preset = z.enum(["today", "7d", "month", "prev", "custom"]);

// ─── Реестр продаж ───────────────────────────────────────────────────────────────────────────────────────────────

export const SalesRow = z
  .object({
    /** Сделка. */
    id: uuid,
    number: int,
    /** День продажи (первой оплаты). */
    day,
    client: z.string(),
    /** Телефон — по праву «Видеть телефоны полностью» (иначе маской). */
    phone: z.string(),
    city: z.string(),
    channel: z.string(),
    manager: z.string(),
    plan: z.string(),
    price: int,
    paid: int,
    rest: int,
    state: z.string(),
    method: z.string(),
    payForm: z.string(),
    /** Комиссия банка — видит тот, кому открыты расходы (иначе 0). */
    fee: int,
    eventDate: z.string(),
    orderId: uuid.nullable(),
  })
  .register(schemas, { id: "SalesRow" });

export const SalesRegister = z
  .object({
    period: MoneyPeriod,
    totals: z.object({ count: int, settled: int, price: int, paid: int, rest: int, fee: int }),
    rows: z.array(SalesRow),
    /** Можно менять форму оплаты сделки (deals.edit); варианты — поля сделки. */
    canEdit: z.boolean(),
    payForms: z.array(z.string()),
    showFees: z.boolean(),
  })
  .register(schemas, { id: "SalesRegister" });

export const PayFormBody = z.object({ form: z.string().trim().max(60) }).strict().register(schemas, { id: "PayFormBody" });

// ─── Аналитика продаж ────────────────────────────────────────────────────────────────────────────────────────────

export const AnalyticsFunnelRow = z
  .object({ id: z.string(), name: z.string(), kind: z.string(), reached: int, prev: int.nullable(), conversion: z.string().nullable(), timeLabel: z.string().nullable() })
  .register(schemas, { id: "AnalyticsFunnelRow" });

export const AnalyticsChannel = z.object({ key: z.string(), label: z.string(), created: int, won: int, revenue: int }).register(schemas, { id: "AnalyticsChannel" });

export const AnalyticsManager = z
  .object({
    id: z.string(),
    name: z.string(),
    deals: int,
    won: int,
    /** Сумма выигранных сделок и деньги, пришедшие по его сделкам за период. */
    revenue: int,
    received: int,
    open: int,
    messages: int,
    phoneMessages: int,
    calls: int,
    talkMinutes: int,
    tasksDone: int,
    tasksOverdue: int,
    /** Первый ответ: медиана в рабочих минутах и доля в норматив — готовым текстом; «—» — не отвечал. */
    responseLabel: z.string(),
    inSlaLabel: z.string(),
    /** Выполнение плана месяца, «64%» или «—». */
    planLabel: z.string(),
  })
  .register(schemas, { id: "AnalyticsManager" });

export const SalesAnalytics = z
  .object({
    period: MoneyPeriod,
    pipelines: z.array(Choice),
    pipelineId: z.string(),
    /** Деньги периода строкой — руководству с правом финансов; иначе null. */
    flow: MoneyFlow.nullable(),
    tiles: z.object({
      received: int,
      receivedDelta: ratio,
      wonSum: int,
      wonSumDelta: ratio,
      repeatRevenue: int,
      created: int,
      createdDelta: ratio,
      repeatCreated: int,
      won: int,
      wonDelta: ratio,
      repeatWon: int,
      conversion: z.string(),
      cycle: z.string(),
      responseMedian: z.string(),
      inSla: z.string(),
      slaMinutes: int,
      awaiting: int,
      /** Бот ответил первым (раз) и его медиана. */
      botFirst: int,
      botMedian: z.string().nullable(),
    }),
    funnel: z.object({ base: int, inWork: int, rows: z.array(AnalyticsFunnelRow) }),
    channels: z.array(AnalyticsChannel),
    team: z.array(AnalyticsManager),
    /** Дольше всех ждали ответа (чат — /admin/chats?c=<id>). */
    longest: z.array(z.object({ conversationId: z.string(), askedLabel: z.string(), waitLabel: z.string(), answered: z.boolean() })),
    calls: z.object({ incoming: int, outgoing: int, missed: int, handled: int, talkMinutes: int, unanswered: int, asked: int }),
    lost: z.array(z.object({ label: z.string(), value: int })),
  })
  .register(schemas, { id: "SalesAnalytics" });

// ─── Статистика лидов ────────────────────────────────────────────────────────────────────────────────────────────

/** Разрез заявок: сколько пришло, сколько оплатили, конверсия. */
export const LeadCut = z.object({ key: z.string().nullable(), label: z.string(), leads: int, paid: int, conversion: ratio }).register(schemas, { id: "LeadCut" });

export const LeadShare = z.object({ label: z.string(), count: int, share: ratio }).register(schemas, { id: "LeadShare" });

export const LeadStats = z
  .object({
    period: MoneyPeriod,
    /** Фильтр по менеджеру: список и выбранный (null — все). */
    managers: z.array(Choice),
    managerId: z.string().nullable(),
    /** Расход на рекламу виден руководству с правом финансов. */
    showSpend: z.boolean(),
    totals: z.object({
      leads: int,
      junk: int,
      paid: int,
      conversion: ratio,
      open: int,
      lost: int,
      repeat: int,
      avgCheck: int.nullable(),
      medianHours: z.number().nullable(),
      payments: int,
      paymentsFirst: int,
      paymentsAgreed: int,
      invoices: int,
      spend: int,
      cpl: int.nullable(),
      cac: int.nullable(),
      roas: ratio,
      roasAgreed: ratio,
      adShare: ratio,
      deltaLeads: ratio,
      deltaPaid: ratio,
      deltaConversion: ratio,
    }),
    daily: z.array(z.object({ day, leads: int, junk: int, invoices: int, payments: int, first: int, agreed: int, spend: int, conversion: ratio, cpl: int.nullable(), cac: int.nullable(), roas: ratio })),
    stages: z.array(z.object({ key: z.string(), label: z.string(), kind: z.string(), pipeline: z.string(), count: int, share: ratio, paid: int })),
    lost: z.array(LeadShare),
    bySource: z.array(LeadCut),
    buyersBySource: z.array(z.object({ key: z.string(), label: z.string(), buyers: int, agreed: int, received: int, share: ratio })),
    byManager: z.array(LeadCut),
    byRecipient: z.array(LeadCut),
    byOccasion: z.array(LeadCut),
    byLeadTime: z.array(LeadCut),
    byWeekday: z.array(LeadCut),
    byHour: z.array(LeadCut),
    payDelay: z.array(LeadShare),
  })
  .register(schemas, { id: "LeadStats" });

const PeriodQuery = z.object({ p: Preset.optional(), from: day.optional(), to: day.optional() });

export const crmAnalyticsRoutes = {
  crmSalesRegister: route({ method: "GET", path: "/api/v1/crm/sales", auth: "staff", tag: "crm", summary: "Реестр продаж: покупатели периода, цена, оплачено, остаток, форма оплаты", query: PeriodQuery, response: SalesRegister }),
  crmSalesPayForm: route({ method: "PUT", path: "/api/v1/crm/sales/{dealId}/pay-form", auth: "staff", tag: "crm", summary: "Форма оплаты сделки (Kaspi Gold, Рассрочка…); пусто — снять", params: z.object({ dealId: uuid }), body: PayFormBody, response: Done }),
  crmAnalytics: route({ method: "GET", path: "/api/v1/crm/analytics", auth: "staff", tag: "crm", summary: "Аналитика продаж: деньги, воронка, каналы, команда, скорость ответа, телефония", query: PeriodQuery.extend({ pl: z.string().max(40).optional() }), response: SalesAnalytics }),
  crmLeadStats: route({ method: "GET", path: "/api/v1/crm/leads", auth: "staff", tag: "crm", summary: "Статистика лидов: заявки периода, по дням, этапы, отказы и разрезы", query: PeriodQuery.extend({ m: uuid.optional() }), response: LeadStats }),
} satisfies Record<string, RouteDef>;
