import { zonedDay, zonedParts } from "@/shared/domain/time";
import { channelOf, channels, toAttribution } from "@/shared/domain/channels";
import { feeOf } from "@/shared/domain/expenses";
import type { FinancePeriod } from "./finance-screen";

export interface LeadDealRow {
  id: string;
  number: number;
  /** Когда клиент обратился: начало переписки или создание сделки — что раньше. */
  createdAt: Date;
  source: string;
  /** Откуда написал: канал первого диалога сделки (whatsapp, site…) или её источник, если переписки нет. */
  entry: string;
  utm: unknown;
  assigneeId: string | null;
  amount: number;
  lostReason: string | null;
  closedAt: Date | null;
  repeat: boolean;
  recipient: string | null;
  occasion: string | null;
  eventDate: string | null;
  stageId: string;
  stage: string;
  stageKind: "open" | "won" | "lost";
  stagePosition: number;
  pipeline: string;
  firstPaidAt: Date | null;
  firstAmount: number;
  paid: number;
}

/** Первая оплата сделки, попавшая в период по дате денег. */
export interface LeadPaymentRow {
  dealId: string;
  assigneeId: string | null;
  /** Сумма сделки по договорённости. */
  amount: number;
  dealCreatedAt: Date;
  at: Date;
  first: number;
}

export interface RegisterRow {
  id: string;
  number: number;
  createdAt: Date;
  soldAt: Date;
  source: string;
  utm: unknown;
  assigneeId: string | null;
  client: string;
  phone: string | null;
  plan: string | null;
  recipient: string | null;
  eventDate: string | null;
  /** Форма оплаты сделки (своё поле): Kaspi Gold, Рассрочка, Red… */
  payForm: string | null;
  price: number;
  dealPaid: number;
  method: string | null;
  stage: string;
  stageKind: "open" | "won" | "lost";
  orderId: string | null;
  orderNumber: number | null;
  orderStatus: string | null;
  city: string | null;
  desiredDate: string | null;
  orderDue: number | null;
  orderPaid: number;
  quantity: number;
  chars: number;
}

const sum = <T>(rows: T[], pick: (r: T) => number) => rows.reduce((s, r) => s + pick(r), 0);
const ratio = (a: number, b: number) => (b > 0 ? a / b : null);
const delta = (cur: number, prev: number) => (prev > 0 ? (cur - prev) / prev : cur ? null : 0);
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/** Нецелевая заявка: закрыта как спам или ошибка. */
export const isJunk = (d: Pick<LeadDealRow, "lostReason">) => /^спам/i.test(d.lostReason ?? "");

const channelKey = (d: { utm: unknown; source: string }) => channelOf(toAttribution(d.utm), d.source);

/** Способ обращения: по нему заявки сравнимы — он известен и у купивших, и у остальных. */
const ENTRY: Record<string, string> = { whatsapp: "WhatsApp", instagram: "Instagram (директ)", telegram: "Telegram", site: "Сайт", email: "E-mail", call: "Звонок", manual: "Заведена вручную", repeat: "Повторная продажа", referral: "Рекомендация", gift: "Сертификат" };
const entryLabel = (key: string) => ENTRY[key] ?? (key || "Не указан");

/** Кому книга — из свободного текста поля сделки («девушке», «Мама», «құрбыма») в несколько групп. */
const RECIPIENTS: [string, RegExp][] = [
  ["Родителям", /мам|пап|отц|отец|родит|ана|әке|ата/],
  ["Мужу или жене", /муж|жен|супруг|күйеу|әйел/],
  ["Парню или девушке", /парн|парен|девуш|любим|жігіт|невест|жених|партн/],
  ["Подруге или другу", /подруг|друг|құрб|дос/],
  ["Детям и внукам", /доч|сын|реб|дет|внук|бала/],
  ["Бабушке или дедушке", /бабуш|дедуш|әже/],
  ["Сестре или брату", /сестр|брат|апа|аға|сіңлі|бауыр/],
];
export function recipientGroup(v: string | null): string | null {
  const t = (v ?? "").toLowerCase().trim();
  if (!t) return null;
  return RECIPIENTS.find(([, re]) => re.test(t))?.[0] ?? "Другому человеку";
}

const LEAD_TIME: [string, number][] = [
  ["меньше недели", 6],
  ["1–2 недели", 13],
  ["2–4 недели", 29],
  ["1–2 месяца", 59],
  ["больше 2 месяцев", Infinity],
];
const PAY_DELAY: [string, number][] = [
  ["в первый час", 1],
  ["за 1–3 часа", 3],
  ["за 3–24 часа", 24],
  ["за 1–3 дня", 72],
  ["за 3–7 дней", 168],
  ["позже недели", Infinity],
];
const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

interface Cut {
  key: string;
  label: string;
  leads: number;
  paid: number;
  conversion: number | null;
  /** Сумма договорённостей оплативших. */
  agreed: number;
  /** Сколько пришло денег по оплатившим. */
  received: number;
}

function cut(deals: LeadDealRow[], keyOf: (d: LeadDealRow) => string | null, labelOf: (key: string) => string = (k) => k): Cut[] {
  const map = new Map<string, LeadDealRow[]>();
  for (const d of deals) {
    const k = keyOf(d);
    if (k === null) continue;
    map.set(k, [...(map.get(k) ?? []), d]);
  }
  return [...map].map(([key, list]) => {
    const paid = list.filter((d) => d.firstPaidAt);
    return { key, label: labelOf(key), leads: list.length, paid: paid.length, conversion: ratio(paid.length, list.length), agreed: sum(paid, (d) => Math.max(d.amount, d.firstAmount)), received: sum(paid, (d) => d.paid) };
  });
}

/**
 * «Статистика лидов» — как сводный отчёт amoCRM: сколько пришло заявок, сколько оплатили и где остальные; динамика по
 * дням с рекламой (заявка, покупатель, доля рекламы в деньгах — как таблицы РНП и маркетинга); разрезы по источникам,
 * менеджерам, этапам, причинам отказа, получателю книги, поводу и сроку до события; через сколько платят.
 * Конверсия когорты — оплатили из заявок периода; в таблице по дням оплата стоит в день денег (как в РНП).
 * visible — чьи сделки видит сотрудник (роль «только свои»); расход на рекламу такой роли не показывается.
 */
export function leadStatsScreen(input: {
  period: FinancePeriod;
  deals: LeadDealRow[];
  payments: LeadPaymentRow[];
  invoices: { at: Date; assigneeId: string | null }[];
  spend: { day: string; amount: number }[];
  staff: { id: string; name: string }[];
  visible: (assigneeId: string | null) => boolean;
  /** Показывать ли расход на рекламу и производные (не роли «только свои»). */
  showSpend: boolean;
  managerId?: string | null;
  tz: string;
  now: Date;
}) {
  const { period, tz } = input;
  const names = new Map(input.staff.map((s) => [s.id, s.name]));
  const mine = (id: string | null) => input.visible(id) && (!input.managerId || id === input.managerId);
  const inCur = (t: Date) => t >= period.from && t < period.to;
  const inPrev = (t: Date) => t >= period.prev.from && t < period.prev.to;
  const all = input.deals.filter((d) => mine(d.assigneeId));
  const deals = all.filter((d) => inCur(d.createdAt));
  const prevDeals = all.filter((d) => inPrev(d.createdAt));
  const target = deals.filter((d) => !isJunk(d));
  const prevTarget = prevDeals.filter((d) => !isJunk(d));
  const paid = target.filter((d) => d.firstPaidAt);
  const prevPaid = prevTarget.filter((d) => d.firstPaidAt);
  const payments = input.payments.filter((p) => mine(p.assigneeId) && inCur(p.at));
  const prevPayments = input.payments.filter((p) => mine(p.assigneeId) && inPrev(p.at));
  const invoices = input.invoices.filter((i) => mine(i.assigneeId) && inCur(i.at));
  const spendByDay = new Map(input.showSpend && !input.managerId ? input.spend.map((s) => [s.day, s.amount]) : []);
  const spendTotal = sum(period.days, (d) => spendByDay.get(d) ?? 0);

  // По дням: заявка — в день создания, оплата — в день денег.
  const dayMap = new Map(period.days.map((day) => [day, { day, leads: 0, junk: 0, invoices: 0, payments: 0, first: 0, agreed: 0, spend: spendByDay.get(day) ?? 0 }]));
  for (const d of deals) {
    const row = dayMap.get(zonedDay(d.createdAt, tz));
    if (!row) continue;
    row.leads++;
    if (isJunk(d)) row.junk++;
  }
  for (const i of invoices) {
    const row = dayMap.get(zonedDay(i.at, tz));
    if (row) row.invoices++;
  }
  for (const p of payments) {
    const row = dayMap.get(zonedDay(p.at, tz));
    if (!row) continue;
    row.payments++;
    row.first += p.first;
    row.agreed += Math.max(p.amount, p.first);
  }
  const daily = [...dayMap.values()].map((r) => ({
    ...r,
    conversion: ratio(r.payments, r.leads),
    avgCheck: r.payments ? Math.round(r.agreed / r.payments) : null,
    cpl: r.spend > 0 && r.leads > 0 ? Math.round(r.spend / r.leads) : null,
    cac: r.spend > 0 && r.payments > 0 ? Math.round(r.spend / r.payments) : null,
    /** Доля рекламы в первых оплатах дня (ДРР от денег) и окупаемость от денег. */
    adShare: r.spend > 0 ? ratio(r.spend, r.first) : null,
    roas: r.spend > 0 ? ratio(r.first, r.spend) : null,
    /** То же от суммы договоров — как в таблице маркетинга (ДРР и ROAS «по договорам»). */
    adShareAgreed: r.spend > 0 ? ratio(r.spend, r.agreed) : null,
    roasAgreed: r.spend > 0 ? ratio(r.agreed, r.spend) : null,
  }));
  const paymentsFirst = sum(payments, (p) => p.first);
  const paymentsAgreed = sum(payments, (p) => Math.max(p.amount, p.first));

  // Через сколько после заявки платят (по оплатившим когорты).
  const delays = paid.map((d) => (d.firstPaidAt!.getTime() - d.createdAt.getTime()) / 3_600_000).filter((h) => h >= 0);
  const payDelay = PAY_DELAY.map(([label, max], i) => {
    const min = i ? PAY_DELAY[i - 1][1] : -1;
    const n = delays.filter((h) => h > min && h <= max).length;
    return { label, count: n, share: ratio(n, delays.length) };
  });

  // Этапы: где сейчас заявки периода (по воронкам и порядку этапов).
  const stages = [...new Map(target.map((d) => [d.stageId, d])).values()]
    .sort((a, b) => a.pipeline.localeCompare(b.pipeline) || (a.stageKind === b.stageKind ? a.stagePosition - b.stagePosition : a.stageKind === "open" ? -1 : b.stageKind === "open" ? 1 : a.stageKind === "won" ? -1 : 1))
    .map((s) => {
      const list = target.filter((d) => d.stageId === s.stageId);
      return { key: s.stageId, label: s.stage, kind: s.stageKind, pipeline: s.pipeline, count: list.length, share: ratio(list.length, target.length), paid: list.filter((d) => d.firstPaidAt).length };
    });

  const lostList = target.filter((d) => d.stageKind === "lost");
  const lost = [...new Map(lostList.map((d) => [d.lostReason || "не указана", 0])).keys()]
    .map((reason) => {
      const n = lostList.filter((d) => (d.lostReason || "не указана") === reason).length;
      return { label: reason, count: n, share: ratio(n, lostList.length) };
    })
    .sort((a, b) => b.count - a.count);

  const bySource = cut(target, (d) => d.entry, entryLabel).sort((a, b) => b.leads - a.leads);
  // Откуда покупатели: рекламный канал известен там, где есть метки или его выбрал менеджер, — обычно только у купивших.
  const buyersBySource = cut(paid, (d) => channelKey(d), (k) => channels[k as keyof typeof channels] ?? k)
    .map((c) => ({ key: c.key, label: c.label, buyers: c.paid, agreed: c.agreed, received: c.received, share: ratio(c.paid, paid.length) }))
    .sort((a, b) => b.buyers - a.buyers);
  const byManager = cut(target, (d) => d.assigneeId ?? "", (k) => (k ? (names.get(k) ?? "Сотрудник") : "Без ответственного")).sort((a, b) => b.leads - a.leads);
  const byRecipient = cut(target, (d) => recipientGroup(d.recipient)).sort((a, b) => b.leads - a.leads);
  const byOccasion = cut(target, (d) => d.occasion?.trim() || null).sort((a, b) => b.leads - a.leads);
  const leadTime = cut(target, (d) => {
    if (!d.eventDate || !/^\d{4}-\d{2}-\d{2}$/.test(d.eventDate)) return null;
    const days = Math.round((Date.parse(`${d.eventDate}T00:00:00Z`) - Date.parse(`${zonedDay(d.createdAt, tz)}T00:00:00Z`)) / 86_400_000);
    if (!Number.isFinite(days) || days < 0) return null;
    return LEAD_TIME.find(([, max]) => days <= max)![0];
  });
  const byLeadTime = LEAD_TIME.map(([label]) => leadTime.find((c) => c.key === label) ?? { key: label, label, leads: 0, paid: 0, conversion: null, agreed: 0, received: 0 }).filter((c) => c.leads > 0);
  const byWeekday = WEEKDAYS.map((label, i) => {
    const list = target.filter((d) => zonedParts(d.createdAt, tz).weekday - 1 === i);
    return { label, leads: list.length, paid: list.filter((d) => d.firstPaidAt).length, conversion: ratio(list.filter((d) => d.firstPaidAt).length, list.length) };
  });
  const byHour = [
    ["00–09", 0, 8],
    ["09–13", 9, 12],
    ["13–18", 13, 17],
    ["18–22", 18, 21],
    ["22–24", 22, 23],
  ].map(([label, a, b]) => {
    const list = target.filter((d) => {
      const h = Math.floor(zonedParts(d.createdAt, tz).minutes / 60);
      return h >= (a as number) && h <= (b as number);
    });
    const n = list.filter((d) => d.firstPaidAt).length;
    return { label: String(label), leads: list.length, paid: n, conversion: ratio(n, list.length) };
  });

  const recipientKnown = target.filter((d) => recipientGroup(d.recipient)).length;
  return {
    period,
    totals: {
      leads: target.length,
      junk: deals.length - target.length,
      paid: paid.length,
      conversion: ratio(paid.length, target.length),
      open: target.filter((d) => d.stageKind === "open" && !d.firstPaidAt).length,
      lost: lostList.length,
      repeat: target.filter((d) => d.repeat).length,
      avgCheck: paid.length ? Math.round(sum(paid, (d) => Math.max(d.amount, d.firstAmount)) / paid.length) : null,
      /** Сколько часов от заявки до первой оплаты — медиана. */
      medianHours: median(delays),
      payments: payments.length,
      paymentsFirst,
      paymentsAgreed,
      invoices: invoices.length,
      spend: spendTotal,
      cpl: spendTotal > 0 && target.length > 0 ? Math.round(spendTotal / target.length) : null,
      cac: spendTotal > 0 && payments.length > 0 ? Math.round(spendTotal / payments.length) : null,
      roas: spendTotal > 0 ? ratio(paymentsFirst, spendTotal) : null,
      roasAgreed: spendTotal > 0 ? ratio(paymentsAgreed, spendTotal) : null,
      adShare: spendTotal > 0 ? ratio(spendTotal, paymentsFirst) : null,
      adShareAgreed: spendTotal > 0 ? ratio(spendTotal, paymentsAgreed) : null,
      delta: {
        leads: delta(target.length, prevTarget.length),
        paid: delta(payments.length, prevPayments.length),
        conversion: (() => {
          const a = ratio(paid.length, target.length);
          const b = ratio(prevPaid.length, prevTarget.length);
          return a !== null && b !== null && b > 0 ? (a - b) / b : null;
        })(),
      },
      prev: { leads: prevTarget.length, payments: prevPayments.length, conversion: ratio(prevPaid.length, prevTarget.length) },
    },
    daily,
    stages,
    lost,
    bySource,
    buyersBySource,
    byManager,
    byRecipient,
    byOccasion,
    byLeadTime,
    byWeekday,
    byHour,
    payDelay,
    recipientKnown,
  };
}
export type LeadStatsScreen = ReturnType<typeof leadStatsScreen>;

const ORDER_STATUS: Record<string, string> = { pending_payment: "Заказ ждёт оплаты", paid: "Заказ оплачен", in_production: "В печати", shipped: "В пути", delivered: "Доставлен" };
const PLAN: Record<string, string> = { digital: "Электронная", hardcover: "Твёрдая обложка", premium: "Премиум" };
const METHOD: Record<string, string> = { kaspi: "Kaspi", cloudpayments: "Карта", manual: "Перевод" };

/**
 * «Реестр продаж» — ведомость покупателей периода, как лист продаж в таблице: дата продажи, клиент, город, источник,
 * менеджер, цена, оплачено, остаток, состояние. Телефон — по правам сотрудника (contact).
 */
export function salesRegisterScreen(input: { rows: RegisterRow[]; staff: { id: string; name: string }[]; visible: (assigneeId: string | null) => boolean; contact: (phone: string | null) => string; tz: string; feeRates?: Record<string, number> }) {
  const rates = input.feeRates ?? {};
  const names = new Map(input.staff.map((s) => [s.id, s.name]));
  const rows = input.rows
    .filter((r) => input.visible(r.assigneeId))
    .map((r) => {
      const paid = r.dealPaid + (r.orderId ? r.orderPaid : 0);
      // Заказ оформлен — остаток по заказу; иначе — цена договорённости минус оплаченное по сделке.
      const rest = r.orderId ? Math.max((r.orderDue ?? 0) - r.orderPaid, 0) : Math.max(r.price - r.dealPaid, 0);
      const state = r.orderId
        ? (ORDER_STATUS[r.orderStatus ?? ""] ?? "Заказ оформлен")
        : r.stageKind === "lost"
          ? "Отказ"
          : r.chars >= 50_000
            ? "Книга почти готова"
            : r.chars > 0
              ? "Книга пишется"
              : "Книга не начата";
      return {
        id: r.id,
        number: r.number,
        day: zonedDay(r.soldAt, input.tz),
        createdDay: zonedDay(r.createdAt, input.tz),
        client: r.client,
        phone: input.contact(r.phone),
        city: r.city ?? "",
        channel: channels[channelKey(r)],
        manager: r.assigneeId ? (names.get(r.assigneeId) ?? "Сотрудник") : "Без ответственного",
        plan: r.plan ? (PLAN[r.plan] ?? r.plan) : "",
        quantity: r.quantity,
        recipient: r.recipient ?? "",
        eventDate: r.eventDate ?? r.desiredDate ?? "",
        price: Math.max(r.price, paid),
        paid,
        rest,
        state,
        stage: r.stage,
        method: r.method ? (METHOD[r.method] ?? r.method) : "",
        payForm: r.payForm ?? "",
        /** Комиссия банка с оплаченного и сколько остаётся после неё. */
        fee: feeOf(paid, r.payForm, rates),
        net: paid - feeOf(paid, r.payForm, rates),
        orderNumber: r.orderNumber,
        orderId: r.orderId,
      };
    });
  return {
    rows,
    totals: { count: rows.length, price: sum(rows, (r) => r.price), paid: sum(rows, (r) => r.paid), rest: sum(rows, (r) => r.rest), settled: rows.filter((r) => r.rest === 0).length, fee: sum(rows, (r) => r.fee), net: sum(rows, (r) => r.net) },
  };
}
export type SalesRegisterScreen = ReturnType<typeof salesRegisterScreen>;
