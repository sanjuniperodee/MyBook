import { describe, expect, it } from "vitest";
import { financePeriod, financeScreen, type FinanceDealRow, type FinanceOrderRow, type MoneyRow, type ReviewRow } from "@/modules/reporting/ui/finance-screen";

/** Модель экрана «Финансы»: период по времени магазина, нетто и разбивки, ожидаемые доплаты, переплаты, «Проверить». */
const TZ = "Asia/Almaty"; // UTC+5
// 17 октября 2026, 01:30 в Алматы (в UTC ещё 16-е).
const now = new Date("2026-10-16T20:30:00Z");
const staff = [
  { id: "m1", name: "Айгерим", email: "a@b.kz" },
  { id: "m2", name: "Данияр", email: "d@b.kz" },
];

const money = (over: Partial<MoneyRow> & Pick<MoneyRow, "id" | "kind" | "amount" | "at">): MoneyRow => ({
  source: over.kind === "gift" ? "gift" : over.kind === "order" || over.kind === "legacy" ? "order" : "deal",
  method: "manual",
  dealId: null,
  dealNumber: null,
  orderId: null,
  orderNumber: null,
  giftNumber: null,
  client: "Клиент",
  managerId: null,
  acceptedById: null,
  receiptId: null,
  externalRef: null,
  invoiceNumber: null,
  reviewedAt: null,
  ...over,
});

const deal = (over: Partial<FinanceDealRow> & Pick<FinanceDealRow, "id" | "agreed" | "paid">): FinanceDealRow => ({
  number: 1,
  client: "Клиент",
  managerId: "m1",
  payments: over.paid > 0 ? 1 : 0,
  plan: null,
  source: "manual",
  stageKind: "open",
  milestone: null,
  hasClient: true,
  eventDate: null,
  book: null,
  invoice: null,
  order: null,
  ...over,
});

const order = (over: Partial<FinanceOrderRow> & Pick<FinanceOrderRow, "id" | "amount" | "received" | "status">): FinanceOrderRow => ({
  number: 7,
  client: "Клиент",
  managerId: "m2",
  dealId: null,
  dealNumber: null,
  postpay: false,
  prepaid: 0,
  paidAt: null,
  desiredDate: null,
  createdAt: new Date("2026-10-10T10:00:00Z"),
  claimedAt: null,
  ...over,
});

const screen = (input: Partial<Parameters<typeof financeScreen>[0]> = {}) =>
  financeScreen({ period: financePeriod({ preset: "month", now, tz: TZ }), money: [], deals: [], orders: [], unrecorded: [], review: [], staff, tz: TZ, now, ...input });

describe("financePeriod: границы по времени магазина", () => {
  it("сегодня — от полуночи Алматы, хотя в UTC ещё вчера; прошлый период — вчера", () => {
    const p = financePeriod({ preset: "today", now, tz: TZ });
    expect([p.first, p.last]).toEqual(["2026-10-17", "2026-10-17"]);
    expect(p.from.toISOString()).toBe("2026-10-16T19:00:00.000Z");
    expect(p.to.toISOString()).toBe("2026-10-17T19:00:00.000Z");
    expect([p.prev.from.toISOString(), p.prev.to.toISOString()]).toEqual(["2026-10-15T19:00:00.000Z", "2026-10-16T19:00:00.000Z"]);
    expect(p.label).toMatch(/^17 октября 2026/);
  });

  it("месяц — с 1-го по сегодня против тех же чисел прошлого; прошлый месяц — целиком; 7 дней", () => {
    const m = financePeriod({ preset: "month", now, tz: TZ });
    expect([m.first, m.last, m.days.length]).toEqual(["2026-10-01", "2026-10-17", 17]);
    expect([m.prev.from.toISOString(), m.prev.to.toISOString()]).toEqual(["2026-08-31T19:00:00.000Z", "2026-09-17T19:00:00.000Z"]);
    expect(m.label).toMatch(/^1–17 октября 2026/);
    const prev = financePeriod({ preset: "prev", now, tz: TZ });
    expect([prev.first, prev.last, prev.label]).toEqual(["2026-09-01", "2026-09-30", "сентябрь 2026"]);
    expect([prev.prev.from.toISOString(), prev.prev.to.toISOString()]).toEqual(["2026-07-31T19:00:00.000Z", "2026-08-31T19:00:00.000Z"]);
    expect(financePeriod({ preset: "7d", now, tz: TZ }).first).toBe("2026-10-11");
    // 31 марта: «те же числа» февраля обрезаются концом февраля.
    const march = financePeriod({ preset: "month", now: new Date("2026-03-31T10:00:00Z"), tz: TZ });
    expect(march.prev.to.toISOString()).toBe("2026-02-28T19:00:00.000Z");
  });

  it("свой период: не из будущего, не длиннее года; мусор — текущий месяц", () => {
    const c = financePeriod({ preset: "custom", from: "2026-10-05", to: "2026-10-25", now, tz: TZ });
    expect([c.preset, c.first, c.last]).toEqual(["custom", "2026-10-05", "2026-10-17"]);
    expect(c.prev.from.toISOString()).toBe("2026-09-21T19:00:00.000Z"); // 13 дней до 5 октября
    for (const bad of [
      { from: "2026-10-10", to: "2026-10-01" },
      { from: "2026-02-30", to: "2026-03-01" },
      { from: "2024-01-01", to: "2026-10-01" },
      { from: "2026-11-01", to: "2026-11-02" },
      { from: "мусор", to: "" },
    ])
      expect(financePeriod({ preset: "custom", ...bad, now, tz: TZ }).preset).toBe("month");
    expect(financePeriod({ preset: "что-то", now, tz: TZ }).preset).toBe("month");
  });

  it("другой пояс магазина — другие границы", () => {
    expect(financePeriod({ preset: "today", now, tz: "America/New_York" }).from.toISOString()).toBe("2026-10-16T04:00:00.000Z");
  });
});

describe("financeScreen: пришло", () => {
  const rows = [
    money({ id: "p1", kind: "prepayment", amount: 10000, at: new Date("2026-10-16T19:30:00Z"), dealId: "d1", dealNumber: 12, managerId: "m1", acceptedById: "m2", receiptId: "r1" }),
    money({ id: "j1", kind: "order", method: "kaspi", amount: 8000, at: new Date("2026-10-16T18:59:00Z"), orderId: "o1", orderNumber: 7, dealId: "d1", dealNumber: 12, managerId: "m1", externalRef: "QR-1" }),
    money({ id: "o2", kind: "legacy", method: "card", amount: 15000, at: new Date("2026-10-05T08:00:00Z"), orderId: "o2", orderNumber: 3, managerId: "m2" }),
    money({ id: "g1", kind: "gift", method: "kaspi", amount: 12000, at: new Date("2026-10-03T08:00:00Z"), giftNumber: 4 }),
    money({ id: "r1", kind: "refund", amount: 3000, at: new Date("2026-10-06T08:00:00Z"), dealId: "d1", dealNumber: 12, managerId: "m1", acceptedById: "m1" }),
    // прошлый период (сентябрь, 1–17)
    money({ id: "old", kind: "payment", amount: 20000, at: new Date("2026-09-10T08:00:00Z"), managerId: "m2" }),
  ];

  it("нетто = поступления − возвраты; онлайн и вручную; изменение к тем же числам прошлого месяца", () => {
    const s = screen({ money: rows });
    expect(s.totals).toMatchObject({ incoming: 45000, refunds: 3000, net: 42000, online: 35000, manual: 10000, count: 4, refundCount: 1, prevNet: 20000 });
    expect(s.totals.delta).toBeCloseTo(1.1);
  });

  it("разбивки: сертификаты — отдельной строкой способа, источники, менеджеры по ответственному сделки (возврат вычтен)", () => {
    const s = screen({ money: rows });
    expect(s.byMethod.map((m) => [m.key, m.value, m.count])).toEqual([
      ["kaspi", 8000, 1],
      ["card", 15000, 1],
      ["manual", 10000, 1],
      ["gift", 12000, 1],
    ]);
    expect(s.bySource.map((m) => [m.key, m.value])).toEqual([
      ["deal", 10000],
      ["order", 23000],
      ["gift", 12000],
    ]);
    expect(s.byManager.map((m) => [m.label, m.value, m.count])).toEqual([
      ["Айгерим", 10000 + 8000 - 3000, 2],
      ["Данияр", 15000, 1],
      ["Сайт: сертификаты", 12000, 1],
    ]);
    // Сумма разбивок по способам = поступления (каждая сумма — в одном месте).
    expect(s.byMethod.reduce((a, m) => a + m.value, 0)).toBe(s.totals.incoming);
    expect(s.byManager.reduce((a, m) => a + m.value, 0)).toBe(s.totals.net);
  });

  it("граница дня — полночь магазина: 00:30 17-го по Алматы — это 17-е, 23:59 16-го — 16-е", () => {
    const s = screen({ money: rows });
    const day = (d: string) => s.byDay.find((x) => x.date === d);
    expect(day("2026-10-17")).toMatchObject({ incoming: 10000, count: 1 });
    expect(day("2026-10-16")).toMatchObject({ incoming: 8000, count: 1 });
    expect(day("2026-10-06")).toMatchObject({ incoming: 0, refunds: 3000 });
    expect(s.byDay).toHaveLength(17);
    const today = screen({ money: rows, period: financePeriod({ preset: "today", now, tz: TZ }) });
    expect(today.totals).toMatchObject({ incoming: 10000, net: 10000, prevNet: 8000 });
  });

  it("строки поступлений: свежие сверху, чек сделки и заказа, онлайн — «онлайн», проверка только у ручных поступлений", () => {
    const s = screen({ money: rows });
    expect(s.recent.map((r) => r.key)).toEqual(["prepayment:p1", "order:j1", "refund:r1", "legacy:o2", "gift:g1"]);
    const [p1, j1, r1, legacy, gift] = s.recent;
    expect(p1).toMatchObject({ amount: 10000, method: "Перевод", acceptedBy: "Данияр", manager: "Айгерим", receiptHref: "/api/admin/receipts/r1", check: "pending" });
    expect(p1.refs).toEqual([{ label: "Сделка №12", href: "/admin/deals/d1" }]);
    expect(j1).toMatchObject({ method: "Kaspi", acceptedBy: "онлайн", operation: "QR-1", check: null });
    expect(j1.refs.map((r) => r.label)).toEqual(["Сделка №12", "Заказ №7"]);
    expect(r1).toMatchObject({ amount: -3000, refund: true, check: null });
    expect(legacy).toMatchObject({ method: "Карта", what: "Заказ оплачен (без записи оплаты)", check: null });
    expect(gift.refs).toEqual([{ label: "Сертификат №4", href: "/admin/gifts" }]);
    expect(s.refunds.map((r) => r.key)).toEqual(["refund:r1"]);
    const reviewed = screen({ money: [money({ id: "j2", kind: "order", amount: 1, at: now, reviewedAt: now, receiptId: "j2" })] });
    expect(reviewed.recent[0]).toMatchObject({ check: "reviewed", receiptHref: "/api/admin/order-payments/j2/receipt" });
  });

  it("роль «только свои» видит свои и ничьи записи", () => {
    const s = screen({ money: rows, visible: (id) => !id || id === "m2" });
    expect(s.totals.incoming).toBe(15000 + 12000);
    expect(s.byManager.map((m) => m.label)).toEqual(["Данияр", "Сайт: сертификаты"]);
  });
});

describe("financeScreen: ожидается, переплаты, «Проверить»", () => {
  const deals = [
    deal({ id: "ready", number: 1, agreed: 20000, paid: 5000, book: { theme: "love", answered: 30, total: 40, words: 3000 }, invoice: { number: 12, amount: 15000, expiresAt: new Date("2026-10-23T10:00:00Z"), claimedAt: now }, eventDate: "2026-10-10" }),
    deal({ id: "writing", number: 2, agreed: 15000, paid: 7500, book: { theme: "love", answered: 10, total: 40, words: 800 }, managerId: "m2" }),
    deal({ id: "stage", number: 3, agreed: 9000, paid: 0, plan: "print", source: "whatsapp", milestone: "book_half", hasClient: false }),
    deal({ id: "none", number: 4, agreed: 12000, paid: 0, hasClient: false }),
    deal({ id: "wonPaid", number: 5, agreed: 9000, paid: 4000, stageKind: "won" }),
    deal({ id: "wonNoMoney", number: 6, agreed: 9000, paid: 0, stageKind: "won" }),
    deal({ id: "lead", number: 7, agreed: 50000, paid: 0, source: "site" }),
    deal({ id: "lost", number: 8, agreed: 10000, paid: 2000, stageKind: "lost" }),
    deal({ id: "over", number: 9, agreed: 10000, paid: 12000 }),
    deal({ id: "withOrder", number: 10, agreed: 10000, paid: 12000, order: { id: "o9", number: 9, prepaid: 10000 } }),
  ];
  const orders = [
    order({ id: "wait", number: 20, amount: 8000, received: 3000, status: "pending_payment", prepaid: 10000, dealNumber: 10, claimedAt: now }),
    order({ id: "post", number: 21, amount: 6000, received: 0, status: "delivered", postpay: true }),
    order({ id: "postDone", number: 22, amount: 6000, received: 6000, status: "delivered", postpay: true, paidAt: now }),
    order({ id: "overpaid", number: 23, amount: 10000, received: 11000, status: "paid", paidAt: now }),
    order({ id: "cancelled", number: 24, amount: 7000, received: 7000, status: "cancelled" }),
  ];

  it("остаток договорённости по готовности книги; заказы и постоплаты; «успех» без денег и лид — не ожидание", () => {
    const s = screen({ deals, orders });
    expect(s.expected.rows.map((r) => [r.ref, r.left, r.group])).toEqual([
      ["Сделка №1", 15000, "ready"],
      ["Заказ №21", 6000, "ready"],
      ["Заказ №20", 5000, "ready"],
      ["Сделка №3", 9000, "progress"],
      ["Сделка №2", 7500, "progress"],
      ["Сделка №4", 12000, "none"],
      ["Сделка №5", 5000, "none"],
    ]);
    expect(s.expected.groups.map((g) => [g.key, g.value, g.count])).toEqual([
      ["ready", 26000, 3],
      ["progress", 16500, 2],
      ["none", 17000, 2],
    ]);
    // Доплаты без постоплат; счёт из чата — часть остатка своей сделки, к итогу не прибавляется.
    expect(s.totals).toMatchObject({ expected: 15000 + 5000 + 7500 + 9000 + 12000 + 5000, expectedReady: 20000, postpay: 6000, postpayCount: 1, expectedAll: 59500, expectedAllReady: 26000 });
    expect(s.expected.invoices).toEqual({ count: 1, sum: 15000 });
    const first = s.expected.rows[0];
    expect(first).toMatchObject({ total: 20000, paid: 5000, bookLabel: "готова · 30 отв.", overdue: true, manager: "Айгерим" });
    expect(first.invoice).toBe(`счёт P12 · ${(15000).toLocaleString("ru-RU")} ₸ · до 23 окт · клиент сообщил об оплате`);
    // Заказ: договорённость = предоплата + к оплате, оплачено = предоплата + записано.
    expect(s.expected.rows.find((r) => r.ref === "Заказ №20")).toMatchObject({ total: 18000, paid: 13000, left: 5000, kind: "order", href: "/admin/orders/wait" });
    expect(s.expected.rows.find((r) => r.ref === "Заказ №21")).toMatchObject({ kind: "postpay", bookLabel: "постоплата · доставлен" });
    expect(s.expected.rows.find((r) => r.ref === "Сделка №4")?.bookLabel).toBe("не начата · клиент не заведён");
  });

  it("переплаты и деньги к возврату — каждый случай один раз", () => {
    const s = screen({
      deals,
      orders,
      unrecorded: [{ id: "pi", target: "deal_invoice", externalId: "K-9", mismatch: false, amount: 25000, at: now, invoiceNumber: 14, dealId: "withOrder", dealNumber: 10, orderId: null, orderNumber: null, giftNumber: null, managerId: "m1", client: "К" }],
    });
    expect(s.issues.map((i) => [i.kind, i.ref, i.amount])).toEqual([
      ["deal_lost", "Сделка №8", 2000],
      ["deal_overpaid", "Сделка №9", 2000],
      ["deal_after_order", "Сделка №10", 2000],
      ["order_overpaid", "Заказ №23", 1000],
      ["order_cancelled", "Заказ №24", 7000],
      ["unrecorded", "счёт P14, сделка №10", 25000],
    ]);
    expect(s.totals).toMatchObject({ overpaid: 2000 + 2000 + 2000 + 1000 + 7000 + 25000, overpaidCount: 6 });
    // Сделка с переплатой — не ожидание.
    expect(s.expected.rows.some((r) => r.ref === "Сделка №9" || r.ref === "Сделка №10")).toBe(false);
  });

  it("«Проверить»: чек сделки и заказа, кто принял; видимость — по ответственному", () => {
    const review: ReviewRow[] = [
      { kind: "deal", id: "p1", paymentKind: "prepayment", amount: 10000, at: now, acceptedById: "m2", dealId: "d1", dealNumber: 12, orderId: null, orderNumber: null, managerId: "m1", client: "К", receiptId: "r1", note: "", invoiceNumber: 5 },
      { kind: "order", id: "j1", paymentKind: "order", amount: 4000, at: now, acceptedById: "m2", dealId: null, dealNumber: null, orderId: "o1", orderNumber: 7, managerId: "m2", client: "К", receiptId: "j1", note: "остаток", invoiceNumber: null },
    ];
    const s = screen({ review });
    expect(s.review.map((r) => [r.key, r.what, r.receiptHref, r.acceptedBy, r.invoice])).toEqual([
      ["deal:p1", "Предоплата", "/api/admin/receipts/r1", "Данияр", "счёт P5"],
      ["order:j1", "Оплата заказа", "/api/admin/order-payments/j1/receipt", "Данияр", null],
    ]);
    expect(s.totals.review).toEqual({ count: 2, sum: 14000 });
    expect(screen({ review, visible: (id) => id === "m2" }).review.map((r) => r.id)).toEqual(["j1"]);
  });

  it("«книга готова» — по правилам вида книги: своя книга («вручную») — по словам, а не по ответам", () => {
    const blank = (words: number) => deal({ id: `b${words}`, number: 30, agreed: 20000, paid: 10000, book: { theme: "blank", answered: 2, total: 3, words } });
    const groups = screen({ deals: [blank(3200), blank(900)] }).expected.rows.map((r) => [r.ref, r.group, r.bookLabel]);
    expect(groups.map(([, g, l]) => [g, String(l).replace(/\s/g, " ")])).toEqual([["ready", "готова · 3 200 слов"], ["progress", "пишется · 900 слов"]]);
  });
});
