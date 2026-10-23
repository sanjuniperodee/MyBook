import { describe, expect, it } from "vitest";
import type { AggregateRoot, DomainEvent } from "@/shared/domain";
import type { UnitOfWork } from "@/shared/application";
import { Deal, Funnel, mergeRefusal, type DealRepository, type FunnelRepository, type Stage } from "@/modules/sales/domain";
import { DealsService, LeadRoutingService, SiteFunnelService, type AgreedPlans, type ClientDirectory, type DealInvoicesPort, type DealMoney, type OrderOrigin } from "@/modules/sales/application";

const now = new Date("2026-10-01T10:00:00Z");
const stages: Stage[] = [
  { id: "new", pipelineId: "main", name: "Новая", kind: "open", position: 0, milestone: "registered" },
  { id: "book", pipelineId: "main", name: "Пишет книгу", kind: "open", position: 1, milestone: "book_started" },
  { id: "ready", pipelineId: "main", name: "Книга готова", kind: "open", position: 2, milestone: "book_ready" },
  { id: "order", pipelineId: "main", name: "Заказ", kind: "open", position: 3, milestone: "order_created" },
  { id: "won", pipelineId: "main", name: "Оплачен", kind: "won", position: 4, milestone: "order_paid" },
  { id: "lost", pipelineId: "main", name: "Отказ", kind: "lost", position: 5, milestone: null },
  { id: "b2b", pipelineId: "corp", name: "Корпоративные", kind: "open", position: 0, milestone: null },
];
const funnel = new Funnel(stages);
const stage = (id: string) => funnel.stage(id)!;
/** Слияние source (этап) в target (этап) с окном в днях — контекст absorb. */
const into = (source: string, target = "new", windowDays = 14) => ({ targetStage: stage(target), sourceStage: stage(source), windowDays });
const DAY = 24 * 60 * 60 * 1000;

const openDeal = (p: Partial<Parameters<typeof Deal.open>[2]> = {}, at = "new") =>
  Deal.open("d1", 7, { title: "Заявка", stageId: at, source: "site", clientId: "c1", contactName: "Айгерим", contactPhone: "77011234567", contactEmail: null, amount: 0, assigneeId: null, createdById: null, orderId: null, unsorted: false, customFields: {}, utm: null, ...p }, stage(at), now);

describe("Funnel", () => {
  it("основная воронка — первая; этапы ищутся в своей воронке", () => {
    expect(funnel.defaultPipelineId).toBe("main");
    expect(funnel.firstOfKind("open")?.id).toBe("new");
    expect(funnel.firstOfKind("open", "corp")?.id).toBe("b2b");
    expect(funnel.milestoneStage("book_started", "corp")).toBeNull();
  });

  it("по событиям сделка идёт только вперёд, закрытая — не двигается", () => {
    expect(funnel.shouldAdvance("book", stage("ready"))).toBe(true);
    expect(funnel.shouldAdvance("ready", stage("book"))).toBe(false);
    expect(funnel.shouldAdvance("won", stage("order"))).toBe(false);
    expect(funnel.shouldAdvance("ready", stage("won"))).toBe(true);
  });

  it("заказ заводит сделку всегда, остальное — начиная с настройки", () => {
    expect(Funnel.createsDeal("order_created", "off")).toBe(true);
    expect(Funnel.createsDeal("registered", "book_started")).toBe(false);
    expect(Funnel.createsDeal("book_ready", "book_started")).toBe(true);
    expect(Funnel.createsDeal("book_ready", "off")).toBe(false);
  });
});

describe("Deal", () => {
  it("новая сделка: история этапа, запись в ленту, событие deal_created", () => {
    const deal = openDeal();
    const j = deal.pullJournal();
    expect(j.stageChanges).toEqual([{ fromStageId: null, toStageId: "new", actorId: null }]);
    expect(j.notes[0].text).toContain("Создана сделка №7");
    expect(deal.pullEvents().map((e) => e.type)).toEqual(["sales.deal_created"]);
  });

  it("закрытие ставит дату и причину отказа, возврат в работу их снимает", () => {
    const deal = openDeal();
    deal.moveTo(stage("lost"), "m1", now, "Дорого");
    expect(deal.snapshot()).toMatchObject({ stageId: "lost", lostReason: "Дорого", closedAt: now, unsorted: false });
    deal.moveTo(stage("book"), "m1", now);
    expect(deal.snapshot()).toMatchObject({ lostReason: null, closedAt: null });
    expect(deal.moveTo(stage("book"), "m1", now)).toBe(false);
  });

  it("свои поля заполняются только пустые", () => {
    const deal = openDeal({ customFields: { recipient: "Мама", occasion: "" } });
    expect(deal.fillEmptyFields({ recipient: "Папа", occasion: "День рождения", event_date: null })).toBe(true);
    expect(deal.snapshot().customFields).toEqual({ recipient: "Мама", occasion: "День рождения" });
    expect(deal.fillEmptyFields({ recipient: "Папа" })).toBe(false);
  });

  it("слияние: пустые поля из дубля, его телефон — дополнительный, теги объединяются", () => {
    const target = openDeal({ contactEmail: null });
    const source = Deal.restore("d2", { ...openDeal().snapshot(), number: 8, contactPhone: "87079998877", contactEmail: "a@b.kz", amount: 15000, tags: ["vip"], extraPhones: [] });
    target.absorb(source, into("book"), "m1");
    const s = target.snapshot();
    expect(s.contactEmail).toBe("a@b.kz");
    expect(s.amount).toBe(15000);
    expect(s.extraPhones).toEqual(["77079998877"]);
    expect(s.tags).toEqual(["vip"]);
  });

  it("слияние: свои поля дубля заполняют только пустые, метки «откуда пришёл» — если своих нет", () => {
    const target = openDeal({ customFields: { recipient: "Мама", occasion: "" }, utm: null });
    const source = Deal.restore("d2", { ...openDeal().snapshot(), number: 8, customFields: { recipient: "Папа", occasion: "Юбилей", event_date: "2026-12-01" }, utm: { source: "instagram" } });
    target.absorb(source, into("new"), "m1");
    expect(target.snapshot()).toMatchObject({ customFields: { recipient: "Мама", occasion: "Юбилей", event_date: "2026-12-01" }, utm: { source: "instagram" } });
    const tagged = openDeal({ utm: { source: "google" } });
    tagged.absorb(source, into("new"), "m1");
    expect(tagged.snapshot().utm).toEqual({ source: "google" });
  });

  it("закрытую сделку (успех или отказ) влить нельзя: mergeClosed с её номером, цель не меняется", () => {
    const target = openDeal({ contactEmail: null });
    const source = Deal.restore("d2", { ...openDeal().snapshot(), number: 8, contactEmail: "a@b.kz", orderId: "o-old" });
    for (const closed of ["won", "lost"]) {
      expect(() => target.absorb(source, into(closed), "m1")).toThrow(expect.objectContaining({ code: "mergeClosed", params: [8] }));
    }
    expect(target.snapshot()).toMatchObject({ contactEmail: null, orderId: null });
    expect(target.pullJournal().notes.map((n) => n.text)).not.toContainEqual(expect.stringContaining("Объединена"));
  });

  it("в закрытую сделку новую заявку не вливают (deals-d6): mergeIntoClosed с номером цели и окном, цель не меняется", () => {
    const lastYear = new Date(now.getTime() - 365 * DAY);
    const won = Deal.restore("d1", { ...openDeal({ orderId: "o-old" }, "won").snapshot(), contactEmail: null, closedAt: lastYear, createdAt: lastYear });
    const fresh = Deal.restore("d2", { ...openDeal().snapshot(), number: 8, contactEmail: "a@b.kz", createdAt: now });
    expect(() => won.absorb(fresh, into("new", "won", 14), "m1")).toThrow(expect.objectContaining({ code: "mergeIntoClosed", params: [7, 14] }));
    expect(won.snapshot()).toMatchObject({ contactEmail: null, stageId: "won" });
    won.pullJournal();
    // та же покупка: заявка пришла за 3 дня до заказа — вливается
    const chat = Deal.restore("d3", { ...openDeal().snapshot(), number: 9, contactEmail: "a@b.kz", createdAt: new Date(lastYear.getTime() - 3 * DAY) });
    won.absorb(chat, into("new", "won", 14), "m1");
    expect(won.snapshot()).toMatchObject({ contactEmail: "a@b.kz", stageId: "won", orderId: "o-old" });
    expect(won.pullJournal().notes.map((n) => n.text)).toContain("Объединена со сделкой №9 «Заявка»");
  });
});

describe("mergeRefusal: кого с кем можно слить", () => {
  const closedAt = new Date("2026-09-01T10:00:00Z");
  const order = { kind: "won" as const, orderId: "o1", createdAt: closedAt, closedAt };
  const lead = (createdAt: Date | null) => ({ kind: "open" as const, orderId: null, createdAt, closedAt: null });
  const at = (days: number) => new Date(closedAt.getTime() + days * DAY);

  it("открытая цель — любую открытую заявку; закрытый источник — никогда (mergeClosed)", () => {
    const open = { kind: "open" as const, orderId: null, createdAt: at(-400), closedAt: null };
    expect(mergeRefusal(open, lead(at(10)), 14)).toBeNull();
    expect(mergeRefusal({ ...open, kind: null }, lead(at(10)), 0)).toBeNull();
    expect(mergeRefusal(open, { ...order, kind: "won" }, 14)).toBe("mergeClosed");
    expect(mergeRefusal(order, { ...order, kind: "lost" }, 14)).toBe("mergeClosed");
  });

  it("успешная цель с заказом — только заявку той же покупки: пришла не дальше окна до или после закрытия", () => {
    expect(mergeRefusal(order, lead(at(-14)), 14)).toBeNull();
    expect(mergeRefusal(order, lead(at(3)), 14)).toBeNull();
    expect(mergeRefusal(order, lead(at(14)), 14)).toBeNull();
    expect(mergeRefusal(order, lead(at(15)), 14)).toBe("mergeIntoClosed");
    expect(mergeRefusal(order, lead(at(-15)), 14)).toBe("mergeIntoClosed");
    expect(mergeRefusal(order, lead(at(365)), 14)).toBe("mergeIntoClosed");
    expect(mergeRefusal(order, lead(at(60)), 90)).toBeNull();
    // дата закрытия не записана (старые сделки) — от даты создания; даты заявки нет — нельзя
    expect(mergeRefusal({ ...order, closedAt: null }, lead(at(2)), 14)).toBeNull();
    expect(mergeRefusal(order, lead(null), 14)).toBe("mergeIntoClosed");
  });

  it("без заказа, проигранная или окно 0 — в закрытую не вливают", () => {
    expect(mergeRefusal({ ...order, orderId: null }, lead(at(1)), 14)).toBe("mergeIntoClosed");
    expect(mergeRefusal({ ...order, kind: "lost" }, lead(at(1)), 14)).toBe("mergeIntoClosed");
    expect(mergeRefusal(order, lead(at(0)), 0)).toBe("mergeIntoClosed");
  });
});

// ─── сценарии ──────────────────────────────────────────────────────────────

class MemDeals implements DealRepository {
  rows = new Map<string, ReturnType<Deal["snapshot"]>>();
  seq = 0;
  load = (id: string) => {
    const r = this.rows.get(id);
    if (!r) return null;
    const { id: _id, ...props } = structuredClone(r);
    return Deal.restore(_id, props);
  };
  nextIdentity = async () => ({ id: `d${++this.seq}`, number: this.seq });
  findById = async (id: string) => this.load(id);
  findByIds = async (ids: string[]) => ids.flatMap((id) => this.load(id) ?? []);
  findByOrder = async (orderId: string) => [...this.rows.values()].filter((r) => r.orderId === orderId).map((r) => this.load(r.id)!);
  findOpen = async (o: { clientId?: string | null }) => {
    const r = [...this.rows.values()].find((d) => d.clientId === o.clientId && funnel.stage(d.stageId)?.kind === "open");
    return r ? this.load(r.id) : null;
  };
  findRequests = async (o: { clientId?: string | null }, excludeId?: string) =>
    [...this.rows.values()]
      .filter((d) => d.id !== excludeId && d.clientId === o.clientId && funnel.stage(d.stageId)?.kind === "open" && !d.orderId && d.amount === 0 && !this.money.has(d.id))
      .map((r) => this.load(r.id)!);
  findUnlinked = async (phone: string) => [...this.rows.values()].filter((d) => !d.clientId && d.contactPhone === phone && funnel.stage(d.stageId)?.kind === "open").map((r) => this.load(r.id)!);
  findRecentWon = async (clientId: string) => {
    const r = [...this.rows.values()].find((d) => d.clientId === clientId && d.orderId && funnel.stage(d.stageId)?.kind === "won");
    return r ? this.load(r.id) : null;
  };
  /** Лента сделок (записи агрегата и заметки сервисов) — по порядку. */
  notes: string[] = [];
  private keep = (d: Deal) => {
    this.rows.set(d.id, d.snapshot());
    this.notes.push(...d.pullJournal().notes.map((n) => n.text));
  };
  add = async (d: Deal) => this.keep(d);
  save = async (d: Deal) => this.keep(d);
  mergeInto = async (_t: Deal, s: Deal) => void this.rows.delete(s.id);
  locked: string[][] = [];
  lock = async (ids: string[]) => void this.locked.push(ids);
  delete = async (id: string) => void this.rows.delete(id);
  money = new Set<string>();
  hasMoney = async (id: string) => this.money.has(id);
  addNote = async (_d: { id: string }, text: string) => void this.notes.push(text);
  waitingForRoute = async () => [...this.rows.values()].filter((r) => !r.assigneeId && funnel.stage(r.stageId)?.kind === "open").map((r) => r.id);
  notTakenSince = async (before: Date) => [...this.rows.values()].filter((r) => r.unsorted && r.assigneeId && r.assignedAt && r.assignedAt < before).map((r) => r.id);
}

/** Круг в памяти: очередь менеджеров по порядку, кто на смене и рабочее ли время — переключаются в тесте. */
class MemRouter {
  workTime = true;
  queue: string[] = [];
  active = new Set<string>(["m1"]);
  locks = 0;
  isWorkTime = async () => this.workTime;
  lock = async () => void this.locks++;
  next = async (exclude: readonly string[]) => this.queue.find((m) => !exclude.includes(m)) ?? null;
  isActive = async (id: string) => this.active.has(id);
  /** Рабочих минут между моментами; null — календарные (график не подключён). */
  workMinutes: ((from: Date, to: Date) => number) | null = null;
  workMinutesBetween = async (from: Date, to: Date) => (this.workMinutes ? this.workMinutes(from, to) : Math.floor((to.getTime() - from.getTime()) / 60_000));
}

class FakeUow implements UnitOfWork {
  events: DomainEvent[] = [];
  private tracked = new Set<AggregateRoot<object, string | number>>();
  async run<T>(work: () => Promise<T>) {
    const v = await work();
    for (const a of this.tracked) this.events.push(...a.pullEvents());
    this.tracked.clear();
    return v;
  }
  track(...a: AggregateRoot<object, string | number>[]) {
    a.forEach((x) => this.tracked.add(x));
  }
}

/** Счета из чата в памяти (порт заказов): что держит сделку и какие вызовы были — по порядку. */
class MemInvoices implements DealInvoicesPort {
  calls: string[] = [];
  /** Счёт, из-за которого сделку не удалить (по сделке). */
  holds = new Map<string, { label: string; reason: "open" | "paid" | "kaspi" }>();
  moved = { moved: [] as string[], cancelled: [] as string[] };
  moveAll = async (i: { from: string; to: string; closeOpen: boolean }) => (this.calls.push(`move:${i.from}>${i.to}:${i.closeOpen}`), this.moved);
  holdForDelete = async (dealId: string) => (this.calls.push(`hold:${dealId}`), this.holds.get(dealId) ?? null);
  purgeClosed = async (dealId: string) => void this.calls.push(`purge:${dealId}`);
}

function setup(autoFrom: "off" | "registered" | "book_started" = "book_started", money: (dealId: string) => Promise<DealMoney> = async () => ({ paid: 0, agreement: false }), origin: OrderOrigin = async () => null) {
  const deals = new MemDeals();
  const uow = new FakeUow();
  const funnels: FunnelRepository = { load: async () => funnel };
  const clients: ClientDirectory = {
    findByPhone: async () => null,
    profile: async (id) => (id === "c1" ? { name: "Айгерим", email: "a@test.kz", phone: "77011234567", managerId: "m1", utm: { source: "instagram" } } : null),
    adoptManager: async () => {},
    // Покупки клиента: выигранные сделки в памяти и оплаченные заказы без сделки (paidOrders).
    purchases: async (id) => [...deals.rows.values()].filter((d) => d.clientId === id && funnel.stage(d.stageId)?.kind === "won").length + (paidOrders.get(id) ?? 0),
  };
  const paidOrders = new Map<string, number>();
  const mergeWindow = { days: 14 };
  const entryStages: Record<string, string> = {};
  const settings = { unsortedEnabled: async () => true, autoDealFrom: async () => autoFrom, reassignMinutes: async () => 15, mergeClosedDays: async () => mergeWindow.days, entryStageId: async (source: string) => entryStages[source] ?? null };
  const router = new MemRouter();
  const clock = { at: now, now: () => clock.at };
  const invoices = new MemInvoices();
  // Тариф договорённости сделки (колонка вне агрегата); по сделке с заказом не меняется.
  const plans = new Map<string, string | null>();
  const agreedPlans: AgreedPlans = { get: async (id) => plans.get(id) ?? null, set: async (id, plan) => (deals.rows.get(id)?.orderId ? false : (plans.set(id, plan), true)) };
  const service = new DealsService(deals, funnels, clients, settings, router, uow, clock, invoices, agreedPlans);
  // Прогресс книги клиента: тест меняет его, чтобы проверить вехи по виду книги.
  const bookState = { value: { theme: "love", answered: 26, total: 40, words: 900 } };
  const books = { progress: async () => bookState.value };
  const logger = { info: () => {}, warn: () => {}, error: () => {} };
  const site = new SiteFunnelService(deals, funnels, clients, settings, books, service, logger, money, origin);
  const sent: { to: string; title: string }[] = [];
  const notifier = { notify: async (ids: string[], n: { title: string }) => void ids.forEach((to) => sent.push({ to, title: n.title })), owners: async (n: { title: string }) => void sent.push({ to: "owners", title: n.title }) };
  const routing = new LeadRoutingService(deals, router, settings, notifier, uow, clock, logger);
  return { deals, uow, service, site, router, routing, clock, sent, invoices, bookState, plans, mergeWindow, entryStages, paidOrders };
}

describe("Повторный клиент и источник по промокоду (deals-24, contacts-15)", () => {
  it("сделка помнит, сколько покупок было у клиента до неё; новый клиент — 0", async () => {
    const t = setup();
    const first = await t.service.create({ title: "Сайт", source: "site", clientId: "c1" });
    expect(first.repeatCount).toBe(0);
    const won = funnel.firstOfKind("won", funnel.defaultPipelineId)!;
    await t.service.move(first.id, won.id, null);
    t.paidOrders.set("c1", 1);
    const again = await t.service.create({ title: "WhatsApp", source: "whatsapp", clientId: "c1" });
    expect(again.repeatCount).toBe(2);
    expect(t.deals.notes.some((n) => n.includes("повторный клиент"))).toBe(true);
    expect((await t.service.create({ title: "Новый", source: "whatsapp", contactPhone: "77009998877" })).repeatCount).toBe(0);
  });

  it("заказ по сертификату — источник «Сертификат», по приглашению — «Рекомендация»; выбранный менеджером источник не меняется", async () => {
    const origins: Record<string, "gift" | "referral" | null> = { o1: "gift", o2: "referral" };
    const t = setup("book_started", undefined, async (id) => origins[id] ?? null);
    const d = await t.site.orderCreated({ id: "o1", userId: "c1", number: 7, amount: 25000 });
    expect((await t.deals.findById(d!.id))?.source).toBe("gift");
    expect(t.deals.notes.some((n) => n.includes("по подарочному сертификату"))).toBe(true);
    const t2 = setup("book_started", undefined, async (id) => origins[id] ?? null);
    const manual = await t2.service.create({ title: "Инстаграм", source: "instagram", clientId: "c1" });
    await t2.site.orderCreated({ id: "o2", userId: "c1", number: 8, amount: 25000 });
    expect((await t2.deals.findById(manual.id))?.source).toBe("instagram");
    const t3 = setup("book_started", undefined, async (id) => origins[id] ?? null);
    const r = await t3.site.orderCreated({ id: "o2", userId: "c1", number: 9, amount: 25000 });
    expect((await t3.deals.findById(r!.id))?.source).toBe("referral");
  });
});

describe("Круг: распределение заявок", () => {
  const lead = { title: "WhatsApp", source: "whatsapp" as const, contactPhone: "77001112233", unsorted: true };

  it("новая заявка сразу — первому в очереди, под блокировкой; в сделке помнится, кому досталась", async () => {
    const { service, router } = setup();
    router.queue = ["m2", "m3"];
    const d = await service.create(lead);
    expect(d).toMatchObject({ assigneeId: "m2", unsorted: true, assignedAt: now, routeTried: ["m2"] });
    expect(router.locks).toBe(1);
  });

  it("сделка, созданная правилом, помнит правило (статистика повторных продаж, contacts-16); обычная — нет", async () => {
    const { service } = setup();
    expect((await service.create({ title: "Повторная продажа: Новый год", source: "repeat", clientId: "c1", automationId: "rule-1" })).automationId).toBe("rule-1");
    expect((await service.create(lead)).automationId).toBeNull();
  });

  it("постоянный клиент — к своему менеджеру, если тот работает; отключён — по кругу", async () => {
    const { service, router } = setup();
    router.queue = ["m2"];
    expect((await service.create({ title: "Сайт", source: "site", clientId: "c1" })).assigneeId).toBe("m1");
    router.active.clear();
    const d = await service.create({ title: "Сайт", source: "site", clientId: "c1" });
    expect(d).toMatchObject({ assigneeId: "m2", routeTried: ["m2"] });
  });

  it("ночью — без ответственного; утром проход раздаёт и уведомляет", async () => {
    const { service, routing, router, sent } = setup();
    router.queue = ["m2"];
    router.workTime = false;
    const d = await service.create(lead);
    expect(d.assigneeId).toBeNull();
    expect(await routing.run()).toBe(0);
    router.workTime = true;
    expect(await routing.run()).toBe(1);
    expect((await service.findById(d.id))?.assigneeId).toBe("m2");
    expect(sent).toEqual([{ to: "m2", title: `Новая заявка №${d.number}` }]);
  });

  it("не взял за 15 минут — следующему, прежнему — уведомление; принятая заявка не уходит", async () => {
    const { service, routing, router, clock, sent } = setup();
    router.queue = ["m2", "m3"];
    const a = await service.create(lead);
    const b = await service.create({ ...lead, contactPhone: "77001112244" });
    await service.acceptUnsorted(b.id, "m3");
    clock.at = new Date(now.getTime() + 14 * 60_000);
    expect(await routing.run()).toBe(0);
    clock.at = new Date(now.getTime() + 16 * 60_000);
    expect(await routing.run()).toBe(1);
    expect(await service.findById(a.id)).toMatchObject({ assigneeId: "m3", routeTried: ["m2", "m3"], assignedAt: clock.at });
    expect((await service.findById(b.id))?.assigneeId).toBe("m2");
    expect(sent.map((s) => s.to)).toEqual(["m3", "m2"]);
  });

  it("время на заявку — рабочее (tasks-d7): ночью таймер стоит, утром заявку не отдают первым же проходом", async () => {
    const { service, routing, router, clock } = setup();
    router.queue = ["m2", "m3"];
    const d = await service.create(lead);
    // Назначили в 20:55, сейчас 09:01 следующего дня: календарных минут много, рабочих — 6.
    router.workMinutes = () => 6;
    clock.at = new Date(now.getTime() + 12 * 3_600_000);
    expect(await routing.run()).toBe(0);
    expect((await service.findById(d.id))?.assigneeId).toBe("m2");
    router.workMinutes = () => 16;
    expect(await routing.run()).toBe(1);
    expect((await service.findById(d.id))?.assigneeId).toBe("m3");
  });

  it("обошла всех — остаётся у последнего, руководителям напоминание, отсчёт заново", async () => {
    const { service, routing, router, clock, sent } = setup();
    router.queue = ["m2"];
    const d = await service.create(lead);
    clock.at = new Date(now.getTime() + 16 * 60_000);
    expect(await routing.run()).toBe(0);
    expect(await service.findById(d.id)).toMatchObject({ assigneeId: "m2", assignedAt: clock.at });
    expect(sent).toEqual([{ to: "owners", title: `Заявку №${d.number} никто не взял` }]);
  });

  it("менеджер предлагает спам — сделка остаётся с отметкой и круг её не передаёт; ответил клиенту или руководитель оставил — отметка снимается", async () => {
    const { service, router, deals } = setup();
    router.queue = ["m2"];
    const d = await service.create(lead);
    await service.requestRejection(d.id, "spam", "m2", "реклама");
    expect((await service.findById(d.id))?.tags).toEqual(["запрос: спам"]);
    await service.declineRejection(d.id, "boss");
    expect((await service.findById(d.id))?.tags).toEqual([]);
    await service.requestRejection(d.id, "reject", "m2", "");
    await service.acceptUnsorted(d.id, "m2", "ответ клиенту в чате");
    expect(await service.findById(d.id)).toMatchObject({ tags: [], unsorted: false });
    expect(deals.notes.at(-1)).toBe("Заявка принята в работу: ответ клиенту в чате");
    // Уже в работе — повторный контакт ничего не пишет.
    await service.acceptUnsorted(d.id, "m3", "записан звонок");
    expect(deals.notes.filter((n) => n.startsWith("Заявка принята"))).toHaveLength(1);
    await expect(service.requestRejection(d.id, "spam", "m2", "")).rejects.toMatchObject({ code: "notUnsorted" });
  });

  it("смена ответственного — событие с прежним (по нему чаты переходят новому)", async () => {
    const { service, uow, router } = setup();
    router.queue = ["m2"];
    const d = await service.create(lead);
    uow.events = [];
    await service.assign(d.id, "m3");
    expect(uow.events.map((e) => [e.type, (e.payload as { fromAssigneeId?: string }).fromAssigneeId])).toEqual([["sales.deal_assigned", "m2"]]);
  });
});

describe("DealsService", () => {
  it("сделку с принятыми деньгами удалить нельзя — платежи и чеки пропали бы каскадом", async () => {
    const { service, deals } = setup();
    const d = await service.create({ title: "Книга", source: "manual", clientId: "c1" });
    deals.money.add(d.id);
    await expect(service.delete(d.id)).rejects.toMatchObject({ code: "dealHasPayments" });
    expect(await service.findById(d.id)).not.toBeNull();
    deals.money.delete(d.id);
    await service.delete(d.id);
    expect(await service.findById(d.id)).toBeNull();
  });

  it("findByIds — одним запросом к хранилищу, в порядке запроса, без ненайденных (F4)", async () => {
    const { service, deals } = setup();
    const a = await service.create({ title: "А", source: "site", clientId: "c1" });
    const b = await service.create({ title: "Б", source: "site", clientId: "c1" });
    const calls: string[][] = [];
    const findByIds = deals.findByIds;
    deals.findByIds = async (ids) => (calls.push(ids), findByIds(ids));
    expect((await service.findByIds([b.id, "нет", a.id])).map((d) => d.title)).toEqual(["Б", "А"]);
    expect(calls).toEqual([[b.id, "нет", a.id]]);
  });

  it("ответственный и UTM клиента переходят в сделку; без клиента — «Неразобранное»", async () => {
    const { service, uow } = setup();
    const known = await service.create({ title: "Сайт", source: "site", clientId: "c1" });
    expect(known).toMatchObject({ assigneeId: "m1", utm: { source: "instagram" }, unsorted: false, stageId: "new" });
    const stranger = await service.create({ title: "WhatsApp", source: "whatsapp", contactPhone: "77001112233", unsorted: true });
    expect(stranger.unsorted).toBe(true);
    expect(uow.events.map((e) => e.type)).toEqual(["sales.deal_created", "sales.deal_created"]);
  });
});

describe("DealsService: заявки клиента вливаются в сделку с договорённостью (дубли)", () => {
  it("«пустая» заявка из чата вливается в новую сделку клиента; сделки с суммой, деньгами или заказом остаются отдельными", async () => {
    const { service, deals } = setup();
    const request = await service.create({ title: "Заявка из WhatsApp", source: "whatsapp", clientId: "c1" });
    const paid = await service.create({ title: "Другая книга", source: "manual", clientId: "c1" });
    deals.money.add(paid.id);
    const priced = await service.create({ title: "С суммой", source: "manual", clientId: "c1", amount: 9000 });
    const target = await service.create({ title: "Книга — Айжан", source: "manual", clientId: "c1", amount: 29000 });
    expect(await service.absorbRequests(target.id, "m1")).toEqual([request.number]);
    expect(await service.findById(request.id)).toBeNull();
    expect(await service.findById(paid.id)).not.toBeNull();
    expect(await service.findById(priced.id)).not.toBeNull();
    expect(await service.findById(target.id)).not.toBeNull();
  });

  it("заявок нет — ничего не делает; повторный вызов безопасен", async () => {
    const { service } = setup();
    const target = await service.create({ title: "Книга", source: "manual", clientId: "c1", amount: 29000 });
    expect(await service.absorbRequests(target.id, "m1")).toEqual([]);
    expect(await service.absorbRequests("нет-такой", "m1")).toEqual([]);
  });

  it("клиента завели по номеру — открытые заявки этого номера без клиента привязываются к нему", async () => {
    const { service, deals } = setup();
    const lead = await service.create({ title: "Заявка", source: "whatsapp", contactPhone: "77001112233" });
    const other = await service.create({ title: "Чужая", source: "whatsapp", contactPhone: "77009998877" });
    expect(await service.linkRequests("c1", "77001112233")).toEqual([lead.id]);
    expect(deals.rows.get(lead.id)?.clientId).toBe("c1");
    expect(deals.rows.get(other.id)?.clientId).toBeNull();
  });
});

describe("SiteFunnelService: книга после выигранного заказа — та же покупка", () => {
  it("книга начата, когда по заказу сделка уже выиграна, — новой сделки нет, поля книги ложатся в выигранную", async () => {
    const { site, service, deals } = setup();
    const won = await service.create({ title: "Книга — Айжан", source: "manual", clientId: "c1", amount: 29000, orderId: "o1" });
    await service.move(won.id, "won", null);
    await site.bookStarted("c1", { title: "Ты — моё всё", recipientName: "Марат" }, { recipient: "Марат" });
    expect(deals.rows.size).toBe(1);
    expect(deals.rows.get(won.id)).toMatchObject({ stageId: "won", customFields: { recipient: "Марат" } });
  });
});

describe("DealsService: куда падает новая заявка (настройка воронки)", () => {
  it("по источнику: сообщение мессенджера и звонок — на выбранные этапы, остальные — на первый", async () => {
    const { service, entryStages } = setup();
    entryStages.whatsapp = "book";
    entryStages.call = "ready";
    expect((await service.create({ title: "WA", source: "whatsapp", contactPhone: "77001112233" })).stageId).toBe("book");
    expect((await service.create({ title: "Звонок", source: "call", contactPhone: "77001112244" })).stageId).toBe("ready");
    expect((await service.create({ title: "Вручную", source: "manual", clientId: "c1" })).stageId).toBe("new");
  });

  it("этап задан явно — настройка не вмешивается; закрывающий или чужой этап в настройке игнорируется", async () => {
    const { service, entryStages } = setup();
    entryStages.whatsapp = "won";
    expect((await service.create({ title: "WA", source: "whatsapp", contactPhone: "77001112233" })).stageId).toBe("new");
    entryStages.whatsapp = "book";
    expect((await service.create({ title: "WA2", source: "whatsapp", contactPhone: "77001112255", stageId: "ready" })).stageId).toBe("ready");
    entryStages.whatsapp = "нет-такого";
    expect((await service.create({ title: "WA3", source: "whatsapp", contactPhone: "77001112266" })).stageId).toBe("new");
  });
});

describe("DealsService: лимит скидки (DiscountPolicy)", () => {
  const editPatch = (amount: number, source: "manual" | "whatsapp" = "manual") => ({ title: "Книга", contactName: "Айгерим", amount, source, tags: [], customFields: {} });

  it("бюджет сделки с тарифом договорённости: сверх лимита — DiscountError, ничего не сохранено; без лимита — цена против прайса", async () => {
    const { service, deals, plans } = setup();
    const d = await service.create({ title: "Книга", source: "whatsapp", clientId: "c1", amount: 30_000 });
    plans.set(d.id, "hardcover");
    await expect(service.edit(d.id, editPatch(25_000, "whatsapp"), "m1", 15)).rejects.toMatchObject({ code: "discountOverLimit", params: [15, 30_000, false] });
    expect(deals.rows.get(d.id)?.amount).toBe(30_000);
    expect(await service.edit(d.id, editPatch(25_500, "whatsapp"), "m1", 15)).toMatchObject({ plan: "hardcover", listPrice: 30_000, price: 25_500, percent: 15 });
    expect(await service.edit(d.id, editPatch(10_000, "whatsapp"), "boss", null)).toMatchObject({ percent: 66.7 });
    expect(deals.rows.get(d.id)?.amount).toBe(10_000);
  });

  it("сумма не менялась — не проверяем (правка других полей старой сделки); по сделке заказ или бюджет заявки без тарифа — тоже", async () => {
    const { service, deals, plans } = setup();
    const d = await service.create({ title: "Книга", source: "manual", clientId: "c1", amount: 5_000 });
    plans.set(d.id, "hardcover");
    expect(await service.edit(d.id, { ...editPatch(5_000), title: "Книга маме" }, "m1", 15)).toBeNull();
    const lead = await service.create({ title: "Заявка", source: "whatsapp", contactPhone: "77001112233", amount: 0 });
    expect(await service.edit(lead.id, editPatch(5_000, "whatsapp"), "m1", 15)).toBeNull();
    const ordered = await service.create({ title: "Заказ", source: "manual", clientId: "c1", orderId: "o1", amount: 30_000 });
    plans.set(ordered.id, "hardcover");
    expect(await service.edit(ordered.id, editPatch(1_000), "m1", 15)).toBeNull();
    expect(deals.rows.get(ordered.id)?.amount).toBe(1_000);
  });

  it("сделка «вручную» без тарифа: цена действует на любой тариф — сравнение с самым дорогим; смена источника на «вручную» — проверка", async () => {
    const { service } = setup();
    const d = await service.create({ title: "Книга", source: "whatsapp", clientId: "c1", amount: 9_900 });
    await expect(service.edit(d.id, editPatch(9_900, "manual"), "m1", 15)).rejects.toMatchObject({ code: "discountOverLimit", params: [15, 30_000, true] });
  });

  it("тариф договорённости: дорогой тариф по цене дешёвого — отказ, тариф прежний; без лимита — сохраняется с прежним тарифом в ответе", async () => {
    const { service, plans } = setup();
    const d = await service.create({ title: "Книга", source: "manual", clientId: "c1", amount: 9_900 });
    plans.set(d.id, "digital");
    await expect(service.changeAgreedPlan(d.id, "hardcover", 15)).rejects.toMatchObject({ code: "discountOverLimit" });
    expect(plans.get(d.id)).toBe("digital");
    // Снять тариф у сделки «вручную» — цена станет потолком любого тарифа: тоже сверх лимита.
    await expect(service.changeAgreedPlan(d.id, null, 15)).rejects.toMatchObject({ params: [15, 30_000, true] });
    expect(await service.changeAgreedPlan(d.id, "hardcover", null)).toEqual({ before: "digital", price: { plan: "hardcover", listPrice: 30_000, planless: false, price: 9_900, percent: 67 } });
    expect(plans.get(d.id)).toBe("hardcover");
  });

  it("новая сделка с формы: «вручную» с бюджетом ниже лимита не создаётся; внутренний вызов (без лимита в запросе) — не проверяется", async () => {
    const { service, deals } = setup();
    await expect(service.create({ title: "Книга", source: "manual", clientId: "c1", amount: 20_000, maxDiscountPercent: 15 })).rejects.toMatchObject({ code: "discountOverLimit" });
    expect(deals.rows.size).toBe(0);
    await service.create({ title: "Книга", source: "manual", clientId: "c1", amount: 26_000, maxDiscountPercent: 15 });
    await service.create({ title: "Заявка", source: "whatsapp", clientId: "c1", amount: 1_000, maxDiscountPercent: 15 });
    await service.create({ title: "Копия пакета", source: "manual", clientId: "c1", amount: 1_000 });
    expect(deals.rows.size).toBe(3);
  });

  it("новая сделка с тарифом договорённости: бюджет — против его прайса, тариф сохраняется в сделку; дорогой тариф по цене дешёвого — отказ", async () => {
    const { service, deals, plans } = setup();
    const d = await service.create({ title: "Электронная по телефону", source: "manual", clientId: "c1", amount: 9_900, agreedPlan: "digital", maxDiscountPercent: 15 });
    expect(plans.get(d.id)).toBe("digital");
    await expect(service.create({ title: "Книга", source: "manual", clientId: "c1", amount: 9_900, agreedPlan: "hardcover", maxDiscountPercent: 15 })).rejects.toMatchObject({ code: "discountOverLimit", params: [15, 30_000, false] });
    // Заявка из WhatsApp с тарифом — бюджет тоже цена продажи (как в карточке).
    await expect(service.create({ title: "Заявка", source: "whatsapp", clientId: "c1", amount: 20_000, agreedPlan: "hardcover", maxDiscountPercent: 15 })).rejects.toMatchObject({ code: "discountOverLimit" });
    expect(deals.rows.size).toBe(1);
    const lead = await service.create({ title: "Заявка", source: "whatsapp", clientId: "c1" });
    expect(plans.has(lead.id)).toBe(false);
  });
});

describe("SiteFunnelService", () => {
  it("до настройки сделку не заводит, заказ — заводит всегда", async () => {
    const { site, deals } = setup("book_started");
    expect(await site.advance("c1", "registered")).toBeNull();
    expect(deals.rows.size).toBe(0);
    await site.orderCreated({ id: "o1", userId: "c1", number: 12, amount: 24000 });
    const [d] = [...deals.rows.values()];
    expect(d).toMatchObject({ stageId: "order", orderId: "o1", amount: 24000, title: "Заказ №12" });
  });

  it("книга → поля сделки; прогресс → «почти готова»; оплата → успех; назад не идёт", async () => {
    const { site, deals } = setup();
    await site.bookStarted("c1", { title: "Ты — моё всё", recipientName: "Марат" }, { recipient: "Марат" });
    let [d] = [...deals.rows.values()];
    expect(d).toMatchObject({ stageId: "book", title: "Книга для: Марат", customFields: { recipient: "Марат" } });
    await site.bookProgressed("b1", "c1");
    [d] = [...deals.rows.values()];
    expect(d.stageId).toBe("ready");
    await site.advance("c1", "book_started");
    expect(deals.rows.get(d.id)?.stageId).toBe("ready");
    await site.orderCreated({ id: "o1", userId: "c1", number: 1, amount: 9000 });
    expect(await site.orderPaid({ id: "o1", userId: "c1", amount: 9900 })).toBe(d.id);
    expect(deals.rows.get(d.id)).toMatchObject({ stageId: "won", amount: 9900 });
  });

  it("название сделки — по виду книги: подарок, автобиография, своя книга", async () => {
    const titles = async (book: Parameters<ReturnType<typeof setup>["site"]["bookStarted"]>[1]) => {
      const { site, deals } = setup();
      await site.bookStarted("c1", book, {});
      return [...deals.rows.values()][0].title;
    };
    expect(await titles({ title: "Ты — моё всё", recipientName: "Марат", theme: "love", authorName: "Айгерим" })).toBe("Книга для: Марат");
    expect(await titles({ title: "История моей жизни", recipientName: "", theme: "autobiography", authorName: "Бакыт Нурланов" })).toBe("Автобиография: Бакыт Нурланов");
    expect(await titles({ title: "Записки", recipientName: "", theme: "blank", authorName: "Айгерим" })).toBe("Своя книга «Записки»");
    expect(await titles({ title: "", recipientName: "", theme: "blank", authorName: "Айгерим" })).toBe("Своя книга");
    // Старые события без темы — как раньше.
    expect(await titles({ title: "Ты — моё всё", recipientName: "Марат" })).toBe("Книга для: Марат");
  });

  it("вехи своей книги — по словам, а у книг с банком «половина» не пропадает при быстрой готовности", async () => {
    const own = setup();
    own.bookState.value = { theme: "blank", answered: 12, total: 12, words: 1200 };
    await own.site.bookStarted("c1", { title: "Записки", recipientName: "", theme: "blank", authorName: "А" }, {});
    await own.site.bookProgressed("b1", "c1");
    // 1200 слов — ещё не половина (1500) и не готова: сделка осталась на «Книга».
    expect([...own.deals.rows.values()][0].stageId).toBe("book");
    own.bookState.value = { theme: "blank", answered: 3, total: 12, words: 3000 };
    await own.site.bookProgressed("b1", "c1");
    expect([...own.deals.rows.values()][0].stageId).toBe("ready");

    // Автобиография: 25 ответов из 60 — готова, хотя до половины далеко; обе вехи отработали, сделка на «готова».
    const auto = setup();
    auto.bookState.value = { theme: "autobiography", answered: 25, total: 60, words: 300 };
    await auto.site.bookStarted("c1", { title: "Моя жизнь", recipientName: "", theme: "autobiography", authorName: "Б" }, {});
    await auto.site.bookProgressed("b2", "c1");
    expect([...auto.deals.rows.values()][0].stageId).toBe("ready");
  });

  it("заказ по договорённости — к её сделке, даже если её вручную перевели в «успех» до заказа; дубля нет", async () => {
    const { site, service, deals } = setup();
    const d = await service.create({ title: "Книга — Бибарс", source: "manual", clientId: "c1", amount: 20000 });
    await service.move(d.id, "won", "m1");
    await site.orderCreated({ id: "o9", userId: "c1", number: 9, amount: 22000, dealId: d.id });
    expect(deals.rows.size).toBe(1);
    expect(deals.rows.get(d.id)).toMatchObject({ orderId: "o9", stageId: "won" });
  });

  it("отмена заказа — сделка в отказ с причиной", async () => {
    const { site, deals } = setup();
    await site.orderCreated({ id: "o1", userId: "c1", number: 1, amount: 9000 });
    await site.orderCancelled("o1");
    expect([...deals.rows.values()][0]).toMatchObject({ stageId: "lost", lostReason: "Заказ отменён" });
  });

  it("отмена заказа по договорённости с предоплатой — сделка возвращается в работу, заказ отвязан, договорённость цела", async () => {
    const { site, service, deals } = setup("book_started", async () => ({ paid: 10000, agreement: true }));
    const manual = await service.create({ title: "Клиент менеджера", source: "manual", clientId: "c1", amount: 20000 });
    await site.orderCreated({ id: "o1", userId: "c1", number: 5, amount: 10000 });
    expect(deals.rows.get(manual.id)).toMatchObject({ stageId: "order", orderId: "o1" });
    await site.orderCancelled("o1", 5);
    expect(deals.rows.get(manual.id)).toMatchObject({ stageId: "ready", orderId: null, closedAt: null, lostReason: null });
    // и после отмены оплаченного заказа (сделка была в «Оплачен») — то же самое
    await site.orderCreated({ id: "o2", userId: "c1", number: 6, amount: 10000 });
    await site.orderPaid({ id: "o2", userId: "c1", amount: 20000 });
    expect(deals.rows.get(manual.id)?.stageId).toBe("won");
    await site.orderCancelled("o2", 6);
    expect(deals.rows.get(manual.id)).toMatchObject({ stageId: "ready", orderId: null, closedAt: null });
  });

  it("отмена заказа по ручной сделке без принятых денег — по-прежнему «Отказ»", async () => {
    const { site, service, deals } = setup("book_started", async () => ({ paid: 0, agreement: true }));
    const manual = await service.create({ title: "Клиент менеджера", source: "manual", clientId: "c1", amount: 20000 });
    await site.orderCreated({ id: "o1", userId: "c1", number: 5, amount: 20000 });
    await site.orderCancelled("o1", 5);
    expect(deals.rows.get(manual.id)).toMatchObject({ stageId: "lost", lostReason: "Заказ отменён" });
  });
});

describe("Жизнь сделки: деньги и счета из чата не теряются", () => {
  const lead = { title: "WhatsApp", source: "whatsapp" as const, contactPhone: "77001112233", unsorted: true };

  it("удаление: счёт ждёт оплаты или оплачен — нельзя (понятный текст), ничего не удалено", async () => {
    const { service, invoices } = setup();
    const d = await service.create({ title: "Книга", source: "whatsapp", clientId: "c1" });
    invoices.holds.set(d.id, { label: "P12", reason: "open" });
    await expect(service.delete(d.id)).rejects.toMatchObject({ code: "dealHasInvoice", message: "У сделки есть счёт P12 — отмените его или объедините сделки" });
    invoices.holds.set(d.id, { label: "P12", reason: "paid" });
    await expect(service.delete(d.id)).rejects.toMatchObject({ code: "dealHasInvoice", message: expect.stringContaining("оплаченный счёт P12") });
    invoices.holds.set(d.id, { label: "P12", reason: "kaspi" });
    await expect(service.delete(d.id)).rejects.toMatchObject({ code: "dealHasInvoice", message: expect.stringContaining("оплата Kaspi") });
    expect(await service.findById(d.id)).not.toBeNull();
    expect(invoices.calls.filter((c) => c.startsWith("purge"))).toEqual([]);
  });

  it("удаление: счета блокируются первыми, затем сделка; отменённые и истёкшие счета удаляются вместе с ней; с деньгами — нельзя", async () => {
    const { service, invoices, deals } = setup();
    const d = await service.create({ title: "Книга", source: "whatsapp", clientId: "c1" });
    const paid = await service.create({ title: "С деньгами", source: "manual", clientId: "c1" });
    deals.money.add(paid.id);
    await expect(service.delete(paid.id)).rejects.toMatchObject({ code: "dealHasPayments" });
    await service.delete(d.id);
    expect(invoices.calls).toEqual([`hold:${paid.id}`, `hold:${d.id}`, `purge:${d.id}`]);
    expect(deals.locked).toEqual([[paid.id], [d.id]]);
    expect(await service.findById(d.id)).toBeNull();
    expect(await service.findById(paid.id)).not.toBeNull();
  });

  it("слияние: счета переносятся до удаления дубля — сперва счета, потом блокировка обеих сделок; в ленте — номера счетов", async () => {
    const { service, invoices, deals } = setup();
    const target = await service.create({ title: "Основная", source: "whatsapp", clientId: "c1" });
    const dup = await service.create({ title: "Дубль", source: "manual", clientId: "c1" });
    invoices.moved = { moved: ["P3", "P5"], cancelled: ["P5"] };
    await service.merge(target.id, dup.id, "m1");
    expect(invoices.calls).toEqual([`move:${dup.id}>${target.id}:false`]);
    expect(deals.locked).toEqual([[target.id, dup.id]]);
    expect(deals.notes).toContain(`Счета из чата: из сделки №${dup.number} перенесены P3, P5; отменены открытые P5 (сделки объединены)`);
    expect(await service.findById(dup.id)).toBeNull();
  });

  it("источник перевели в «Успех» в ту же секунду, пока ждали блокировку, — под блокировкой отказ, дубль и его продажа на месте", async () => {
    const { service, deals } = setup();
    const target = await service.create({ title: "Основная", source: "whatsapp", clientId: "c1" });
    const dup = await service.create({ title: "Дубль", source: "manual", clientId: "c1" });
    // Параллельный запрос закрыл дубль успехом, пока слияние переносило счета и ждало блокировку сделок.
    deals.lock = async (ids: string[]) => {
      deals.locked.push(ids);
      await service.move(dup.id, "won", "m2");
    };
    await expect(service.merge(target.id, dup.id, "m1")).rejects.toMatchObject({ code: "mergeClosed", params: [dup.number] });
    expect(await service.findById(dup.id)).toMatchObject({ stageId: "won" });
    expect(await service.findById(target.id)).not.toBeNull();
  });

  it("слияние сохраняет цель свежей: правка цели, сделанная, пока ждали блокировку, не затирается", async () => {
    const { service, deals } = setup();
    const target = await service.create({ title: "Основная", source: "whatsapp", clientId: "c1" });
    const dup = await service.create({ title: "Дубль", source: "manual", clientId: "c1" });
    deals.lock = async (ids: string[]) => {
      deals.locked.push(ids);
      await service.assign(target.id, "m2");
    };
    await service.merge(target.id, dup.id, "m1");
    expect(await service.findById(target.id)).toMatchObject({ assigneeId: "m2" });
    expect(await service.findById(dup.id)).toBeNull();
  });

  it("слияние с выигранной или проигранной сделкой-источником — отказ до переноса счетов и блокировок, обе сделки на месте", async () => {
    const { service, invoices, deals } = setup();
    const fresh = await service.create({ title: "Новая заявка", source: "whatsapp", clientId: "c1" });
    const lastYear = await service.create({ title: "Прошлый заказ", source: "site", clientId: "c1", orderId: "o-old" });
    await service.move(lastYear.id, "won", "m1");
    const refused = await service.create({ title: "Отказ", source: "whatsapp", clientId: "c1" });
    await service.move(refused.id, "lost", "m1", "Дорого");
    await expect(service.merge(fresh.id, lastYear.id, "m1")).rejects.toMatchObject({ code: "mergeClosed", params: [lastYear.number] });
    await expect(service.merge(fresh.id, refused.id, "m1")).rejects.toMatchObject({ code: "mergeClosed" });
    expect(invoices.calls).toEqual([]);
    expect(deals.locked).toEqual([]);
    expect(await service.findById(lastYear.id)).toMatchObject({ stageId: "won", orderId: "o-old" });
    expect(await service.findById(fresh.id)).toMatchObject({ orderId: null });
  });

  it("слияние в закрытую сделку заказа или в сделку с заказом — открытые счета отменяются (платить по ним уже нельзя)", async () => {
    const { service, invoices } = setup();
    const won = await service.create({ title: "Заказ №5", source: "site", clientId: "c1", orderId: "o0" });
    await service.move(won.id, "won", "m1");
    const a = await service.create({ title: "Дубль 1", source: "whatsapp", clientId: "c1" });
    await service.merge(won.id, a.id, "m1");
    const withOrder = await service.create({ title: "С заказом", source: "site", clientId: "c1", orderId: "o1" });
    const b = await service.create({ title: "Дубль 2", source: "whatsapp", clientId: "c1" });
    await service.merge(withOrder.id, b.id, "m1");
    // заказ приходит из дубля — тоже
    const open = await service.create({ title: "Открытая", source: "whatsapp", clientId: "c1" });
    const c = await service.create({ title: "Дубль с заказом", source: "site", clientId: "c1", orderId: "o2" });
    await service.merge(open.id, c.id, "m1");
    expect(invoices.calls).toEqual([`move:${a.id}>${won.id}:true`, `move:${b.id}>${withOrder.id}:true`, `move:${c.id}>${open.id}:true`]);
  });

  it("новую заявку в прошлогоднюю успешную сделку не вливают (deals-d6) — отказ до переноса счетов и блокировок, заявка в работе", async () => {
    const { service, invoices, deals, clock, mergeWindow } = setup();
    const lastYear = await service.create({ title: "Заказ №120", source: "site", clientId: "c1", orderId: "o-old" });
    await service.move(lastYear.id, "won", "m1");
    clock.at = new Date(now.getTime() + 365 * DAY);
    const fresh = await service.create({ title: "WhatsApp", source: "whatsapp", clientId: "c1" });
    await expect(service.merge(lastYear.id, fresh.id, "m1")).rejects.toMatchObject({ code: "mergeIntoClosed", params: [lastYear.number, 14] });
    // проигранная и успешная без заказа — тоже нет, даже сразу
    const lost = await service.create({ title: "Отказ", source: "whatsapp", clientId: "c1" });
    await service.move(lost.id, "lost", "m1", "Дорого");
    const manual = await service.create({ title: "Продажа в чате", source: "whatsapp", clientId: "c1" });
    await service.move(manual.id, "won", "m1");
    const next = await service.create({ title: "Ещё заявка", source: "whatsapp", clientId: "c1" });
    await expect(service.merge(lost.id, next.id, "m1")).rejects.toMatchObject({ code: "mergeIntoClosed" });
    await expect(service.merge(manual.id, next.id, "m1")).rejects.toMatchObject({ code: "mergeIntoClosed" });
    expect(invoices.calls).toEqual([]);
    expect(deals.locked).toEqual([]);
    expect(await service.findById(fresh.id)).toMatchObject({ stageId: "new" });
    expect(await service.findById(next.id)).toMatchObject({ stageId: "new" });

    // окно — настройка: свежий заказ и заявка рядом с ним сливаются, окно 0 — нет
    const order = await service.create({ title: "Заказ №455", source: "site", clientId: "c2", orderId: "o-new" });
    await service.move(order.id, "won", "m1");
    const chat = await service.create({ title: "WhatsApp о заказе", source: "whatsapp", clientId: "c2" });
    mergeWindow.days = 0;
    await expect(service.merge(order.id, chat.id, "m1")).rejects.toMatchObject({ code: "mergeIntoClosed", params: [order.number, 0] });
    mergeWindow.days = 14;
    await service.merge(order.id, chat.id, "m1");
    expect(invoices.calls).toEqual([`move:${chat.id}>${order.id}:true`]);
    expect(await service.findById(chat.id)).toBeNull();
  });

  it("перевод в «успех» или «отказ» — событие «сделка закрыта» с причиной (по нему отменяются счета); возврат в работу — нет", async () => {
    const { service, uow } = setup();
    const d = await service.create({ title: "Книга", source: "whatsapp", clientId: "c1" });
    uow.events = [];
    await service.move(d.id, "lost", "m1", "Дорого");
    await service.move(d.id, "book", "m1");
    await service.move(d.id, "won", "m1");
    expect(uow.events.filter((e) => e.type === "sales.deal_closed").map((e) => e.payload)).toEqual([
      { dealId: d.id, number: d.number, clientId: "c1", assigneeId: "m1", outcome: "lost", reason: "Дорого" },
      { dealId: d.id, number: d.number, clientId: "c1", assigneeId: "m1", outcome: "won", reason: null },
    ]);
  });

  it("отклонение руководителем: без денег и счетов — удаляется; со счётом или деньгами — закрывается «отказом» с причиной, отметка снимается", async () => {
    const { service, invoices, uow, deals } = setup();
    const a = await service.create(lead);
    expect(await service.reject(a.id, { kind: "spam", actorId: "boss" })).toMatchObject({ deleted: true, kept: null });
    expect(await service.findById(a.id)).toBeNull();

    const b = await service.create({ ...lead, contactPhone: "77001112244" });
    await service.requestRejection(b.id, "spam", "m2", "реклама");
    invoices.holds.set(b.id, { label: "P7", reason: "open" });
    uow.events = [];
    expect(await service.reject(b.id, { kind: "spam", reason: "реклама", actorId: "boss" })).toMatchObject({ deleted: false, kept: "счёт P7 ждёт оплаты (отменяется)" });
    expect(await service.findById(b.id)).toMatchObject({ stageId: "lost", lostReason: "Спам: реклама", tags: [], unsorted: false });
    expect(uow.events.find((e) => e.type === "sales.deal_closed")?.payload).toMatchObject({ dealId: b.id, outcome: "lost", reason: "Спам: реклама" });
    expect(deals.notes).toContain("Заявка не удалена (счёт P7 ждёт оплаты (отменяется)) — закрыта «отказом»");

    const c = await service.create({ ...lead, contactPhone: "77001112255" });
    deals.money.add(c.id);
    expect(await service.reject(c.id, { kind: "reject" })).toMatchObject({ deleted: false, kept: "по ней приняты деньги" });
    expect(await service.findById(c.id)).toMatchObject({ stageId: "lost", lostReason: "Заявка отклонена" });
  });
});

describe("SiteFunnelService: сделка держит деньги клиента", () => {
  it("заказ не переписывает сумму сделки с предоплатой (цену договорённости) — после отмены договорённость та же", async () => {
    const { site, service, deals } = setup("book_started", async () => ({ paid: 10000, agreement: true }));
    const d = await service.create({ title: "Счёт из чата", source: "whatsapp", clientId: "c1", amount: 20000 });
    // итог заказа 22 000 = книга по договорённости 20 000 + доставка 2 000; к оплате 12 000, предоплата 10 000
    await site.orderCreated({ id: "o1", userId: "c1", number: 5, amount: 22000, dealId: d.id });
    expect(deals.rows.get(d.id)).toMatchObject({ orderId: "o1", amount: 20000 });
    await site.orderPaid({ id: "o1", userId: "c1", amount: 22000 });
    expect(deals.rows.get(d.id)).toMatchObject({ stageId: "won", amount: 20000 });
    await site.orderCancelled("o1", 5);
    expect(deals.rows.get(d.id)).toMatchObject({ stageId: "ready", orderId: null, amount: 20000, closedAt: null });
    expect(deals.notes.at(-1)).toMatch(/Предоплата 10\s000 ₸ осталась у нас/);
  });

  it("сделка без денег — сумма по заказу, как раньше", async () => {
    const { site, service, deals } = setup();
    const d = await service.create({ title: "Сайт", source: "site", clientId: "c1", amount: 0 });
    await site.orderCreated({ id: "o1", userId: "c1", number: 5, amount: 22000 });
    expect(deals.rows.get(d.id)).toMatchObject({ orderId: "o1", amount: 22000 });
  });

  it("заказ, уже привязанный к сделке договорённости в транзакции оформления, остаётся при ней — без дубля", async () => {
    const { site, service, deals } = setup();
    const d = await service.create({ title: "Договорённость", source: "manual", clientId: "c1", amount: 20000, orderId: "o7" });
    await site.orderCreated({ id: "o7", userId: "c1", number: 7, amount: 20000, dealId: d.id });
    expect(deals.rows.size).toBe(1);
    expect(deals.rows.get(d.id)).toMatchObject({ orderId: "o7", stageId: "order" });
  });

  it("отмена заказа: деньги есть, а договорённости нет (тариф не указан) — сделка в «отказ», менеджеру — что новый заказ их не учтёт", async () => {
    const { site, service, deals } = setup("book_started", async () => ({ paid: 5000, agreement: false }));
    const d = await service.create({ title: "Сайт", source: "site", clientId: "c1" });
    await site.orderCreated({ id: "o1", userId: "c1", number: 3, amount: 9900 });
    await site.orderCancelled("o1", 3);
    expect(deals.rows.get(d.id)).toMatchObject({ stageId: "lost", lostReason: "Заказ отменён" });
    expect(deals.notes.at(-1)).toContain("договорённость не оформлена (не указан тариф)");
  });
});
