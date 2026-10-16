import { formatPrice } from "@/config/site";
import { fromZonedTime, zonedDay } from "@/shared/domain/time";
import { staffLabel } from "@/shared/domain/staff";

// ─── данные (их загружает infrastructure/Finance.ts) ─────────────────────────

export type MoneyMethod = "kaspi" | "card" | "manual";
export type MoneySource = "deal" | "order" | "gift";

/** Одно движение денег. Сумма всегда больше нуля; возврат клиенту — kind refund (в итогах со знаком минус). */
export interface MoneyRow {
  id: string;
  source: MoneySource;
  /** prepayment, payment, refund — платёж сделки; order — запись журнала заказа; legacy — заказ оплачен без записи в журнале; gift — сертификат. */
  kind: "prepayment" | "payment" | "refund" | "order" | "legacy" | "gift";
  method: MoneyMethod;
  amount: number;
  at: Date;
  dealId: string | null;
  dealNumber: number | null;
  orderId: string | null;
  orderNumber: number | null;
  giftNumber: number | null;
  client: string;
  /** Ответственный сделки (у заказа без сделки — ответственный заказа). */
  managerId: string | null;
  /** Кто записал деньги (ручной платёж); онлайн и без записи — null. */
  acceptedById: string | null;
  /** Чек: crm_receipts.id у платежа сделки, id записи журнала у оплаты заказа. */
  receiptId: string | null;
  externalRef: string | null;
  invoiceNumber: number | null;
  reviewedAt: Date | null;
}

export interface FinanceDealRow {
  id: string;
  number: number;
  client: string;
  managerId: string | null;
  /** Договорённость — цена книги в сделке. */
  agreed: number;
  /** Оплачено: платежи минус возвраты. */
  paid: number;
  /** Сколько платежей (без возвратов). */
  payments: number;
  plan: string | null;
  source: string;
  stageKind: "open" | "won" | "lost";
  milestone: string | null;
  hasClient: boolean;
  eventDate: string | null;
  /** Самая продвинутая книга клиента; null — книги нет (или клиент не заведён). */
  book: { answered: number; total: number } | null;
  /** Открытый счёт из чата. */
  invoice: { number: number; amount: number; expiresAt: Date; claimedAt: Date | null } | null;
  /** Заказ сделки и сколько он учёл предоплатой. */
  order: { id: string; number: number; prepaid: number } | null;
}

export interface FinanceOrderRow {
  id: string;
  number: number;
  client: string;
  managerId: string | null;
  dealId: string | null;
  dealNumber: number | null;
  status: string;
  postpay: boolean;
  /** К оплате (предоплата сделки уже вычтена). */
  amount: number;
  /** Внесено по договорённости до заказа. */
  prepaid: number;
  /** Записано в журнал денег заказа. */
  received: number;
  paidAt: Date | null;
  desiredDate: string | null;
  createdAt: Date;
  claimedAt: Date | null;
}

export interface UnrecordedRow {
  id: string;
  target: "deal_invoice" | "order" | "gift";
  externalId: string;
  /** Сумма оплаты не совпала со счётом — платёж не засчитан (amount — сколько заплатили). */
  mismatch: boolean;
  amount: number;
  at: Date;
  invoiceNumber: number | null;
  dealId: string | null;
  dealNumber: number | null;
  orderId: string | null;
  orderNumber: number | null;
  giftNumber: number | null;
  managerId: string | null;
  client: string;
}

export interface ReviewRow {
  kind: "deal" | "order";
  id: string;
  paymentKind: string;
  amount: number;
  at: Date;
  acceptedById: string | null;
  dealId: string | null;
  dealNumber: number | null;
  orderId: string | null;
  orderNumber: number | null;
  managerId: string | null;
  client: string;
  receiptId: string | null;
  note: string;
  invoiceNumber: number | null;
}

/** Сколько дней показываем деньги к возврату, которые по данным не закрыть (отменённый заказ, оплата Kaspi вне учёта). */
export const REFUND_WINDOW_DAYS = 90;

// ─── период ──────────────────────────────────────────────────────────────────

export const FINANCE_PRESETS = ["today", "7d", "month", "prev", "custom"] as const;
export type FinancePreset = (typeof FINANCE_PRESETS)[number];

/** Самый длинный свой период, дней. */
export const MAX_PERIOD_DAYS = 366;

export interface FinancePeriod {
  preset: FinancePreset;
  /** Первый и последний день (YYYY-MM-DD по времени магазина), включительно. */
  first: string;
  last: string;
  /** Границы [from, to): полночь магазина первого дня и следующего за последним. */
  from: Date;
  to: Date;
  /** Прошлый период для сравнения: [from, to). */
  prev: { from: Date; to: Date };
  days: string[];
  label: string;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const utc = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const addDays = (day: string, n: number) => new Date(utc(day) + n * 86_400_000).toISOString().slice(0, 10);
const daysFrom = (a: string, b: string) => Math.round((utc(b) - utc(a)) / 86_400_000);
const validDay = (v: string | undefined): v is string => !!v && DAY.test(v) && addDays(v, 0) === v;
/** Полночь местного дня магазина. */
const midnight = (day: string, tz: string) => fromZonedTime(`${day}T00:00:00`, tz);

const fmtDay = (day: string, withYear: boolean) => new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" }).format(new Date(utc(day)));
const monthName = (day: string) => new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(utc(day))).replace(/\s*г\.$/, "");

function periodLabel(preset: FinancePreset, first: string, last: string) {
  if (preset === "prev") return monthName(first);
  if (first === last) return fmtDay(first, true);
  if (first.slice(0, 7) === last.slice(0, 7)) return `${Number(first.slice(8))}–${fmtDay(last, true)}`;
  if (first.slice(0, 4) === last.slice(0, 4)) return `${fmtDay(first, false)} – ${fmtDay(last, true)}`;
  return `${fmtDay(first, true)} – ${fmtDay(last, true)}`;
}

/**
 * Период «Финансов» по времени магазина: сегодня, 7 дней, текущий месяц (по сегодня), прошлый месяц, свои даты
 * (не больше года, не из будущего). Неверный ввод — текущий месяц. Прошлый период: столько же дней перед ним,
 * для месяца — те же числа прошлого месяца.
 */
export function financePeriod(input: { preset?: string; from?: string; to?: string; now: Date; tz: string }): FinancePeriod {
  const today = zonedDay(input.now, input.tz);
  const monthStart = `${today.slice(0, 8)}01`;
  const prevMonthStart = `${addDays(monthStart, -1).slice(0, 8)}01`;
  let preset: FinancePreset = (FINANCE_PRESETS as readonly string[]).includes(input.preset ?? "") ? (input.preset as FinancePreset) : "month";
  let first = monthStart;
  let last = today;
  let prevFirst = prevMonthStart;
  let prevLast = addDays(monthStart, -1);
  if (preset === "custom") {
    const a = input.from;
    const b = input.to;
    if (validDay(a) && validDay(b) && a <= b && a <= today && daysFrom(a, b) < MAX_PERIOD_DAYS) {
      first = a;
      last = b > today ? today : b;
    } else preset = "month";
  }
  if (preset === "today") first = last = today;
  if (preset === "7d") first = addDays(today, -6);
  if (preset === "prev") {
    first = prevMonthStart;
    last = addDays(monthStart, -1);
    prevFirst = `${addDays(prevMonthStart, -1).slice(0, 8)}01`;
    prevLast = addDays(prevMonthStart, -1);
  } else if (preset === "month") {
    // Те же числа прошлого месяца (1–17 сентября против 1–17 октября), но не дальше его конца.
    const sameDay = addDays(prevMonthStart, daysFrom(monthStart, today));
    prevLast = sameDay < monthStart ? sameDay : addDays(monthStart, -1);
  } else {
    prevLast = addDays(first, -1);
    prevFirst = addDays(first, -(daysFrom(first, last) + 1));
  }
  const days = Array.from({ length: daysFrom(first, last) + 1 }, (_, i) => addDays(first, i));
  return {
    preset,
    first,
    last,
    from: midnight(first, input.tz),
    to: midnight(addDays(last, 1), input.tz),
    prev: { from: midnight(prevFirst, input.tz), to: midnight(addDays(prevLast, 1), input.tz) },
    days,
    label: periodLabel(preset, first, last),
  };
}

// ─── подписи ─────────────────────────────────────────────────────────────────

export const METHOD_LABELS: Record<MoneyMethod, string> = { kaspi: "Kaspi", card: "Карта", manual: "Перевод" };
const KIND_LABELS: Record<MoneyRow["kind"], string> = {
  prepayment: "Предоплата по сделке",
  payment: "Платёж по сделке",
  refund: "Возврат клиенту",
  order: "Оплата заказа",
  legacy: "Заказ оплачен (без записи оплаты)",
  gift: "Подарочный сертификат",
};
const BUCKETS = [
  { key: "kaspi", label: "Kaspi" },
  { key: "card", label: "Карта (CloudPayments)" },
  { key: "manual", label: "Перевод и вручную" },
  { key: "gift", label: "Сертификаты" },
] as const;
const SOURCES = [
  { key: "deal", label: "Сделки: предоплаты и доплаты" },
  { key: "order", label: "Заказы на сайте" },
  { key: "gift", label: "Подарочные сертификаты" },
] as const;

/** Готовность книги клиента: готова (или заказ уже оформлен), пишется, не начата. */
export type BookGroup = "ready" | "progress" | "none";
export const BOOK_GROUP_LABELS: Record<BookGroup, string> = { ready: "Книга готова или заказ оформлен", progress: "Книга в работе", none: "Книга не начата" };

/** «Книга почти готова» — столько ответов (совпадает с вехой продаж book_ready, BOOK_READY_ANSWERS). */
export const FINANCE_BOOK_READY = 25;

function bookOf(d: FinanceDealRow, ready: number): { group: BookGroup; label: string } {
  const answered = d.book?.answered ?? 0;
  const total = d.book?.total ?? 0;
  if (answered >= ready || d.milestone === "book_ready") return { group: "ready", label: d.book ? `готова · ${answered} отв.` : "готова (по этапу)" };
  if (d.book || d.milestone === "book_started" || d.milestone === "book_half") return { group: "progress", label: d.book ? `пишется · ${answered} из ${total} отв.` : "пишется (по этапу)" };
  return { group: "none", label: d.hasClient ? "не начата" : "не начата · клиент не заведён" };
}

const ORDER_STATUS: Record<string, string> = { pending_payment: "ждёт оплаты", paid: "оплачен", in_production: "в печати", shipped: "отправлен", delivered: "доставлен", cancelled: "отменён" };

// ─── модель экрана ───────────────────────────────────────────────────────────

const GROUP_ORDER: Record<BookGroup, number> = { ready: 0, progress: 1, none: 2 };

/**
 * Модель экрана «Финансы» (admin/finance): итоги за период, «пришло» по дням, способам, источникам и менеджерам,
 * последние поступления; «ожидается» — остатки договорённостей по готовности книги, заказы на оплате и постоплаты;
 * переплаты и деньги, которые нужно вернуть; ручные подтверждения без проверки. Только раскладка загруженных данных.
 *
 * Деньги: пришло = поступления − возвраты (каждое движение — одна строка, см. financeMoney). Онлайн — Kaspi и карта.
 * Ожидается: остаток договорённости по сделкам без заказа + «к оплате» − записано по заказам, ждущим оплаты; постоплаты —
 * отдельно. Открытый счёт из чата — часть остатка своей сделки, к итогу не прибавляется.
 * Менеджер — ответственный сделки (у заказа без сделки — заказа), как в аналитике; кто записал деньги — в колонке «Принял».
 * visible — видимость записи сотруднику (роль «только свои» видит свои и ничьи).
 */
export function financeScreen(input: {
  period: FinancePeriod;
  money: MoneyRow[];
  deals: FinanceDealRow[];
  orders: FinanceOrderRow[];
  unrecorded: UnrecordedRow[];
  review: ReviewRow[];
  staff: { id: string; name: string; email: string }[];
  visible?: (managerId: string | null) => boolean;
  tz: string;
  now: Date;
  readyAnswers?: number;
}) {
  const { period, tz } = input;
  const visible = input.visible ?? (() => true);
  const ready = input.readyAnswers ?? FINANCE_BOOK_READY;
  const names = new Map(input.staff.map((s) => [s.id, staffLabel(s)]));
  const who = (id: string | null) => (id ? (names.get(id) ?? "—") : "—");
  const shortDate = (d: Date, withTime = false) =>
    new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}), timeZone: tz }).format(d).replace(".", "");
  const dayLabel = (day: string) => new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(utc(day))).replace(".", "");
  const today = zonedDay(input.now, tz);

  const inRange = (d: Date, r: { from: Date; to: Date }) => d >= r.from && d < r.to;
  const rows = input.money.filter((m) => visible(m.managerId));
  const cur = rows.filter((m) => inRange(m.at, period)).sort((a, b) => b.at.getTime() - a.at.getTime());
  const prev = rows.filter((m) => inRange(m.at, period.prev));
  const sign = (m: MoneyRow) => (m.kind === "refund" ? -m.amount : m.amount);
  const sum = (list: MoneyRow[]) => list.reduce((s, m) => s + m.amount, 0);
  const incomingRows = cur.filter((m) => m.kind !== "refund");
  const refundRows = cur.filter((m) => m.kind === "refund");
  const incoming = sum(incomingRows);
  const refunds = sum(refundRows);
  const online = sum(incomingRows.filter((m) => m.method !== "manual"));
  const prevNet = prev.reduce((s, m) => s + sign(m), 0);
  const net = incoming - refunds;

  // По дням: поступления и возвраты — по дню магазина.
  const byDayMap = new Map(period.days.map((d) => [d, { date: d, incoming: 0, refunds: 0, count: 0 }]));
  for (const m of cur) {
    const day = byDayMap.get(zonedDay(m.at, tz));
    if (!day) continue;
    if (m.kind === "refund") day.refunds += m.amount;
    else {
      day.incoming += m.amount;
      day.count++;
    }
  }

  const bucket = (m: MoneyRow) => (m.source === "gift" ? "gift" : m.method);
  const byMethod = BUCKETS.map((b) => {
    const list = incomingRows.filter((m) => bucket(m) === b.key);
    return { key: b.key, label: b.label, value: sum(list), count: list.length };
  });
  const bySource = SOURCES.map((s) => {
    const list = incomingRows.filter((m) => m.source === s.key);
    return { key: s.key, label: s.label, value: sum(list), count: list.length };
  });
  const managers = new Map<string, { id: string; label: string; value: number; count: number }>();
  for (const m of cur) {
    const id = m.managerId ?? (m.source === "gift" ? "-gift" : "-none");
    const label = m.managerId ? who(m.managerId) : m.source === "gift" ? "Сайт: сертификаты" : "Без ответственного";
    const cell = managers.get(id) ?? { id, label, value: 0, count: 0 };
    cell.value += sign(m);
    if (m.kind !== "refund") cell.count++;
    managers.set(id, cell);
  }

  const dealRef = (id: string | null, n: number | null) => (id && n !== null ? { label: `Сделка №${n}`, href: `/admin/deals/${id}` } : null);
  const orderRef = (id: string | null, n: number | null) => (id && n !== null ? { label: `Заказ №${n}`, href: `/admin/orders/${id}` } : null);
  const moneyView = (m: MoneyRow) => ({
    key: `${m.kind}:${m.id}`,
    dateLabel: shortDate(m.at, m.kind !== "legacy"),
    amount: sign(m),
    refund: m.kind === "refund",
    method: m.source === "gift" && m.method === "manual" ? "Вручную" : m.kind === "legacy" && m.method === "manual" ? "Вручную, без чека" : METHOD_LABELS[m.method],
    what: KIND_LABELS[m.kind] + (m.invoiceNumber ? ` · счёт P${m.invoiceNumber}` : ""),
    refs: [m.source === "gift" && m.giftNumber !== null ? { label: `Сертификат №${m.giftNumber}`, href: "/admin/gifts" } : null, dealRef(m.dealId, m.dealNumber), orderRef(m.orderId, m.orderNumber)].filter((r): r is { label: string; href: string } => !!r),
    client: m.client,
    manager: m.managerId ? who(m.managerId) : "—",
    acceptedBy: m.acceptedById ? who(m.acceptedById) : m.method !== "manual" ? "онлайн" : "—",
    receiptHref: m.receiptId ? (m.source === "deal" ? `/api/admin/receipts/${m.receiptId}` : `/api/admin/order-payments/${m.receiptId}/receipt`) : null,
    operation: m.method !== "manual" && m.externalRef ? m.externalRef : null,
    /** Ручная запись денег: проверил ли руководитель (возвраты и записи без журнала не проверяются). */
    check: m.method === "manual" && (m.kind === "prepayment" || m.kind === "payment" || m.kind === "order") ? (m.reviewedAt ? ("reviewed" as const) : ("pending" as const)) : null,
  });

  // ─── ожидается и нужен возврат ─────────────────────────────────────────────
  type ExpectedKind = "deal" | "order" | "postpay";
  const expected: {
    key: string;
    kind: ExpectedKind;
    href: string;
    ref: string;
    client: string;
    manager: string;
    total: number;
    paid: number;
    left: number;
    group: BookGroup;
    bookLabel: string;
    dueLabel: string | null;
    overdue: boolean;
    invoice: string | null;
    note: string | null;
  }[] = [];
  type IssueKind = "deal_overpaid" | "deal_after_order" | "deal_lost" | "order_overpaid" | "order_cancelled" | "unrecorded";
  const issues: { key: string; kind: IssueKind; title: string; href: string | null; ref: string; client: string; manager: string; amount: number; note: string; dateLabel: string | null }[] = [];
  let invoices = { count: 0, sum: 0 };

  for (const d of input.deals) {
    if (!visible(d.managerId)) continue;
    const href = `/admin/deals/${d.id}`;
    const ref = `Сделка №${d.number}`;
    const manager = who(d.managerId);
    if (d.order) {
      // Сделка с заказом: всё, что внесено сверх учтённой в заказе предоплаты, — к возврату или зачёту.
      const extra = d.paid - d.order.prepaid;
      if (extra > 0) issues.push({ key: `da:${d.id}`, kind: "deal_after_order", title: `Внесено по сделке больше, чем учтено в заказе №${d.order.number}`, href, ref, client: d.client, manager, amount: extra, note: `по сделке ${formatPrice(d.paid)}, в заказе учтено ${formatPrice(d.order.prepaid)}`, dateLabel: null });
      continue;
    }
    if (d.stageKind === "lost") {
      if (d.paid > 0) issues.push({ key: `dl:${d.id}`, kind: "deal_lost", title: "Сделка в отказе — деньги клиента у нас", href, ref, client: d.client, manager, amount: d.paid, note: "верните деньги (возврат в сделке) или верните сделку в работу", dateLabel: null });
      continue;
    }
    if (d.agreed > 0 && d.paid > d.agreed) issues.push({ key: `do:${d.id}`, kind: "deal_overpaid", title: "Оплачено больше договорённости", href, ref, client: d.client, manager, amount: d.paid - d.agreed, note: `договорённость ${formatPrice(d.agreed)}, оплачено ${formatPrice(d.paid)}`, dateLabel: null });
    // Договорённость: сделка «вручную», с тарифом договорённости или с деньгами; «успех» без денег — уже выручка, не ожидание.
    const agreement = d.agreed > 0 && (d.source === "manual" || d.plan !== null || d.payments > 0);
    const live = d.stageKind === "open" || (d.stageKind === "won" && d.payments > 0);
    const left = d.agreed - d.paid;
    if (!agreement || !live || left <= 0) continue;
    const book = bookOf(d, ready);
    if (d.invoice) invoices = { count: invoices.count + 1, sum: invoices.sum + d.invoice.amount };
    expected.push({
      key: `d:${d.id}`,
      kind: "deal",
      href,
      ref,
      client: d.client,
      manager,
      total: d.agreed,
      paid: d.paid,
      left,
      group: book.group,
      bookLabel: book.label,
      dueLabel: d.eventDate ? `событие ${dayLabel(d.eventDate)}` : null,
      overdue: !!d.eventDate && d.eventDate < today,
      invoice: d.invoice
        ? `счёт P${d.invoice.number} · ${formatPrice(d.invoice.amount)} · ${d.invoice.expiresAt < input.now ? "срок истёк" : `до ${shortDate(d.invoice.expiresAt)}`}${d.invoice.claimedAt ? " · клиент сообщил об оплате" : ""}`
        : null,
      note: d.stageKind === "won" ? "сделка в «успехе», заказа нет" : null,
    });
  }

  for (const o of input.orders) {
    if (!visible(o.managerId)) continue;
    const href = `/admin/orders/${o.id}`;
    const ref = `Заказ №${o.number}`;
    const manager = who(o.managerId);
    if (o.status === "cancelled") {
      if (o.received > 0) issues.push({ key: `oc:${o.id}`, kind: "order_cancelled", title: "Заказ отменён — деньги получены", href, ref, client: o.client, manager, amount: o.received, note: "нужен возврат клиенту (или зачёт в новый заказ)", dateLabel: null });
      continue;
    }
    if (o.received > o.amount) issues.push({ key: `oo:${o.id}`, kind: "order_overpaid", title: "Переплата по заказу", href, ref, client: o.client, manager, amount: o.received - o.amount, note: `к оплате ${formatPrice(o.amount)}, получено ${formatPrice(o.received)}`, dateLabel: null });
    const left = o.amount - o.received;
    const postpay = o.postpay && !o.paidAt && o.status !== "pending_payment";
    if (left <= 0 || !(o.status === "pending_payment" || postpay)) continue;
    expected.push({
      key: `o:${o.id}`,
      kind: postpay ? "postpay" : "order",
      href,
      ref,
      client: o.client,
      manager,
      total: o.prepaid + o.amount,
      paid: o.prepaid + o.received,
      left,
      group: "ready",
      bookLabel: postpay ? `постоплата · ${ORDER_STATUS[o.status] ?? o.status}` : "заказ ждёт оплаты",
      dueLabel: o.desiredDate ? `к ${dayLabel(o.desiredDate)}` : null,
      overdue: !!o.desiredDate && o.desiredDate < today,
      invoice: null,
      note: [o.dealNumber !== null ? `сделка №${o.dealNumber}` : null, o.status === "pending_payment" ? `оформлен ${shortDate(o.createdAt)}` : null, o.claimedAt && o.status === "pending_payment" ? "клиент сообщил об оплате" : null].filter(Boolean).join(" · ") || null,
    });
  }

  for (const u of input.unrecorded) {
    if (!visible(u.managerId)) continue;
    const what = u.target === "deal_invoice" ? `счёт P${u.invoiceNumber ?? "?"}${u.dealNumber !== null ? `, сделка №${u.dealNumber}` : ""}` : u.target === "order" ? `заказ №${u.orderNumber ?? "?"}` : `сертификат №${u.giftNumber ?? "?"}`;
    const href = u.dealId ? `/admin/deals/${u.dealId}` : u.orderId ? `/admin/orders/${u.orderId}` : u.target === "gift" ? "/admin/gifts" : null;
    issues.push({
      key: `un:${u.id}`,
      kind: "unrecorded",
      title: u.mismatch ? "Kaspi: сумма оплаты не совпала со счётом" : "Оплата Kaspi не записана в учёт",
      href,
      ref: what,
      client: u.client,
      manager: who(u.managerId),
      amount: u.amount,
      note: `операция ${u.externalId}: ${u.mismatch ? "платёж не засчитан" : "по закрытому счёту или после заказа"} — нужен возврат или зачёт`,
      dateLabel: shortDate(u.at, true),
    });
  }

  expected.sort((a, b) => GROUP_ORDER[a.group] - GROUP_ORDER[b.group] || b.left - a.left);
  const sumLeft = (list: typeof expected) => list.reduce((s, e) => s + e.left, 0);
  const groups = (["ready", "progress", "none"] as const).map((g) => {
    const list = expected.filter((e) => e.group === g);
    return { key: g, label: BOOK_GROUP_LABELS[g], value: sumLeft(list), count: list.length };
  });
  const dueNow = expected.filter((e) => e.kind !== "postpay");
  const postpays = expected.filter((e) => e.kind === "postpay");
  const issuesTotal = issues.reduce((s, i) => s + i.amount, 0);

  const review = input.review
    .filter((r) => visible(r.managerId))
    .map((r) => ({
      key: `${r.kind}:${r.id}`,
      kind: r.kind,
      id: r.id,
      amount: r.amount,
      dateLabel: shortDate(r.at, true),
      what: r.kind === "order" ? "Оплата заказа" : r.paymentKind === "prepayment" ? "Предоплата" : "Платёж",
      refs: [dealRef(r.dealId, r.dealNumber), orderRef(r.orderId, r.orderNumber)].filter((x): x is { label: string; href: string } => !!x),
      client: r.client,
      manager: who(r.managerId),
      acceptedBy: who(r.acceptedById),
      receiptHref: r.receiptId ? (r.kind === "deal" ? `/api/admin/receipts/${r.receiptId}` : `/api/admin/order-payments/${r.receiptId}/receipt`) : null,
      invoice: r.invoiceNumber ? `счёт P${r.invoiceNumber}` : null,
      note: r.note,
    }));

  return {
    totals: {
      net,
      incoming,
      refunds,
      online,
      manual: incoming - online,
      count: incomingRows.length,
      refundCount: refundRows.length,
      prevNet,
      delta: prevNet ? (net - prevNet) / prevNet : net ? null : 0,
      /** Ожидается доплат: остатки договорённостей и заказы на оплате (без постоплат). */
      expected: sumLeft(dueNow),
      expectedReady: sumLeft(dueNow.filter((e) => e.group === "ready")),
      postpay: sumLeft(postpays),
      postpayCount: postpays.length,
      expectedAll: sumLeft(expected),
      expectedAllReady: sumLeft(expected.filter((e) => e.group === "ready")),
      overpaid: issuesTotal,
      overpaidCount: issues.length,
      review: { count: review.length, sum: review.reduce((s, r) => s + r.amount, 0) },
    },
    byDay: [...byDayMap.values()],
    byMethod,
    bySource,
    byManager: [...managers.values()].sort((a, b) => b.value - a.value),
    recent: cur.map(moneyView),
    refunds: refundRows.map(moneyView),
    expected: { rows: expected, groups, invoices },
    issues,
    review,
  };
}

export type FinanceScreen = ReturnType<typeof financeScreen>;
