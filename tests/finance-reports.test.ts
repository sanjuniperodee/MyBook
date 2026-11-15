import { describe, expect, it } from "vitest";
import { expenseGroupOf, feeOf, guessAdChannel, guessExpenseCategory, parseExpenseLines, parseFeeRates } from "@/shared/domain/expenses";
import { financePeriod, type MoneyRow } from "@/modules/reporting/ui/finance-screen";
import { expensesScreen, profitScreen, profitStep, type ExpenseRow, type ProfitCounts } from "@/modules/reporting/ui/profit-screen";
import { leadStatsScreen, recipientGroup, salesRegisterScreen, type LeadDealRow, type RegisterRow } from "@/modules/reporting/ui/lead-stats";

const tz = "Asia/Almaty";
const now = new Date("2026-11-15T10:00:00Z");
const at = (day: string, hour = 12) => new Date(`${day}T${String(hour).padStart(2, "0")}:00:00+05:00`);

describe("Расходы: список из таблицы", () => {
  it("строки «название сумма» из финансового листа: сумма с пробелами и ₸, категория по названию, «итого» пропущено", () => {
    const lines = parseExpenseLines("итого ₸817 702\nТаргет 02 ₸52 756\nКниги\t₸17 000\nзп Индира ₸52 660\nдоставка югс 5000 тг\nторт ₸6 520\nБека домен ₸37 000", "2026-11-14");
    expect(lines.map((l) => l.expense)).toEqual([
      { day: "2026-11-14", category: "ads", title: "Таргет 02", amount: 52756 },
      { day: "2026-11-14", category: "print", title: "Книги", amount: 17000 },
      { day: "2026-11-14", category: "payroll", title: "зп Индира", amount: 52660 },
      { day: "2026-11-14", category: "delivery", title: "доставка югс", amount: 5000 },
      { day: "2026-11-14", category: "other", title: "торт", amount: 6520 },
      { day: "2026-11-14", category: "services", title: "Бека домен", amount: 37000 },
    ]);
  });

  it("дата в строке важнее дня по умолчанию; год — из дня по умолчанию; неверная дата и строка без суммы — ошибка", () => {
    const [a, b, c, d] = parseExpenseLines("02.11 таргет 52 700\n2026-10-30; коробки; 3350\n31.02 книги 100\nпросто текст", "2026-11-14");
    expect(a.expense).toMatchObject({ day: "2026-11-02", category: "ads", title: "таргет", amount: 52700 });
    expect(b.expense).toMatchObject({ day: "2026-10-30", category: "packaging", title: "коробки", amount: 3350 });
    expect(c).toMatchObject({ line: 3, error: "Такой даты нет" });
    expect(d.error).toContain("Не нашли сумму");
  });

  it("номер в названии не съедает сумму; копейки отбрасываются", () => {
    expect(parseExpenseLines("таргет 09 13 628", "2026-11-09")[0].expense).toMatchObject({ title: "таргет 09", amount: 13628 });
    expect(parseExpenseLines("доставка клиент 1 615,50", "2026-11-09")[0].expense).toMatchObject({ title: "доставка клиент", amount: 1615 });
  });

  it("категории и каналы рекламы по названию; группы отчёта", () => {
    expect(guessExpenseCategory("тикток адс")).toBe("ads");
    expect(guessExpenseCategory("крафт")).toBe("packaging");
    expect(guessExpenseCategory("бонус")).toBe("payroll");
    expect(guessAdChannel("тикток адс")).toBe("tiktok");
    expect(guessAdChannel("Таргет 02")).toBe("instagram");
    expect(expenseGroupOf("print")).toBe("cogs");
    expect(expenseGroupOf("ads")).toBe("marketing");
    expect(expenseGroupOf("неизвестная")).toBe("operating");
  });
});

const money = (p: Partial<MoneyRow> & { amount: number; at: Date }): MoneyRow => ({
  id: `m${Math.random()}`,
  source: "deal",
  kind: "prepayment",
  method: "manual",
  dealId: null,
  dealNumber: null,
  orderId: null,
  orderNumber: null,
  giftNumber: null,
  client: "",
  managerId: null,
  acceptedById: null,
  receiptId: null,
  externalRef: null,
  invoiceNumber: null,
  reviewedAt: null,
  ...p,
});
const expense = (p: Partial<ExpenseRow> & { day: string; category: string; amount: number }): ExpenseRow => ({ id: `e${Math.random()}`, source: p.category === "ads" ? "ads" : "expense", title: "Расход", quantity: null, note: "", channel: p.category === "ads" ? "instagram" : null, createdById: null, createdAt: new Date(), ...p });
const counts = (p: Partial<ProfitCounts> = {}): ProfitCounts => ({ leads: 0, buyers: 0, buyersFirstSum: 0, buyersAgreed: 0, orders: 0, books: 0, ...p });

describe("Прибыль", () => {
  const period = financePeriod({ preset: "custom", from: "2026-11-01", to: "2026-11-14", now, tz });

  it("выручка минус расходы по группам; возврат вычитается; прошлый период — для сравнения", () => {
    const s = profitScreen({
      period,
      tz,
      money: [money({ amount: 100_000, at: at("2026-11-02") }), money({ amount: 50_000, at: at("2026-11-10") }), money({ amount: 10_000, at: at("2026-11-11"), kind: "refund" }), money({ amount: 70_000, at: at("2026-10-20") })],
      expenses: [
        expense({ day: "2026-11-02", category: "ads", amount: 35_000 }),
        expense({ day: "2026-11-03", category: "print", amount: 34_000, quantity: 4 }),
        expense({ day: "2026-11-05", category: "payroll", amount: 20_000 }),
        expense({ day: "2026-11-06", category: "other", amount: 5_000 }),
        expense({ day: "2026-10-21", category: "print", amount: 17_000 }),
      ],
      counts: counts({ leads: 50, buyers: 5, buyersFirstSum: 50_000, buyersAgreed: 170_000, orders: 4, books: 4 }),
      prevCounts: counts({ leads: 40, buyers: 6 }),
    });
    expect(s.totals).toMatchObject({ incoming: 150_000, refunds: 10_000, revenue: 140_000, cogs: 34_000, marketing: 35_000, team: 20_000, operating: 5_000, expenses: 94_000, profit: 46_000, gross: 106_000 });
    expect(s.totals.prev).toMatchObject({ revenue: 70_000, cogs: 17_000, profit: 53_000 });
    expect(s.totals.delta.revenue).toBe(1);
    expect(s.totals.margin).toBeCloseTo(46 / 140);
    expect(s.noExpenses).toBe(false);
    // Экономика: заявка 700, покупатель 7000, окупаемость от денег 400%, от первых оплат 143%, по договорам 486%, печать 8500.
    expect(s.unit).toMatchObject({ cpl: 700, cac: 7000, printPerBook: 8500, avgFirst: 10_000, avgAgreed: 34_000, profitPerBuyer: 9200 });
    expect(s.unit.roasCash).toBe(4);
    expect(s.unit.roasFirst).toBeCloseTo(50 / 35);
    expect(s.unit.roasAgreed).toBeCloseTo(170 / 35);
    expect(s.unit.conversion).toBe(0.1);
    // По дням: 14 строк, деньги и расходы — в свой день по времени магазина.
    expect(s.step).toBe("day");
    expect(s.rows).toHaveLength(14);
    expect(s.rows[1]).toMatchObject({ key: "2026-11-02", revenue: 100_000, marketing: 35_000, profit: 65_000 });
    expect(s.rows[10]).toMatchObject({ key: "2026-11-11", revenue: -10_000, profit: -10_000 });
    expect(s.byCategory.map((c) => [c.key, c.value])).toEqual([
      ["ads", 35_000],
      ["print", 34_000],
      ["payroll", 20_000],
      ["other", 5_000],
    ]);
  });

  it("без расходов прибыль равна выручке и страница это видит; без рекламы стоимость заявки не считается", () => {
    const s = profitScreen({ period, tz, money: [money({ amount: 30_000, at: at("2026-11-03") })], expenses: [], counts: counts({ leads: 10, buyers: 1 }), prevCounts: counts() });
    expect(s.noExpenses).toBe(true);
    expect(s.totals.profit).toBe(30_000);
    expect(s.unit).toMatchObject({ cpl: null, cac: null, roasCash: null, printPerBook: null });
  });

  it("шаг таблицы: дни до 31, недели до 4 месяцев, дальше месяцы; неделя — с понедельника, обрезана периодом", () => {
    expect([profitStep(31), profitStep(32), profitStep(123), profitStep(124)]).toEqual(["day", "week", "week", "month"]);
    const long = financePeriod({ preset: "custom", from: "2026-10-01", to: "2026-11-14", now, tz });
    const s = profitScreen({ period: long, tz, money: [money({ amount: 1000, at: at("2026-10-01") }), money({ amount: 2000, at: at("2026-11-14") })], expenses: [], counts: counts(), prevCounts: counts() });
    expect(s.step).toBe("week");
    // 1 октября 2026 — четверг: первая неделя начинается с понедельника 28 сентября, подпись — с начала периода.
    expect(s.rows[0]).toMatchObject({ key: "2026-09-28", revenue: 1000 });
    expect(s.rows[0].label).toMatch(/^1–4 окт/);
    expect(s.rows.at(-1)).toMatchObject({ key: "2026-11-09", revenue: 2000 });
  });

  it("ведомость расходов: реклама называется по каналу, итог и категории — за дни периода", () => {
    const s = expensesScreen({
      period,
      staff: [{ id: "u1", name: "Маргулан" }],
      expenses: [expense({ day: "2026-11-02", category: "ads", amount: 52_756, channel: "tiktok" }), expense({ day: "2026-11-03", category: "print", amount: 17_000, title: "Книги", createdById: "u1" }), expense({ day: "2026-10-31", category: "print", amount: 9_000 })],
    });
    expect(s.total).toBe(69_756);
    expect(s.rows.map((r) => [r.name, r.label, r.by])).toEqual([
      ["Реклама: TikTok", "Реклама", ""],
      ["Книги", "Печать книг", "Маргулан"],
    ]);
  });
});

const deal = (p: Partial<LeadDealRow> & { id: string; createdAt: Date }): LeadDealRow => ({
  number: 1,
  source: "whatsapp",
  entry: "whatsapp",
  utm: null,
  assigneeId: "m1",
  amount: 0,
  lostReason: null,
  closedAt: null,
  repeat: false,
  recipient: null,
  occasion: null,
  eventDate: null,
  stageId: "new",
  stage: "Новая заявка",
  stageKind: "open",
  stagePosition: 0,
  pipeline: "Продажи",
  firstPaidAt: null,
  firstAmount: 0,
  paid: 0,
  ...p,
});

describe("Статистика лидов", () => {
  const period = financePeriod({ preset: "custom", from: "2026-11-10", to: "2026-11-12", now, tz });
  const staff = [
    { id: "m1", name: "Индира" },
    { id: "m2", name: "Маргулан" },
  ];
  const deals = [
    deal({ id: "a", createdAt: at("2026-11-10", 10), recipient: "девушке", occasion: "Годовщина", eventDate: "2026-11-25", amount: 34_000, firstPaidAt: at("2026-11-10", 11), firstAmount: 10_000, paid: 10_000, stageId: "book", stage: "Пишет книгу", stagePosition: 3 }),
    deal({ id: "b", createdAt: at("2026-11-10", 23), recipient: "Мама", eventDate: "2026-11-14", stageId: "lost", stage: "Отказ", stageKind: "lost", lostReason: "Дорого" }),
    deal({ id: "c", createdAt: at("2026-11-11", 3), assigneeId: "m2", recipient: "мужу", amount: 29_000, firstPaidAt: at("2026-11-12", 9), firstAmount: 29_000, paid: 29_000, stageId: "won", stage: "Заказ оформлен", stageKind: "won", stagePosition: 5, utm: { source: "instagram" } }),
    deal({ id: "d", createdAt: at("2026-11-12", 15), stageId: "lost", stage: "Отказ", stageKind: "lost", lostReason: "Спам / ошибка" }),
    deal({ id: "e", createdAt: at("2026-11-12", 16) }),
    // Прошлый период (7–9 ноября): две заявки, одна оплата.
    deal({ id: "p1", createdAt: at("2026-11-08", 12), firstPaidAt: at("2026-11-08", 13), firstAmount: 10_000, paid: 10_000, amount: 29_000 }),
    deal({ id: "p2", createdAt: at("2026-11-09", 12) }),
  ];
  const payments = [
    { dealId: "a", assigneeId: "m1", amount: 34_000, dealCreatedAt: at("2026-11-10", 10), at: at("2026-11-10", 11), first: 10_000 },
    { dealId: "c", assigneeId: "m2", amount: 29_000, dealCreatedAt: at("2026-11-11", 3), at: at("2026-11-12", 9), first: 29_000 },
    { dealId: "p1", assigneeId: "m1", amount: 29_000, dealCreatedAt: at("2026-11-08", 12), at: at("2026-11-08", 13), first: 10_000 },
  ];
  const base = { period, deals, payments, invoices: [{ at: at("2026-11-10", 11), assigneeId: "m1" }], spend: [{ day: "2026-11-10", amount: 30_000 }, { day: "2026-11-12", amount: 20_000 }], staff, tz, now };

  it("итоги: нецелевые отдельно, конверсия когорты, сравнение с прошлым периодом, реклама от денег и от договоров", () => {
    const s = leadStatsScreen({ ...base, visible: () => true, showSpend: true });
    expect(s.totals).toMatchObject({ leads: 4, junk: 1, paid: 2, open: 1, lost: 1, payments: 2, paymentsFirst: 39_000, paymentsAgreed: 63_000, invoices: 1, spend: 50_000, cpl: 12_500, cac: 25_000, avgCheck: 31_500 });
    expect(s.totals.conversion).toBe(0.5);
    expect(s.totals.roas).toBeCloseTo(39 / 50);
    expect(s.totals.roasAgreed).toBeCloseTo(63 / 50);
    expect(s.totals.prev).toMatchObject({ leads: 2, payments: 1, conversion: 0.5 });
    expect(s.totals.delta.leads).toBe(1);
    // Половина платит быстрее, чем за 15,5 ч (1 ч и 30 ч).
    expect(s.totals.medianHours).toBe(15.5);
  });

  it("по дням: заявка — в день создания, оплата — в день денег (как в РНП); реклама дня даёт стоимость заявки и долю", () => {
    const s = leadStatsScreen({ ...base, visible: () => true, showSpend: true });
    expect(s.daily.map((d) => [d.day, d.leads, d.junk, d.payments, d.first, d.agreed, d.spend, d.cpl, d.cac])).toEqual([
      ["2026-11-10", 2, 0, 1, 10_000, 34_000, 30_000, 15_000, 30_000],
      ["2026-11-11", 1, 0, 0, 0, 0, 0, null, null],
      ["2026-11-12", 2, 1, 1, 29_000, 29_000, 20_000, 10_000, 20_000],
    ]);
    expect(s.daily[0].adShare).toBe(3);
    expect(s.daily[0].invoices).toBe(1);
  });

  it("разрезы: кому книга, срок до события, источник, менеджер, этапы, причины отказа, время суток", () => {
    const s = leadStatsScreen({ ...base, visible: () => true, showSpend: true });
    expect(s.byRecipient.map((r) => [r.label, r.leads, r.paid])).toEqual(expect.arrayContaining([["Парню или девушке", 1, 1], ["Родителям", 1, 0], ["Мужу или жене", 1, 1]]));
    expect(s.recipientKnown).toBe(3);
    expect(s.byLeadTime.map((r) => [r.label, r.leads, r.paid])).toEqual([
      ["меньше недели", 1, 0],
      ["2–4 недели", 1, 1],
    ]);
    // Канал обращения известен у всех заявок; рекламный канал — у покупателей (метки или выбор менеджера).
    expect(s.bySource.map((r) => [r.label, r.leads, r.paid])).toEqual([["WhatsApp", 4, 2]]);
    expect(s.buyersBySource.map((r) => [r.label, r.buyers, r.agreed])).toEqual([
      ["WhatsApp", 1, 34_000],
      ["Instagram", 1, 29_000],
    ]);
    expect(s.byManager.map((r) => [r.label, r.leads, r.paid])).toEqual([
      ["Индира", 3, 1],
      ["Маргулан", 1, 1],
    ]);
    expect(s.stages.map((st) => [st.label, st.count])).toEqual([
      ["Новая заявка", 1],
      ["Пишет книгу", 1],
      ["Заказ оформлен", 1],
      ["Отказ", 1],
    ]);
    expect(s.lost).toEqual([{ label: "Дорого", count: 1, share: 1 }]);
    expect(s.byHour.find((h) => h.label === "00–09")).toMatchObject({ leads: 1, paid: 1 });
    expect(s.byHour.find((h) => h.label === "22–24")).toMatchObject({ leads: 1, paid: 0 });
    expect(s.payDelay.map((d) => d.count)).toEqual([1, 0, 0, 1, 0, 0]);
  });

  it("роль «только свои» и фильтр по менеджеру: свои сделки, без расхода на рекламу", () => {
    const own = leadStatsScreen({ ...base, visible: (id) => id === "m2", showSpend: false });
    expect(own.totals).toMatchObject({ leads: 1, paid: 1, spend: 0, cpl: null, cac: null, roas: null });
    expect(own.daily.every((d) => d.spend === 0)).toBe(true);
    const filtered = leadStatsScreen({ ...base, visible: () => true, showSpend: true, managerId: "m1" });
    // Реклама общая — к одному менеджеру её не относим.
    expect(filtered.totals).toMatchObject({ leads: 3, paid: 1, spend: 0 });
  });

  it("получатель из свободного текста", () => {
    expect(["Құрбыма", "будущая жена", "Маме и папе", "коллеге", "", null].map(recipientGroup)).toEqual(["Подруге или другу", "Мужу или жене", "Родителям", "Другому человеку", null, null]);
  });
});

describe("Комиссии по формам оплаты", () => {
  const period = financePeriod({ preset: "custom", from: "2026-11-01", to: "2026-11-14", now, tz });

  it("проценты из настройки: мусор отброшен, пусто — по умолчанию; комиссия считается с суммы по форме", () => {
    expect(parseFeeRates("")).toEqual({ "Kaspi Рассрочка": 15, "Kaspi Red": 12 });
    expect(parseFeeRates("не json")).toEqual({ "Kaspi Рассрочка": 15, "Kaspi Red": 12 });
    expect(parseFeeRates('{"Kaspi Рассрочка":"14.5","Kaspi Red":150,"Перевод":0,"":5}')).toEqual({ "Kaspi Рассрочка": 14.5, "Перевод": 0 });
    expect(feeOf(29_000, "Kaspi Рассрочка", { "Kaspi Рассрочка": 15 })).toBe(4350);
    expect(feeOf(29_000, "Kaspi Gold", { "Kaspi Рассрочка": 15 })).toBe(0);
    expect(feeOf(29_000, null, { "Kaspi Рассрочка": 15 })).toBe(0);
  });

  it("в прибыли: комиссия с денег сделок с формой оплаты идёт в себестоимость; возврат её уменьшает; без формы — не считается", () => {
    const s = profitScreen({
      period,
      tz,
      money: [
        money({ amount: 29_000, at: at("2026-11-02"), dealId: "d1" }),
        money({ amount: 10_000, at: at("2026-11-03"), dealId: "d2" }),
        money({ amount: 10_000, at: at("2026-11-04"), dealId: "d2", kind: "refund" }),
        money({ amount: 29_000, at: at("2026-11-05"), dealId: "d3" }),
        money({ amount: 20_000, at: at("2026-11-06") }),
      ],
      expenses: [expense({ day: "2026-11-02", category: "fees", amount: 1_000 })],
      counts: counts(),
      prevCounts: counts(),
      forms: { d1: "Kaspi Рассрочка", d2: "Kaspi Red", d3: "Kaspi Gold" },
      feeRates: { "Kaspi Рассрочка": 15, "Kaspi Red": 12 },
    });
    // 29 000 × 15% = 4 350; по Red 1 200 − 1 200 = 0; плюс внесённая комиссия 1 000.
    expect(s.fees).toMatchObject({ auto: 4350, tagged: 58_000, untagged: 20_000 });
    expect(s.fees.byForm).toEqual([
      { form: "Kaspi Рассрочка", rate: 15, money: 29_000, fee: 4350, count: 1 },
      { form: "Kaspi Gold", rate: 0, money: 29_000, fee: 0, count: 1 },
      { form: "Kaspi Red", rate: 12, money: 0, fee: 0, count: 1 },
    ]);
    expect(s.totals).toMatchObject({ revenue: 78_000, cogs: 5350, profit: 72_650 });
    expect(s.byCategory).toEqual([expect.objectContaining({ key: "fees", value: 5350, count: 1 })]);
    expect(s.rows[1]).toMatchObject({ key: "2026-11-02", revenue: 29_000, cogs: 5350 });
    expect(s.noExpenses).toBe(false);
  });

  it("в реестре: комиссия с оплаченного и сумма на счёт", () => {
    const s = salesRegisterScreen({
      rows: [
        { id: "a", number: 1, createdAt: at("2026-11-01"), soldAt: at("2026-11-02"), source: "whatsapp", utm: null, assigneeId: null, client: "А", phone: null, plan: null, recipient: null, eventDate: null, payForm: "Kaspi Рассрочка", price: 29_000, dealPaid: 29_000, method: "manual", stage: "Пишет книгу", stageKind: "open", orderId: null, orderNumber: null, orderStatus: null, city: null, desiredDate: null, orderDue: null, orderPaid: 0, quantity: 1, chars: 0 },
      ],
      staff: [],
      visible: () => true,
      contact: () => "",
      tz,
      feeRates: { "Kaspi Рассрочка": 15 },
    });
    expect(s.rows[0]).toMatchObject({ payForm: "Kaspi Рассрочка", paid: 29_000, fee: 4350, net: 24_650 });
    expect(s.totals).toMatchObject({ fee: 4350, net: 24_650 });
  });
});

describe("Реестр продаж", () => {
  const row = (p: Partial<RegisterRow> & { id: string }): RegisterRow => ({
    number: 10,
    createdAt: at("2026-11-01"),
    soldAt: at("2026-11-02"),
    source: "whatsapp",
    utm: null,
    assigneeId: "m1",
    client: "Аяулым",
    phone: "77001112233",
    plan: "hardcover",
    recipient: "Парню",
    eventDate: "2026-12-01",
    payForm: null,
    price: 29_000,
    dealPaid: 10_000,
    method: "kaspi",
    stage: "Пишет книгу",
    stageKind: "open",
    orderId: null,
    orderNumber: null,
    orderStatus: null,
    city: null,
    desiredDate: null,
    orderDue: null,
    orderPaid: 0,
    quantity: 1,
    chars: 12_000,
    ...p,
  });

  it("остаток: без заказа — цена минус оплачено по сделке; с заказом — по заказу; итоги и состояние", () => {
    const s = salesRegisterScreen({
      rows: [row({ id: "a" }), row({ id: "b", orderId: "o1", orderNumber: 7, orderStatus: "in_production", orderDue: 19_000, orderPaid: 19_000, city: "Астана", stage: "Заказ оформлен", stageKind: "won" }), row({ id: "c", chars: 0, assigneeId: "m2" })],
      staff: [{ id: "m1", name: "Индира" }],
      visible: (id) => id === "m1",
      contact: (phone) => (phone ? "+7 700 ••• •• 33" : ""),
      tz,
    });
    expect(s.rows.map((r) => [r.id, r.price, r.paid, r.rest, r.state, r.city, r.manager, r.phone])).toEqual([
      ["a", 29_000, 10_000, 19_000, "Книга пишется", "", "Индира", "+7 700 ••• •• 33"],
      ["b", 29_000, 29_000, 0, "В печати", "Астана", "Индира", "+7 700 ••• •• 33"],
    ]);
    expect(s.totals).toEqual({ count: 2, price: 58_000, paid: 39_000, rest: 19_000, settled: 1, fee: 0, net: 39_000 });
    expect(s.rows[0]).toMatchObject({ day: "2026-11-02", channel: "WhatsApp", plan: "Твёрдая обложка", method: "Kaspi" });
  });
});
