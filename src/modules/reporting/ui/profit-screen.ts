import { zonedDay } from "@/shared/domain/time";
import { channels } from "@/shared/domain/channels";
import { expenseCategories, expenseCategoryKeys, expenseCategoryLabel, expenseGroupKeys, expenseGroupOf, expenseGroups, BASE_FEE_KEY, feeOf, feeRateOf, taxOf, type ExpenseGroup } from "@/shared/domain/expenses";
import type { FinancePeriod, MoneyRow } from "./finance-screen";

/** Строка расхода: запись «Расходов» или реклама из расходов по каналам (source ads — правится там же, где внесена). */
export interface ExpenseRow {
  id: string;
  source: "expense" | "ads";
  day: string;
  category: string;
  title: string;
  amount: number;
  quantity: number | null;
  note: string;
  channel: string | null;
  createdById: string | null;
  createdAt: Date;
}

/** Счётчики периода для экономики продаж (см. profitCounts). */
export interface ProfitCounts {
  leads: number;
  buyers: number;
  /** Сумма первых оплат новых покупателей. */
  buyersFirstSum: number;
  /** Сумма их сделок по договорённости (цена книги). */
  buyersAgreed: number;
  orders: number;
  books: number;
}

const utc = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const addDays = (day: string, n: number) => new Date(utc(day) + n * 86_400_000).toISOString().slice(0, 10);
const fmt = (day: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("ru-RU", { ...opts, timeZone: "UTC" }).format(new Date(utc(day)));
const sum = <T>(rows: T[], pick: (r: T) => number) => rows.reduce((s, r) => s + pick(r), 0);
/** Изменение к прошлому периоду долей (0,12 = +12%); null — сравнивать не с чем. */
const delta = (cur: number, prev: number) => (prev > 0 ? (cur - prev) / prev : prev < 0 || cur ? null : 0);
const ratio = (a: number, b: number) => (b > 0 ? a / b : null);

export const expenseTitle = (r: Pick<ExpenseRow, "source" | "title" | "channel">) => (r.source === "ads" ? `Реклама: ${r.channel && r.channel in channels ? channels[r.channel as keyof typeof channels] : "канал не указан"}` : r.title);

export type ProfitStep = "day" | "week" | "month";

/** Шаг таблицы по времени: до 31 дня — дни, до 4 месяцев — недели (с понедельника), дальше — месяцы. */
export function profitStep(days: number): ProfitStep {
  return days <= 31 ? "day" : days <= 123 ? "week" : "month";
}

function bucketOf(day: string, step: ProfitStep): string {
  if (step === "day") return day;
  if (step === "month") return `${day.slice(0, 7)}-01`;
  const weekday = (new Date(utc(day)).getUTCDay() + 6) % 7; // 0 — понедельник
  return addDays(day, -weekday);
}

function bucketLabel(key: string, step: ProfitStep, first: string, last: string): string {
  if (step === "day") return fmt(key, { day: "numeric", month: "short" });
  if (step === "month") return fmt(key, { month: "long", year: "numeric" }).replace(/\s*г\.$/, "");
  const from = key < first ? first : key;
  const end = addDays(key, 6);
  const to = end > last ? last : end;
  return from === to ? fmt(from, { day: "numeric", month: "short" }) : `${Number(from.slice(8))}–${fmt(to, { day: "numeric", month: "short" })}`;
}

export interface ProfitLine {
  revenue: number;
  cogs: number;
  marketing: number;
  team: number;
  operating: number;
  expenses: number;
  profit: number;
}
const emptyLine = (): ProfitLine => ({ revenue: 0, cogs: 0, marketing: 0, team: 0, operating: 0, expenses: 0, profit: 0 });

/**
 * «Прибыль» — отчёт о прибыли периода кассовым методом: пришло денег (как в «Финансах», возвраты вычтены) минус расходы
 * по группам. Сравнение — с прошлым периодом той же длины; таблица по дням, неделям или месяцам; экономика продаж:
 * стоимость заявки и покупателя, окупаемость рекламы от денег и от суммы договоров, цена печати книги.
 * Чистая функция: деньги и расходы приходят уже выбранными за период вместе с прошлым.
 */
export function profitScreen(input: {
  period: FinancePeriod;
  money: MoneyRow[];
  expenses: ExpenseRow[];
  counts: ProfitCounts;
  prevCounts: ProfitCounts;
  tz: string;
  /** Форма оплаты сделок (id сделки → форма) и проценты комиссий по формам: комиссия считается с денег сделки сама. */
  forms?: Record<string, string>;
  feeRates?: Record<string, number>;
  /** Налог с выручки, %: считается с денег периода сам и идёт в «Прочие расходы» строкой «Налоги». */
  taxRate?: number;
}) {
  const { period, tz } = input;
  const forms = input.forms ?? {};
  const rates = input.feeRates ?? {};
  const taxRate = input.taxRate ?? 0;
  // Форма платежа важнее формы сделки: предоплата переводом и остаток в рассрочку — комиссия только с остатка.
  const formOf = (m: MoneyRow) => m.payForm || (m.dealId ? (forms[m.dealId] ?? null) : null);
  /** Комиссия банка с движения денег: с возврата — со знаком минус. */
  const fee = (m: MoneyRow) => feeOf(m.kind === "refund" ? -m.amount : m.amount, formOf(m), rates);
  const prevFirst = zonedDay(period.prev.from, tz);
  const prevLast = zonedDay(new Date(period.prev.to.getTime() - 1), tz);
  const signed = (m: MoneyRow) => (m.kind === "refund" ? -m.amount : m.amount);
  const curMoney = input.money.filter((m) => m.at >= period.from && m.at < period.to);
  const prevMoney = input.money.filter((m) => m.at >= period.prev.from && m.at < period.prev.to);
  const curExp = input.expenses.filter((e) => e.day >= period.first && e.day <= period.last);
  const prevExp = input.expenses.filter((e) => e.day >= prevFirst && e.day <= prevLast);

  const line = (money: MoneyRow[], exp: ExpenseRow[]): ProfitLine => {
    const l = emptyLine();
    l.revenue = sum(money, signed);
    for (const e of exp) l[expenseGroupOf(e.category)] += e.amount;
    l.cogs += sum(money, fee);
    l.operating += taxOf(l.revenue, taxRate);
    l.expenses = l.cogs + l.marketing + l.team + l.operating;
    l.profit = l.revenue - l.expenses;
    return l;
  };
  const cur = line(curMoney, curExp);
  const prev = line(prevMoney, prevExp);
  const incoming = sum(curMoney.filter((m) => m.kind !== "refund"), (m) => m.amount);
  const refunds = incoming - cur.revenue;

  // Таблица по времени.
  const step = profitStep(period.days.length);
  const keys = [...new Set(period.days.map((d) => bucketOf(d, step)))];
  const buckets = new Map(keys.map((k) => [k, { key: k, label: bucketLabel(k, step, period.first, period.last), ...emptyLine() }]));
  for (const m of curMoney) {
    const b = buckets.get(bucketOf(zonedDay(m.at, tz), step));
    if (!b) continue;
    b.revenue += signed(m);
    b.cogs += fee(m);
  }
  for (const e of curExp) {
    const b = buckets.get(bucketOf(e.day, step));
    if (b) b[expenseGroupOf(e.category)] += e.amount;
  }
  // Налог периода раскладывается по строкам таблицы пропорционально выручке, остаток округления — в последнюю с выручкой.
  const taxAuto = taxOf(cur.revenue, taxRate);
  const prevTaxAuto = taxOf(prev.revenue, taxRate);
  const list = [...buckets.values()];
  let taxLeft = taxAuto;
  const lastWithRevenue = list.map((b) => b.revenue > 0).lastIndexOf(true);
  const rows = list.map((b, i) => {
    const tax = taxAuto && b.revenue > 0 ? (i === lastWithRevenue ? taxLeft : Math.min(taxLeft, taxOf(b.revenue, taxRate))) : 0;
    taxLeft -= tax;
    const operating = b.operating + tax;
    const expenses = b.cogs + b.marketing + b.team + operating;
    return { ...b, operating, expenses, profit: b.revenue - expenses };
  });

  // Расходы по категориям и группам.
  // Комиссии по формам оплаты — расчётные: в «Расходах» их нет, в отчёте идут в категорию «Комиссии» вместе с внесёнными.
  const feesAuto = sum(curMoney, fee);
  const prevFeesAuto = sum(prevMoney, fee);
  // Общий процент Kaspi «с каждой продажи» берётся и с оплат без формы — они идут строкой «Без формы».
  const NO_FORM = "Без формы";
  const groupOf = (m: MoneyRow) => formOf(m) ?? (rates[BASE_FEE_KEY] ? NO_FORM : null);
  const byForm = [...new Set(curMoney.map(groupOf).filter((f): f is string => !!f))]
    .map((form) => {
      const list = curMoney.filter((m) => groupOf(m) === form);
      return { form, rate: feeRateOf(form === NO_FORM ? null : form, rates), money: sum(list, signed), fee: sum(list, fee), count: list.filter((m) => m.kind !== "refund").length };
    })
    .sort((a, b) => b.money - a.money);
  const tagged = sum(byForm.filter((f) => f.form !== NO_FORM), (f) => f.money);
  const byCategory = expenseCategoryKeys
    .map((key) => {
      const list = curExp.filter((e) => (e.category in expenseCategories ? e.category : "other") === key);
      const auto = key === "fees" ? feesAuto : key === "tax" ? taxAuto : 0;
      const prevAuto = key === "fees" ? prevFeesAuto : key === "tax" ? prevTaxAuto : 0;
      return { key, label: expenseCategoryLabel(key), group: expenseGroupOf(key), value: sum(list, (e) => e.amount) + auto, count: list.length, prev: sum(prevExp.filter((e) => (e.category in expenseCategories ? e.category : "other") === key), (e) => e.amount) + prevAuto };
    })
    .filter((c) => c.value > 0 || c.prev > 0)
    .sort((a, b) => b.value - a.value);
  const byGroup = expenseGroupKeys.map((key: ExpenseGroup) => ({ key, label: expenseGroups[key], value: cur[key], prev: prev[key], share: ratio(cur[key], cur.revenue) }));

  // Экономика продаж.
  const ads = cur.marketing;
  const c = input.counts;
  const print = curExp.filter((e) => e.category === "print");
  const printSum = sum(print, (e) => e.amount);
  const printQty = sum(print, (e) => e.quantity ?? 0);
  const unit = {
    leads: c.leads,
    buyers: c.buyers,
    orders: c.orders,
    /** Конверсия заявок периода в покупателей периода (как в РНП: оплаты ÷ заявки). */
    conversion: ratio(c.buyers, c.leads),
    cpl: ads > 0 && c.leads > 0 ? Math.round(ads / c.leads) : null,
    cac: ads > 0 && c.buyers > 0 ? Math.round(ads / c.buyers) : null,
    /** Окупаемость рекламы: от всех пришедших денег, от первых оплат новых покупателей и от суммы их договоров. */
    roasCash: ratio(cur.revenue, ads),
    roasFirst: ratio(c.buyersFirstSum, ads),
    roasAgreed: ratio(c.buyersAgreed, ads),
    /** Доля рекламы в деньгах периода. */
    adShare: ratio(ads, cur.revenue),
    avgFirst: c.buyers ? Math.round(c.buyersFirstSum / c.buyers) : null,
    avgAgreed: c.buyers ? Math.round(c.buyersAgreed / c.buyers) : null,
    /** Цена печати одной книги: по количеству из записей о печати, если оно указано. */
    printPerBook: printQty > 0 ? Math.round(sum(print.filter((e) => e.quantity), (e) => e.amount) / printQty) : null,
    printSum,
    printQty,
    profitPerBuyer: c.buyers ? Math.round(cur.profit / c.buyers) : null,
  };

  return {
    period,
    step,
    totals: {
      ...cur,
      incoming,
      refunds,
      gross: cur.revenue - cur.cogs,
      margin: ratio(cur.profit, cur.revenue),
      grossMargin: ratio(cur.revenue - cur.cogs, cur.revenue),
      // Прибыль сравниваем, только если в прошлом периоде расходы внесены: иначе его «прибыль» — это выручка.
      delta: { revenue: delta(cur.revenue, prev.revenue), expenses: delta(cur.expenses, prev.expenses), profit: prev.profit > 0 && prev.expenses > 0 ? (cur.profit - prev.profit) / prev.profit : null },
      prev,
      expenseCount: curExp.length,
    },
    rows,
    byCategory,
    byGroup,
    /** Расчётные комиссии: всего и по формам оплаты (деньги сделок с выбранной формой, процент, комиссия). */
    fees: { auto: feesAuto, byForm, tagged, untagged: cur.revenue - tagged, base: rates[BASE_FEE_KEY] ?? 0 },
    /** Расчётный налог с выручки периода. */
    tax: { rate: taxRate, auto: taxAuto },
    unit,
    prevUnit: { leads: input.prevCounts.leads, buyers: input.prevCounts.buyers },
    /** Расходов за период нет вовсе — отчёт показывает только деньги; страница просит внести расходы. */
    noExpenses: curExp.length === 0 && feesAuto === 0 && taxAuto === 0,
  };
}
export type ProfitScreen = ReturnType<typeof profitScreen>;

/** Ведомость расходов периода для страницы «Расходы»: строки, итоги по категориям, сумма. */
export function expensesScreen(input: { period: FinancePeriod; expenses: ExpenseRow[]; staff: { id: string; name: string }[] }) {
  const names = new Map(input.staff.map((s) => [s.id, s.name]));
  const rows = input.expenses
    .filter((e) => e.day >= input.period.first && e.day <= input.period.last)
    .map((e) => ({ ...e, label: expenseCategoryLabel(e.category), name: expenseTitle(e), by: e.createdById ? (names.get(e.createdById) ?? "") : "" }));
  const total = sum(rows, (r) => r.amount);
  const byCategory = expenseCategoryKeys
    .map((key) => {
      const list = rows.filter((r) => (r.category in expenseCategories ? r.category : "other") === key);
      return { key, label: expenseCategoryLabel(key), value: sum(list, (r) => r.amount), count: list.length };
    })
    .filter((c) => c.value > 0)
    .sort((a, b) => b.value - a.value);
  return { rows, total, byCategory };
}
