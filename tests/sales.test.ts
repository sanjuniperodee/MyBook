import { describe, expect, it } from "vitest";
import type { AggregateRoot, DomainEvent } from "@/shared/domain";
import type { UnitOfWork } from "@/shared/application";
import { Deal, Funnel, type DealRepository, type FunnelRepository, type Stage } from "@/modules/sales/domain";
import { DealsService, SiteFunnelService, type ClientDirectory } from "@/modules/sales/application";

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
  findByOrder = async (orderId: string) => [...this.rows.values()].filter((r) => r.orderId === orderId).map((r) => this.load(r.id)!);
  findOpen = async (o: { clientId?: string | null }) => {
    const r = [...this.rows.values()].find((d) => d.clientId === o.clientId && funnel.stage(d.stageId)?.kind === "open");
    return r ? this.load(r.id) : null;
  };
  add = async (d: Deal) => void this.rows.set(d.id, d.snapshot());
  save = async (d: Deal) => void this.rows.set(d.id, d.snapshot());
  mergeInto = async (_t: Deal, s: Deal) => void this.rows.delete(s.id);
  delete = async (id: string) => void this.rows.delete(id);
  addNote = async () => {};
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

function setup(autoFrom: "off" | "registered" | "book_started" = "book_started", paid: (dealId: string) => Promise<number> = async () => 0) {
  const deals = new MemDeals();
  const uow = new FakeUow();
  const funnels: FunnelRepository = { load: async () => funnel };
  const clients: ClientDirectory = {
    findByPhone: async () => null,
    profile: async (id) => (id === "c1" ? { name: "Айгерим", email: "a@test.kz", phone: "77011234567", managerId: "m1", utm: { source: "instagram" } } : null),
    adoptManager: async () => {},
  };
  const settings = { unsortedEnabled: async () => true, autoDealFrom: async () => autoFrom };
  const service = new DealsService(deals, funnels, clients, settings, { nextRoundRobin: async () => null }, uow, { now: () => now });
  const books = { progress: async () => ({ answered: 26, total: 40 }) };
  const site = new SiteFunnelService(deals, funnels, clients, settings, books, service, { info: () => {}, warn: () => {}, error: () => {} }, paid);
  return { deals, uow, service, site };
}

describe("DealsService", () => {
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

  it("отмена заказа — сделка в отказ с причиной", async () => {
    const { site, deals } = setup();
    await site.orderCreated({ id: "o1", userId: "c1", number: 1, amount: 9000 });
    await site.orderCancelled("o1");
    expect([...deals.rows.values()][0]).toMatchObject({ stageId: "lost", lostReason: "Заказ отменён" });
  });

  it("отмена заказа по договорённости с предоплатой — сделка возвращается в работу, заказ отвязан, договорённость цела", async () => {
    const { site, service, deals } = setup("book_started", async () => 10000);
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
    const { site, service, deals } = setup("book_started", async () => 0);
    const manual = await service.create({ title: "Клиент менеджера", source: "manual", clientId: "c1", amount: 20000 });
    await site.orderCreated({ id: "o1", userId: "c1", number: 5, amount: 20000 });
    await site.orderCancelled("o1", 5);
    expect(deals.rows.get(manual.id)).toMatchObject({ stageId: "lost", lostReason: "Заказ отменён" });
  });
});
