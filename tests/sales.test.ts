import { describe, expect, it } from "vitest";
import type { AggregateRoot, DomainEvent } from "@/shared/domain";
import type { UnitOfWork } from "@/shared/application";
import { Deal, Funnel, type DealRepository, type FunnelRepository, type Stage } from "@/modules/sales/domain";
import { DealsService, LeadRoutingService, SiteFunnelService, type ClientDirectory, type DealInvoicesPort, type DealMoney } from "@/modules/sales/application";

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
    target.absorb(source, "m1");
    const s = target.snapshot();
    expect(s.contactEmail).toBe("a@b.kz");
    expect(s.amount).toBe(15000);
    expect(s.extraPhones).toEqual(["77079998877"]);
    expect(s.tags).toEqual(["vip"]);
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

function setup(autoFrom: "off" | "registered" | "book_started" = "book_started", money: (dealId: string) => Promise<DealMoney> = async () => ({ paid: 0, agreement: false })) {
  const deals = new MemDeals();
  const uow = new FakeUow();
  const funnels: FunnelRepository = { load: async () => funnel };
  const clients: ClientDirectory = {
    findByPhone: async () => null,
    profile: async (id) => (id === "c1" ? { name: "Айгерим", email: "a@test.kz", phone: "77011234567", managerId: "m1", utm: { source: "instagram" } } : null),
    adoptManager: async () => {},
  };
  const settings = { unsortedEnabled: async () => true, autoDealFrom: async () => autoFrom, reassignMinutes: async () => 15 };
  const router = new MemRouter();
  const clock = { at: now, now: () => clock.at };
  const invoices = new MemInvoices();
  const service = new DealsService(deals, funnels, clients, settings, router, uow, clock, invoices);
  // Прогресс книги клиента: тест меняет его, чтобы проверить вехи по виду книги.
  const bookState = { value: { theme: "love", answered: 26, total: 40, words: 900 } };
  const books = { progress: async () => bookState.value };
  const logger = { info: () => {}, warn: () => {}, error: () => {} };
  const site = new SiteFunnelService(deals, funnels, clients, settings, books, service, logger, money);
  const sent: { to: string; title: string }[] = [];
  const notifier = { notify: async (ids: string[], n: { title: string }) => void ids.forEach((to) => sent.push({ to, title: n.title })), owners: async (n: { title: string }) => void sent.push({ to: "owners", title: n.title }) };
  const routing = new LeadRoutingService(deals, router, settings, notifier, uow, clock, logger);
  return { deals, uow, service, site, router, routing, clock, sent, invoices, bookState };
}

describe("Круг: распределение заявок", () => {
  const lead = { title: "WhatsApp", source: "whatsapp" as const, contactPhone: "77001112233", unsorted: true };

  it("новая заявка сразу — первому в очереди, под блокировкой; в сделке помнится, кому досталась", async () => {
    const { service, router } = setup();
    router.queue = ["m2", "m3"];
    const d = await service.create(lead);
    expect(d).toMatchObject({ assigneeId: "m2", unsorted: true, assignedAt: now, routeTried: ["m2"] });
    expect(router.locks).toBe(1);
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
    const { service, router } = setup();
    router.queue = ["m2"];
    const d = await service.create(lead);
    await service.requestRejection(d.id, "spam", "m2", "реклама");
    expect((await service.findById(d.id))?.tags).toEqual(["запрос: спам"]);
    await service.declineRejection(d.id, "boss");
    expect((await service.findById(d.id))?.tags).toEqual([]);
    await service.requestRejection(d.id, "reject", "m2", "");
    await service.acceptUnsorted(d.id, "m2");
    expect(await service.findById(d.id)).toMatchObject({ tags: [], unsorted: false });
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

  it("слияние в закрытую сделку или в сделку с заказом — открытые счета отменяются (платить по ним уже нельзя)", async () => {
    const { service, invoices } = setup();
    const won = await service.create({ title: "Успех", source: "manual", clientId: "c1" });
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
