/**
 * API v1 — деньги для приложения CRM: «Финансы» (очередь «Проверить», к возврату или зачёту, пришло, ожидается),
 * «Расходы» (ведомость с правкой) и «Прибыль» (отчёт за период, экономика продаж, комиссии и налог). Модели — те же
 * функции экранов сайта (modules/reporting/ui: financeScreen, expensesScreen, profitScreen), действия — те же server
 * actions (права, «только свои», журнал действий). Суммы — целые тенге, доли — 0…1.
 *
 * Ссылки `href` — адреса карточек CRM (/admin/deals/<id>, /admin/orders/<id>): приложение открывает их своими экранами.
 * Чек `receiptUrl` — файловый маршрут сайта (Bearer).
 */
import { z } from "zod";
import { route, schemas, uuid, type RouteDef } from "./core";
import { Choice, Done } from "./crm";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const nullableNumber = z.number().nullable();

const Preset = z.enum(["today", "7d", "month", "prev", "custom"]);

/** Период: пресет или свои даты (p=custom&from&to); пусто — текущий месяц. */
const PeriodQuery = z.object({ p: Preset.optional(), from: day.optional(), to: day.optional() });

export const MoneyPeriod = z
  .object({ preset: Preset, label: z.string(), first: day, last: day, presets: z.array(Choice) })
  .register(schemas, { id: "MoneyPeriod" });

export const MoneyRef = z.object({ label: z.string(), href: z.string() }).register(schemas, { id: "MoneyRef" });

/** Столбик разбивки: способ оплаты, категория, группа книг. */
export const MoneyBar = z.object({ key: z.string(), label: z.string(), value: z.number().int(), count: z.number().int() }).register(schemas, { id: "MoneyBar" });

/** Деньги периода одной строкой (как у «Финансов», «Прибыли» и «Аналитики»): пришло − возвраты − комиссии − налог = на счёт; − остальное = прибыль. */
export const MoneyFlow = z
  .object({ incoming: z.number().int(), refunds: z.number().int(), fees: z.number().int(), tax: z.number().int(), net: z.number().int(), other: z.number().int(), profit: z.number().int() })
  .register(schemas, { id: "MoneyFlow" });

// ─── Финансы ─────────────────────────────────────────────────────────────────────────────────────────────────────

export const FinanceMoneyRow = z
  .object({
    key: z.string(),
    dateLabel: z.string(),
    /** Со знаком: возврат — минус. */
    amount: z.number().int(),
    refund: z.boolean(),
    method: z.string(),
    what: z.string(),
    refs: z.array(MoneyRef),
    client: z.string(),
    manager: z.string(),
    acceptedBy: z.string(),
    receiptUrl: z.string().nullable(),
    /** Ручная запись: проверил ли руководитель; null — не проверяется (онлайн). */
    check: z.enum(["reviewed", "pending"]).nullable(),
  })
  .register(schemas, { id: "FinanceMoneyRow" });

/** Ручная оплата или возврат без проверки руководителем. mine — записал смотрящий: свою запись не проверяют. */
export const FinanceReviewRow = z
  .object({
    key: z.string(),
    kind: z.enum(["deal", "order"]),
    id: uuid,
    amount: z.number().int(),
    dateLabel: z.string(),
    what: z.string(),
    refund: z.boolean(),
    mine: z.boolean(),
    refs: z.array(MoneyRef),
    client: z.string(),
    manager: z.string(),
    acceptedBy: z.string(),
    receiptUrl: z.string().nullable(),
    invoice: z.string().nullable(),
    note: z.string().nullable(),
  })
  .register(schemas, { id: "FinanceReviewRow" });

/** Случай «Нужно вернуть или зачесть»; target — где оформить возврат (сделка или заказ), null — только «Отметить решённым». */
export const FinanceIssue = z
  .object({
    key: z.string(),
    kind: z.string(),
    title: z.string(),
    href: z.string().nullable(),
    ref: z.string(),
    client: z.string(),
    manager: z.string(),
    amount: z.number().int(),
    note: z.string(),
    dateLabel: z.string().nullable(),
    target: z.object({ kind: z.enum(["deal", "order"]), id: uuid, number: z.number().int() }).nullable(),
    /** Электронная версия оплачена с переплатой — можно перевести в печатную (тариф заказа). */
    canUpgrade: z.boolean(),
  })
  .register(schemas, { id: "FinanceIssue" });

export const FinanceResolved = z
  .object({
    id: uuid,
    title: z.string(),
    ref: z.string(),
    client: z.string(),
    href: z.string().nullable(),
    amount: z.number().int(),
    note: z.string(),
    by: z.string(),
    dateLabel: z.string(),
    /** После отмены решения случай вернётся в очередь. */
    stillOpen: z.boolean(),
  })
  .register(schemas, { id: "FinanceResolved" });

/** Кто ещё должен: остаток договорённости сделки, заказ на оплате или постоплата. */
export const FinanceDue = z
  .object({
    key: z.string(),
    kind: z.enum(["deal", "order", "postpay"]),
    href: z.string(),
    ref: z.string(),
    client: z.string(),
    manager: z.string(),
    total: z.number().int(),
    paid: z.number().int(),
    left: z.number().int(),
    group: z.enum(["ready", "progress", "none"]),
    bookLabel: z.string(),
    dueLabel: z.string().nullable(),
    overdue: z.boolean(),
    invoice: z.string().nullable(),
    note: z.string().nullable(),
  })
  .register(schemas, { id: "FinanceDue" });

export const Finance = z
  .object({
    period: MoneyPeriod,
    /** Роль «только свои»: только свои деньги. */
    own: z.boolean(),
    totals: z.object({
      net: z.number().int(),
      incoming: z.number().int(),
      refunds: z.number().int(),
      online: z.number().int(),
      manual: z.number().int(),
      count: z.number().int(),
      refundCount: z.number().int(),
      prevNet: z.number().int(),
      /** Изменение «пришло» к прошлому периоду; null — сравнивать не с чем. */
      delta: nullableNumber,
      expected: z.number().int(),
      expectedReady: z.number().int(),
      postpay: z.number().int(),
      postpayCount: z.number().int(),
      overpaid: z.number().int(),
      overpaidCount: z.number().int(),
      reviewCount: z.number().int(),
      reviewSum: z.number().int(),
    }),
    /** Деньги периода строкой — руководству с правом финансов; иначе null. */
    flow: MoneyFlow.nullable(),
    byDay: z.array(z.object({ date: day, incoming: z.number().int(), refunds: z.number().int() })),
    byMethod: z.array(MoneyBar),
    byManager: z.array(MoneyBar),
    review: z.array(FinanceReviewRow),
    issues: z.array(FinanceIssue),
    resolved: z.array(FinanceResolved),
    /** Последние поступления (до 50) и возвраты периода. */
    recent: z.array(FinanceMoneyRow),
    refunds: z.array(FinanceMoneyRow),
    /** Кто должен (до 200, по готовности книги и остатку) и итоги по группам книг. */
    expected: z.object({ rows: z.array(FinanceDue), groups: z.array(MoneyBar), total: z.number().int() }),
    perms: z.object({ reviewDeal: z.boolean(), reviewOrder: z.boolean(), resolveDeal: z.boolean(), resolveOrder: z.boolean(), refundDeal: z.boolean(), editOrder: z.boolean() }),
  })
  .register(schemas, { id: "Finance" });

export const FinanceReviewBody = z.object({ kind: z.enum(["deal", "order"]), id: uuid }).strict().register(schemas, { id: "FinanceReviewBody" });

export const FinanceResolveBody = z
  .object({ key: z.string().max(80), amount: z.number().int().positive(), note: z.string().trim().min(3, "Напишите, как решили: от 3 символов").max(500) })
  .strict()
  .register(schemas, { id: "FinanceResolveBody" });

// ─── Расходы ─────────────────────────────────────────────────────────────────────────────────────────────────────

export const ExpenseRowOut = z
  .object({
    id: uuid,
    /** expense — расход магазина, ads — реклама (хранится в расходах канала маркетинга). */
    source: z.enum(["expense", "ads"]),
    day,
    category: z.string(),
    categoryLabel: z.string(),
    /** Название для списка: у рекламы — «Реклама: канал». */
    name: z.string(),
    title: z.string(),
    amount: z.number().int(),
    quantity: z.number().int().nullable(),
    note: z.string(),
    channel: z.string().nullable(),
    by: z.string(),
  })
  .register(schemas, { id: "ExpenseRow" });

export const Expenses = z
  .object({
    period: MoneyPeriod,
    total: z.number().int(),
    byCategory: z.array(MoneyBar),
    byGroup: z.array(MoneyBar),
    rows: z.array(ExpenseRowOut),
    canManage: z.boolean(),
    /** Категории с группой (себестоимость, маркетинг, команда, прочее) и каналы рекламы — для формы. */
    categories: z.array(z.object({ id: z.string(), label: z.string(), group: z.string() })),
    channels: z.array(Choice),
  })
  .register(schemas, { id: "Expenses" });

/** Расход: у рекламы (category=ads) — канал, у остального — название от 2 символов. День — не позже сегодня. */
export const ExpenseBody = z
  .object({
    category: z.string().max(40),
    day,
    amount: z.number().int().min(1).max(100_000_000),
    title: z.string().trim().max(120).default(""),
    quantity: z.number().int().min(1).max(100_000).nullable().optional(),
    note: z.string().trim().max(200).default(""),
    channel: z.string().max(40).nullable().optional(),
  })
  .strict()
  .register(schemas, { id: "ExpenseBody" });

const ExpenseParams = z.object({ expenseId: uuid });
const ExpenseSourceQuery = z.object({ source: z.enum(["expense", "ads"]) });

// ─── Прибыль ─────────────────────────────────────────────────────────────────────────────────────────────────────

export const ProfitLine = z
  .object({
    label: z.string(),
    value: z.number().int(),
    prev: z.number().int(),
    /** sum — итог (выручка, валовая), sub — строка-деталь, result — прибыль, null — группа расходов. */
    kind: z.enum(["sum", "sub", "result"]).nullable(),
    /** Вычитается (расход, возврат). */
    minus: z.boolean(),
  })
  .register(schemas, { id: "ProfitLine" });

export const Profit = z
  .object({
    period: MoneyPeriod,
    totals: z.object({
      revenue: z.number().int(),
      expenses: z.number().int(),
      profit: z.number().int(),
      margin: nullableNumber,
      deltaRevenue: nullableNumber,
      deltaExpenses: nullableNumber,
      deltaProfit: nullableNumber,
    }),
    /** Отчёт строками: выручка → себестоимость → группы расходов → прибыль. */
    lines: z.array(ProfitLine),
    /** Таблица по дням, неделям или месяцам. */
    step: z.enum(["day", "week", "month"]),
    rows: z.array(z.object({ key: z.string(), label: z.string(), revenue: z.number().int(), expenses: z.number().int(), profit: z.number().int() })),
    flow: MoneyFlow,
    /** Экономика продаж. */
    unit: z.object({
      leads: z.number().int(),
      buyers: z.number().int(),
      orders: z.number().int(),
      conversion: nullableNumber,
      cpl: nullableNumber,
      cac: nullableNumber,
      roasCash: nullableNumber,
      roasFirst: nullableNumber,
      roasAgreed: nullableNumber,
      adShare: nullableNumber,
      avgFirst: nullableNumber,
      avgAgreed: nullableNumber,
      printPerBook: nullableNumber,
      profitPerBuyer: nullableNumber,
    }),
    /** Расчётные комиссии по формам оплаты и налог с выручки. */
    fees: z.object({ auto: z.number().int(), base: z.number(), byForm: z.array(z.object({ form: z.string(), rate: z.number(), money: z.number().int(), fee: z.number().int(), count: z.number().int() })) }),
    tax: z.object({ rate: z.number(), auto: z.number().int() }),
    noExpenses: z.boolean(),
    /** Можно менять проценты комиссий и налог (finance.manage); формы оплаты — варианты поля сделки. */
    canManage: z.boolean(),
    payForms: z.array(z.string()),
    feeRates: z.record(z.string(), z.number()),
  })
  .register(schemas, { id: "Profit" });

export const FeeRatesBody = z
  .object({ rates: z.array(z.object({ form: z.string().trim().min(1).max(60), rate: z.number().min(0).max(100) })).max(30), taxRate: z.number().min(0).max(50) })
  .strict()
  .register(schemas, { id: "FeeRatesBody" });

export const crmFinanceRoutes = {
  crmFinance: route({ method: "GET", path: "/api/v1/crm/finance", auth: "staff", tag: "crm", summary: "Финансы: проверить, вернуть или зачесть, пришло за период, кто должен", query: PeriodQuery, response: Finance }),
  crmFinanceReview: route({ method: "POST", path: "/api/v1/crm/finance/review", auth: "staff", tag: "crm", summary: "«Проверено»: ручная оплата или возврат сверены с выпиской (руководитель)", body: FinanceReviewBody, response: Done }),
  crmFinanceResolve: route({ method: "POST", path: "/api/v1/crm/finance/issues", auth: "staff", tag: "crm", summary: "Отметить случай «вернуть или зачесть» решённым (с комментарием)", body: FinanceResolveBody, response: Done }),
  crmFinanceUndo: route({ method: "POST", path: "/api/v1/crm/finance/resolutions/{resolutionId}/undo", auth: "staff", tag: "crm", summary: "Отменить решение — случай вернётся в очередь", params: z.object({ resolutionId: uuid }), response: Done }),
  crmExpenses: route({ method: "GET", path: "/api/v1/crm/expenses", auth: "staff", tag: "crm", summary: "Расходы за период: итог, категории, записи", query: PeriodQuery, response: Expenses }),
  crmExpenseAdd: route({ method: "POST", path: "/api/v1/crm/expenses", auth: "staff", tag: "crm", summary: "Внести расход (реклама — в расходы канала)", body: ExpenseBody, response: Done }),
  crmExpenseUpdate: route({ method: "PUT", path: "/api/v1/crm/expenses/{expenseId}", auth: "staff", tag: "crm", summary: "Изменить расход", params: ExpenseParams, body: ExpenseBody, response: Done }),
  crmExpenseRemove: route({ method: "DELETE", path: "/api/v1/crm/expenses/{expenseId}", auth: "staff", tag: "crm", summary: "Удалить расход", params: ExpenseParams, query: ExpenseSourceQuery, response: Done }),
  crmProfit: route({ method: "GET", path: "/api/v1/crm/profit", auth: "staff", tag: "crm", summary: "Прибыль за период: отчёт строками, по времени, экономика продаж", query: PeriodQuery, response: Profit }),
  crmProfitFees: route({ method: "PUT", path: "/api/v1/crm/profit/fees", auth: "staff", tag: "crm", summary: "Проценты комиссий по формам оплаты и налог с выручки", body: FeeRatesBody, response: Done }),
} satisfies Record<string, RouteDef>;
