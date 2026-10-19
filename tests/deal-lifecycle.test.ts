import { describe, expect, it, vi } from "vitest";
import { DealInvoice, type DealInvoiceStatus, type OrderPlaced } from "@/modules/ordering/domain";
import { DEAL_INVOICE_CLOSE_REASONS, DealInvoiceLifecycle, OrdersService, type DealInvoiceLifecycleStore } from "@/modules/ordering/application";
import type { DealAssigned, DealClosed } from "@/modules/sales";
import type { DomainEvent } from "@/shared/domain";
import { InProcessEventBus } from "@/shared/infrastructure/InProcessEventBus";
import { FakeUow, setup as orderingSetup } from "./doubles/ordering";

vi.mock("@/modules/workspace", () => ({ notify: async () => {}, staffNotifier: { notifyOwnerOr: async () => {}, notifyAllWith: async () => {} } }));

/**
 * Счета из чата в жизни сделки и заказа (chat-invoices 1.4, 1.5, 1.10): слияние переносит счета (один открытый на сделку),
 * удаление не трогает счёт, по которому заплатили или ещё могут заплатить, заказ по договорённости закрывает открытый счёт
 * и пишет переплату, закрытие сделки отменяет её счёт (подписчик).
 */

const now = new Date("2026-10-17T10:00:00Z");
let seq = 0;
const invoice = (dealId: string, status: DealInvoiceStatus = "pending_payment") => {
  const n = ++seq;
  const i = DealInvoice.issue(crypto.randomUUID(), { number: n, token: `tok${n}`.padEnd(43, "x"), dealId, conversationId: null, phone: null, clientName: "Айгерим", locale: "ru", channel: "whatsapp", plan: "hardcover", agreedTotal: 20000, amount: 10000, purpose: "prepayment", issuedById: null, issueKey: null }, now);
  if (status === "cancelled") i.cancel("отменил менеджер");
  if (status === "paid") i.markPaid("kaspi", `op${n}`, now);
  if (status === "expired") i.expire(new Date(now.getTime() + 8 * 86_400_000));
  return i;
};

/** Счета в памяти: блокировки — в журнал, перенос держит «один открытый на сделку» (как индекс deal_invoices_open_idx). */
class MemInvoiceStore implements DealInvoiceLifecycleStore {
  rows = new Map<string, ReturnType<DealInvoice["snapshot"]>>();
  kaspi = new Set<string>();
  log: string[] = [];
  put = (...list: DealInvoice[]) => list.forEach((i) => this.rows.set(i.id, i.snapshot()));
  private load = (r: ReturnType<DealInvoice["snapshot"]>) => {
    const { id, ...p } = structuredClone(r);
    return DealInvoice.restore(id, p);
  };
  get = (id: string) => this.rows.get(id)!;
  lockDeal = async (dealId: string) => void this.log.push(`deal:${dealId}`);
  openFor = async (dealId: string) => {
    const r = [...this.rows.values()].find((x) => x.dealId === dealId && x.status === "pending_payment");
    return r ? this.load(r) : null;
  };
  lockById = async (id: string) => (this.log.push(`invoice:${id}`), this.rows.has(id) ? this.load(this.get(id)) : null);
  save = async (i: DealInvoice) => void this.rows.set(i.id, i.snapshot());
  lockAllFor = async (dealIds: string[]) => (this.log.push(`all:${dealIds.join(",")}`), [...this.rows.values()].filter((r) => dealIds.includes(r.dealId)).map(this.load));
  moveDeal = async (from: string, to: string) => {
    for (const r of [...this.rows.values()]) if (r.dealId === from) this.rows.set(r.id, { ...r, dealId: to });
    if ([...this.rows.values()].filter((r) => r.dealId === to && r.status === "pending_payment").length > 1) throw new Error("deal_invoices_open_idx");
  };
  deleteClosed = async (dealId: string) => {
    for (const r of [...this.rows.values()]) if (r.dealId === dealId && (r.status === "cancelled" || r.status === "expired")) this.rows.delete(r.id);
  };
  withPendingKaspi = async (ids: string[]) => ids.filter((id) => this.kaspi.has(id));
}

const lifecycle = () => {
  const store = new MemInvoiceStore();
  return { store, svc: new DealInvoiceLifecycle(store, { run: (w) => w() }) };
};

describe("Слияние сделок: счета переходят в целевую", () => {
  it("открыт у обеих — открытый счёт сливаемой отменяется до переноса («сделки объединены»), остальные переходят", async () => {
    const { store, svc } = lifecycle();
    const [srcOpen, srcPaid, tgtOpen] = [invoice("src"), invoice("src", "paid"), invoice("tgt")];
    store.put(srcOpen, srcPaid, tgtOpen);
    expect(await svc.moveAll({ from: "src", to: "tgt", closeOpen: false })).toEqual({ moved: [srcOpen.label, srcPaid.label].sort(), cancelled: [srcOpen.label] });
    expect(store.get(srcOpen.id)).toMatchObject({ dealId: "tgt", status: "cancelled", closedReason: DEAL_INVOICE_CLOSE_REASONS.merged });
    expect(store.get(srcPaid.id)).toMatchObject({ dealId: "tgt", status: "paid" });
    expect(store.get(tgtOpen.id)).toMatchObject({ dealId: "tgt", status: "pending_payment" });
    // выпуск счёта по обеим сделкам заблокирован (по порядку id), затем все их счета
    expect(store.log).toEqual(["deal:src", "deal:tgt", "all:src,tgt"]);
  });

  it("открыт только у сливаемой — переходит открытым; целевая закрыта или с заказом — открытые отменяются", async () => {
    const a = lifecycle();
    const open = invoice("src");
    a.store.put(open);
    expect(await a.svc.moveAll({ from: "src", to: "tgt", closeOpen: false })).toEqual({ moved: [open.label], cancelled: [] });
    expect(a.store.get(open.id)).toMatchObject({ dealId: "tgt", status: "pending_payment" });

    const b = lifecycle();
    const [x, y] = [invoice("src"), invoice("tgt")];
    b.store.put(x, y);
    expect((await b.svc.moveAll({ from: "src", to: "tgt", closeOpen: true })).cancelled.sort()).toEqual([x.label, y.label].sort());
    expect([b.store.get(x.id).status, b.store.get(y.id).status]).toEqual(["cancelled", "cancelled"]);
    expect(b.store.get(y.id).closedReason).toBe(DEAL_INVOICE_CLOSE_REASONS.mergedIntoClosed);
  });
});

describe("Удаление сделки: счета", () => {
  it("ждёт оплаты или оплачен — мешает; закрытый, по которому ещё ждёт счёт Kaspi, — мешает; отменённые и истёкшие — удаляются", async () => {
    const { store, svc } = lifecycle();
    const open = invoice("d1");
    store.put(open);
    expect(await svc.holdForDelete("d1")).toEqual({ label: open.label, reason: "open" });
    const paid = invoice("d2", "paid");
    store.put(paid);
    expect(await svc.holdForDelete("d2")).toEqual({ label: paid.label, reason: "paid" });
    const [cancelled, expired] = [invoice("d3", "cancelled"), invoice("d3", "expired")];
    store.put(cancelled, expired);
    store.kaspi.add(cancelled.id);
    expect(await svc.holdForDelete("d3")).toEqual({ label: cancelled.label, reason: "kaspi" });
    store.kaspi.clear();
    expect(await svc.holdForDelete("d3")).toBeNull();
    await svc.purgeClosed("d3");
    await svc.purgeClosed("d1");
    expect([...store.rows.keys()].sort()).toEqual([open.id, paid.id].sort());
    expect(store.log.filter((l) => l.startsWith("deal:"))).toEqual(["deal:d1", "deal:d2", "deal:d3", "deal:d3"]);
  });
});

describe("Заказ по договорённости: счета сделки и переплата", () => {
  const pickup = { method: "pickup" as const, city: null, address: null, postalCode: null };
  const agreement = (prepaid: number) => ({ dealId: "deal-1", dealNumber: 6, agreedTotal: 20000, prepaid, deadline: null, plan: "hardcover" as string | null });

  function placing(first: ReturnType<typeof agreement> | null, fresh = first) {
    const base = orderingSetup();
    const log: string[] = [];
    const uow = new FakeUow([base.orders, base.promos, base.books]);
    let reads = 0;
    const agreements = {
      agreementFor: async () => (log.push("agreement"), reads++ ? fresh : first),
      attachOrder: async (dealId: string, orderId: string) => (log.push(`attach:${dealId}:${orderId === base.orders.rows.keys().next().value}`), true),
    };
    const closed: { dealId: string; number: number }[] = [];
    const dealInvoices = { closeForOrder: async (dealId: string, number: number) => (log.push("close"), closed.push({ dealId, number }), null) };
    const svc = new OrdersService(base.orders, base.promos, base.books, { activeStaff: async () => null, rememberPhoneIfMissing: async () => {} }, { prepare: async () => null }, { provider: () => "manual", currency: () => "KZT" }, agreements, uow, base.c, undefined, dealInvoices);
    const place = () => svc.place({ userId: "user-1", userPhone: "+77010000000", locale: "ru", bookId: "book-1", plan: "hardcover", quantity: 1, delivery: pickup, addons: [], contact: { name: "Айжан", phone: "+77010000000", email: "a@b.kz" } });
    return { ...base, uow, log, closed, place };
  }

  it("в транзакции: сначала закрывается открытый счёт сделки, затем договорённость перечитывается (оплата, пришедшая только что, — в предоплате), заказ — к сделке", async () => {
    const t = placing(agreement(10000), agreement(15000));
    const o = await t.place();
    expect(t.closed).toEqual([{ dealId: "deal-1", number: o.number }]);
    expect(t.log).toEqual(["agreement", "close", "agreement", "attach:deal-1:true"]);
    // книга 30 000 → 20 000 по договорённости; внесено уже 15 000 (а не 10 000, как было до блокировки)
    expect(o.snapshot().price).toMatchObject({ prepaidAmount: 15000, amount: 5000 });
    const placed = t.uow.published.find((e) => e.type === "ordering.order_placed") as OrderPlaced;
    expect(placed.payload).toMatchObject({ agreementDealId: "deal-1", prepaidExcess: 0 });
  });

  it("внесено больше итога — зачёт не больше итога, в журнале заказа «переплата N ₸ по договорённости — нужен возврат», в событии prepaidExcess", async () => {
    const t = placing(agreement(50000));
    const o = await t.place();
    expect(o.snapshot().price).toMatchObject({ prepaidAmount: 20000, amount: 0 });
    expect(t.orders.history.map((h) => h.note)).toContainEqual(expect.stringMatching(/^Переплата 30\s000 ₸ по договорённости — нужен возврат$/));
    const placed = t.uow.published.find((e) => e.type === "ordering.order_placed") as OrderPlaced;
    expect(placed.payload.prepaidExcess).toBe(30000);
    // предоплата покрыла заказ — он сразу оплачен
    expect((await t.orders.findById(o.id))?.status).toBe("paid");
  });

  it("без договорённости — счета не трогаются, заказ ни к чему не привязывается", async () => {
    const t = placing(null);
    await t.place();
    expect(t.log).toEqual(["agreement"]);
  });
});

describe("Подписчики жизни сделки", () => {
  async function wire() {
    const { registerSubscriptions } = await import("@/server/subscriptions");
    const bus = new InProcessEventBus({ info: () => {}, warn: () => {}, error: () => {} });
    const calls: string[] = [];
    const cancelled = invoice("deal-9");
    cancelled.cancel(DEAL_INVOICE_CLOSE_REASONS.dealLost("Дорого"));
    const c = {
      bus,
      automation: { engine: { run: async () => 0 } },
      sales: {
        funnel: { orderCreated: async () => null },
        deals: {
          // deal-9 — проиграна, deal-0 — успешна, deal-5 — уже снова в работе (повтор события из outbox); deal-3 — у m2
          findById: async (id: string) => ({ id, stageId: { "deal-9": "lost", "deal-0": "won", "deal-5": "open" }[id], assigneeId: id === "deal-3" ? "m2" : null }),
          stage: async (id: string) => ({ id, kind: id }),
          byOrder: async () => [{ id: "deal-9", number: 9, title: "Книга", assigneeId: "m1" }],
          note: async (deal: { id: string }, text: string) => void calls.push(`note:${deal.id}:${text}`),
        },
      },
      ordering: { invoices: { cancelOpenFor: async (dealId: string, reason: string) => (calls.push(`cancel:${dealId}:${reason}`), dealId === "deal-9" ? cancelled : null) } },
      clients: {
        tasks: {
          create: async (_a: unknown, t: { title: string; assigneeId: string }) => void calls.push(`task:${t.assigneeId}:${t.title}`),
          followDeal: async (t: { dealId: string; from: string | null; to: string }) => (calls.push(`follow:${t.dealId}:${t.from}>${t.to}`), 1),
        },
      },
      messaging: { chats: { assignDealConversations: async (dealId: string, to: string) => void calls.push(`chats:${dealId}>${to}`) } },
    };
    registerSubscriptions(c as never);
    return { bus, calls, cancelled };
  }
  const closed = (dealId: string, outcome: "won" | "lost", reason: string | null): DealClosed => ({ type: "sales.deal_closed", occurredAt: now, payload: { dealId, number: 9, clientId: null, assigneeId: "m1", outcome, reason } });

  it("сделка проиграна или успешна — её открытый счёт отменяется с причиной, в ленту сделки — запись; уже снова в работе — не трогаем", async () => {
    const { bus, calls, cancelled } = await wire();
    await bus.publish([closed("deal-9", "lost", "Дорого")]);
    await bus.publish([closed("deal-0", "won", null)]);
    await bus.publish([closed("deal-5", "lost", null)]);
    expect(calls).toEqual([
      "cancel:deal-9:сделка проиграна (Дорого)",
      expect.stringMatching(new RegExp(`^note:deal-9:Счёт ${cancelled.label} на 10\\s000 ₸ отменён: сделка проиграна \\(Дорого\\)$`)),
      `cancel:deal-0:${DEAL_INVOICE_CLOSE_REASONS.dealWon}`,
    ]);
  });

  it("заказ с переплатой по договорённости — задача ответственному «оформите возврат»", async () => {
    const { bus, calls } = await wire();
    const ref = { orderId: "o1", number: 12, userId: "u1", bookId: "b1", plan: "hardcover", amount: 0, prepaid: 20000, contactName: "", contactPhone: "", contactEmail: "", promoCode: null };
    const placed = (prepaidExcess: number): DomainEvent => ({ type: "ordering.order_placed", occurredAt: now, payload: { ...ref, estimatedPages: 40, quantity: 1, agreementDealId: "deal-9", prepaidExcess } });
    await bus.publish([placed(0)]);
    expect(calls.filter((c) => c.startsWith("task:"))).toEqual([]);
    await bus.publish([placed(30000)]);
    expect(calls.filter((c) => c.startsWith("task:"))).toEqual([expect.stringMatching(/^task:m1:Переплата 30\s000 ₸ по договорённости \(заказ №12\) — оформите возврат$/)]);
  });

  it("сделку передали — её чаты и открытые задачи идут новому; повтор старого события после следующей передачи задачи не уводит", async () => {
    const { bus, calls } = await wire();
    const assigned = (dealId: string, from: string | null, to: string): DealAssigned => ({ type: "sales.deal_assigned", occurredAt: now, payload: { dealId, number: 3, clientId: null, assigneeId: to, fromAssigneeId: from, title: "Книга" } });
    await bus.publish([assigned("deal-3", "m1", "m2")]);
    // deal-4 сейчас ни у кого: событие «m1 → m3» устарело (повтор из outbox) — задачи не трогаются.
    await bus.publish([assigned("deal-4", "m1", "m3")]);
    expect(calls).toEqual(["chats:deal-3>m2", "follow:deal-3:m1>m2", "chats:deal-4>m3"]);
  });
});
