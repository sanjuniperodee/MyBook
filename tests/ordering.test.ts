import { describe, expect, it } from "vitest";
import type { Actor, Clock, EventBus, UnitOfWork } from "@/shared/application";
import type { AggregateRoot, DomainEvent } from "@/shared/domain";
import { GiftCard, Order, OrderingError, PromoCode, type GiftCardRepository, type OrderRepository, type PromoCodeRepository } from "@/modules/ordering/domain";
import { GiftsService } from "@/modules/ordering/application/GiftsService";
import { OrdersService } from "@/modules/ordering/application/OrdersService";
import { PromoService } from "@/modules/ordering/application/PromoService";
import type { BookGateway, PeopleGateway } from "@/modules/ordering/application/ports";

// ─── тестовые двойники ─────────────────────────────────────────────────────

const clock = (iso = "2026-10-01T10:00:00Z"): Clock & { set(iso: string): void } => {
  let now = new Date(iso);
  return { now: () => new Date(now), set: (v) => (now = new Date(v)) };
};

/** Unit of Work в памяти: откат = восстановление снимка репозиториев, события — после «коммита». */
class FakeUow implements UnitOfWork {
  published: DomainEvent[] = [];
  private tracked = new Set<AggregateRoot<object, string | number>>();
  constructor(private readonly stores: { snapshot(): unknown; restore(s: unknown): void }[]) {}
  async run<T>(work: () => Promise<T>): Promise<T> {
    const snaps = this.stores.map((s) => s.snapshot());
    try {
      const v = await work();
      for (const a of this.tracked) this.published.push(...a.pullEvents());
      return v;
    } catch (e) {
      this.stores.forEach((s, i) => s.restore(snaps[i]));
      throw e;
    } finally {
      this.tracked.clear();
    }
  }
  track(...a: AggregateRoot<object, string | number>[]) {
    a.forEach((x) => this.tracked.add(x));
  }
  types() {
    return this.published.map((e) => e.type);
  }
}

class MemOrders implements OrderRepository {
  rows = new Map<string, ReturnType<Order["snapshot"]>>();
  history: { orderId: string; note: string; status: string | null }[] = [];
  seq = 100;
  snapshot = () => ({ rows: new Map(this.rows), history: [...this.history], seq: this.seq });
  restore = (s: unknown) => Object.assign(this, structuredClone(s));
  async nextIdentity() {
    return { id: crypto.randomUUID(), number: ++this.seq };
  }
  private load(id: string) {
    const r = this.rows.get(id);
    if (!r) return null;
    const { id: _id, ...props } = structuredClone(r);
    return Order.restore(_id, props);
  }
  async findById(id: string) {
    return this.load(id);
  }
  async findByNumber(n: number) {
    const r = [...this.rows.values()].find((x) => x.number === n);
    return r ? this.load(r.id) : null;
  }
  async findOwned(id: string, userId: string) {
    const o = this.load(id);
    return o && o.userId === userId ? o : null;
  }
  async hasOtherActiveOrders(bookId: string, except: string) {
    return [...this.rows.values()].some((r) => r.bookId === bookId && r.id !== except && r.status !== "cancelled");
  }
  async add(o: Order) {
    this.rows.set(o.id, o.snapshot());
    this.flush(o);
  }
  async save(o: Order) {
    this.rows.set(o.id, o.snapshot());
    this.flush(o);
  }
  private flush(o: Order) {
    for (const h of o.pullHistory()) this.history.push({ orderId: o.id, note: h.note, status: h.status });
  }
}

class MemPromos implements PromoCodeRepository {
  rows = new Map<string, ReturnType<PromoCode["snapshot"]>>();
  snapshot = () => new Map(this.rows);
  restore = (s: unknown) => (this.rows = structuredClone(s) as typeof this.rows);
  nextId = () => crypto.randomUUID();
  private load(r?: ReturnType<PromoCode["snapshot"]>) {
    if (!r) return null;
    const { id, ...p } = structuredClone(r);
    return PromoCode.restore(id, p);
  }
  async findByCode(code: string) {
    return this.load([...this.rows.values()].find((r) => r.code === code.trim().toUpperCase()));
  }
  async findById(id: string) {
    return this.load(this.rows.get(id));
  }
  async tryReserve(id: string, now: Date) {
    const r = this.rows.get(id);
    if (!r || !r.active || (r.maxUses !== null && r.usedCount >= r.maxUses) || (r.expiresAt && r.expiresAt <= now)) return false;
    this.rows.set(id, { ...r, usedCount: r.usedCount + 1 });
    return true;
  }
  async release(code: string) {
    const r = [...this.rows.values()].find((x) => x.code === code);
    if (r) this.rows.set(r.id, { ...r, usedCount: Math.max(0, r.usedCount - 1) });
  }
  async add(p: PromoCode) {
    if ([...this.rows.values()].some((r) => r.code === p.code)) return false;
    this.rows.set(p.id, p.snapshot());
    return true;
  }
  async save(p: PromoCode) {
    this.rows.set(p.id, p.snapshot());
  }
}

class MemBooks implements BookGateway {
  books = new Map<string, { userId: string; status: "draft" | "ordered"; blocking: string | null }>();
  snapshot = () => new Map([...this.books].map(([k, v]) => [k, { ...v }]));
  restore = (s: unknown) => (this.books = s as typeof this.books);
  async checkoutInfo(bookId: string, userId: string) {
    const b = this.books.get(bookId);
    return b && b.userId === userId ? { status: b.status, blockingIssue: b.blocking, estimatedPages: 64 } : null;
  }
  async lockForOrder(bookId: string) {
    const b = this.books.get(bookId);
    if (!b || b.status !== "draft") return false;
    b.status = "ordered";
    return true;
  }
  async unlock(bookId: string) {
    const b = this.books.get(bookId);
    if (b) b.status = "draft";
  }
  async toggleEditing(bookId: string) {
    const b = this.books.get(bookId)!;
    b.status = b.status === "draft" ? "ordered" : "draft";
    return b.status;
  }
}

const people: PeopleGateway = { rememberPhoneIfMissing: async () => {}, staffLabel: async (id) => (id === "staff-1" ? "Айгерим" : null) };
const admin: Actor = { label: "admin:a@b.kz" };

function setup() {
  const orders = new MemOrders();
  const promos = new MemPromos();
  const books = new MemBooks();
  const c = clock();
  const uow = new FakeUow([orders, promos, books]);
  const svc = new OrdersService(orders, promos, books, people, { prepare: async () => null }, { provider: () => "manual", currency: () => "KZT" }, uow, c);
  books.books.set("book-1", { userId: "user-1", status: "draft", blocking: null });
  const place = (extra: Partial<Parameters<OrdersService["place"]>[0]> = {}) =>
    svc.place({
      userId: "user-1",
      userPhone: null,
      locale: "ru",
      bookId: "book-1",
      plan: "hardcover",
      quantity: 1,
      delivery: { method: "courier", city: "Алматы", address: "Абая, 1", postalCode: null },
      addons: [],
      contact: { name: "Айжан", phone: "+77010000000", email: "a@b.kz" },
      ...extra,
    });
  return { orders, promos, books, c, uow, svc, place };
}

const addPromo = async (promos: MemPromos, code: string, input: Partial<{ kind: "percent" | "fixed"; value: number; maxUses: number | null; expiresAt: Date | null }> = {}) => {
  const p = PromoCode.create(promos.nextId(), { code, kind: input.kind ?? "percent", value: input.value ?? 10, maxUses: input.maxUses ?? null, expiresAt: input.expiresAt ?? null }, new Date("2026-01-01"));
  await promos.add(p);
  return p;
};

// ─── домен ─────────────────────────────────────────────────────────────────

describe("Ordering: агрегат Order", () => {
  it("цена считается в агрегате: тариф, доставка, скидка только на книги", async () => {
    const { place, orders, uow } = setup();
    const order = await place({ quantity: 2 });
    const s = order.snapshot();
    expect(s.price).toMatchObject({ itemsAmount: 24900 + 17900, deliveryAmount: 2000, amount: 24900 + 17900 + 2000 });
    expect(order.status).toBe("pending_payment");
    expect(orders.history[0].note).toBe("Заказ создан, 64 стр. (оценка)");
    expect(uow.types()).toEqual(["ordering.order_placed"]);
  });

  it("электронный тариф игнорирует доставку, допы и количество", async () => {
    const { place } = setup();
    const s = (await place({ plan: "digital", quantity: 5, addons: ["express"] })).snapshot();
    expect(s).toMatchObject({ quantity: 1, delivery: { method: null }, price: { amount: 9900, addonsAmount: 0 } });
  });

  it("оплата идемпотентна: повторное уведомление ничего не меняет", async () => {
    const { place, svc, uow } = setup();
    const o = await place();
    await svc.confirmPayment({ orderId: o.id, paymentId: "tx-1" }, admin);
    await svc.confirmPayment({ orderId: o.id, paymentId: "tx-2" }, admin);
    const paid = (await svc.findByNumber(o.number))!.snapshot();
    expect(paid).toMatchObject({ status: "paid", paymentId: "tx-1" });
    expect(uow.types().filter((t) => t === "ordering.order_paid")).toHaveLength(1);
  });

  it("сверка платежа: сумма и валюта", async () => {
    const o = await setup().place();
    expect(o.matchesPayment(o.amount, "KZT")).toBe(true);
    expect(o.matchesPayment(o.amount - 1, "KZT")).toBe(false);
    expect(o.matchesPayment(o.amount, "USD")).toBe(false);
  });

  it("отменённый заказ нельзя вернуть в «ожидает оплаты»", () => {
    const now = new Date();
    const o = Order.restore("o1", { ...setupSnapshot(), status: "cancelled" });
    expect(() => o.changeStatus("pending_payment", "x", "", now)).toThrow(OrderingError);
  });
});

function setupSnapshot() {
  return {
    number: 1,
    userId: "u",
    bookId: "b",
    plan: "hardcover" as const,
    quantity: 1,
    price: { itemsAmount: 1, discountAmount: 0, deliveryAmount: 0, addonsAmount: 0, addons: [], amount: 1 },
    promoCode: null,
    currency: "KZT",
    status: "pending_payment" as const,
    paymentProvider: "manual",
    paymentId: null,
    paymentClaimedAt: null,
    contact: { name: "", phone: "", email: "" },
    delivery: { method: null, city: null, address: null, postalCode: null },
    customerComment: null,
    giftNote: null,
    desiredDate: null,
    surprise: false,
    trackingNumber: null,
    adminNote: null,
    printSpec: null,
    assigneeId: null,
    paidAt: null,
    createdAt: new Date(),
  };
}

// ─── сценарии ──────────────────────────────────────────────────────────────

describe("Ordering: оформление заказа", () => {
  it("книга блокируется, второй заказ той же книги невозможен", async () => {
    const { place, books } = setup();
    await place();
    expect(books.books.get("book-1")!.status).toBe("ordered");
    await expect(place()).rejects.toMatchObject({ code: "alreadyOrdered" });
  });

  it("неготовая книга не заказывается — текст причины доходит до клиента", async () => {
    const { place, books } = setup();
    books.books.get("book-1")!.blocking = "Добавьте название книги";
    await expect(place()).rejects.toMatchObject({ code: "notReady", message: "Добавьте название книги" });
  });

  it("промокод: скидка, резерв использования, отказ просроченного", async () => {
    const { place, promos, c } = setup();
    await addPromo(promos, "SALE10", { value: 10, maxUses: 1 });
    const o = await place({ promoCode: "sale10" });
    expect(o.snapshot().price.discountAmount).toBe(2490);
    expect((await promos.findByCode("SALE10"))!.snapshot().usedCount).toBe(1);
    await addPromo(promos, "OLD", { expiresAt: new Date("2026-09-01") });
    c.set("2026-10-01T10:00:00Z");
    await expect(setupWith(promos).place({ promoCode: "OLD" })).rejects.toMatchObject({ code: "expired" });
  });

  it("гонка за последнее использование: транзакция откатывается целиком", async () => {
    const { place, promos, books, orders } = setup();
    const p = await addPromo(promos, "LAST", { maxUses: 1 });
    await promos.tryReserve(p.id, new Date()); // кто-то успел раньше
    await expect(place({ promoCode: "LAST" })).rejects.toMatchObject({ code: "used" });
    expect(books.books.get("book-1")!.status).toBe("draft");
    expect(orders.rows.size).toBe(0);
  });

  it("заказ на 100% сертификатом сразу оплачен", async () => {
    const { place, promos, uow } = setup();
    await addPromo(promos, "GIFT-AAAA-BBBB", { kind: "fixed", value: 100000, maxUses: 1 });
    const o = await place({ plan: "digital", promoCode: "GIFT-AAAA-BBBB" });
    expect(uow.types()).toEqual(["ordering.order_placed", "ordering.order_paid"]);
    expect(o.isFree).toBe(true);
  });
});

function setupWith(promos: MemPromos) {
  const s = setup();
  s.promos.rows = promos.rows;
  return s;
}

describe("Ordering: отмена и статусы", () => {
  it("отмена неоплаченного возвращает промокод и открывает книгу", async () => {
    const { place, promos, books, svc } = setup();
    await addPromo(promos, "BACK", { maxUses: 1 });
    const o = await place({ promoCode: "BACK" });
    await svc.cancelByCustomer(o.id, "user-1");
    expect((await promos.findByCode("BACK"))!.snapshot().usedCount).toBe(0);
    expect(books.books.get("book-1")!.status).toBe("draft");
  });

  it("клиент не может отменить чужой или оплаченный заказ", async () => {
    const { place, svc, orders } = setup();
    const o = await place();
    await expect(svc.cancelByCustomer(o.id, "other")).rejects.toMatchObject({ code: "not_found" });
    await svc.confirmPayment({ orderId: o.id, paymentId: null }, admin);
    await svc.cancelByCustomer(o.id, "user-1");
    expect(orders.rows.get(o.id)!.status).toBe("paid");
  });

  it("канбан: переход в производство, журнал и событие", async () => {
    const { place, svc, uow, orders } = setup();
    const o = await place();
    await svc.changeStatus({ orderId: o.id, to: "paid" }, admin);
    await svc.changeStatus({ orderId: o.id, to: "in_production", note: "в типографии" }, admin);
    expect(uow.types()).toContain("ordering.order_status_changed");
    expect(orders.history.at(-1)).toMatchObject({ status: "in_production", note: "в типографии" });
  });

  it("ответственным может быть только сотрудник", async () => {
    const { place, svc, orders } = setup();
    const o = await place();
    await svc.assign(o.id, "staff-1", admin);
    expect(orders.history.at(-1)!.note).toBe("Ответственный: Айгерим");
    await expect(svc.assign(o.id, "client-9", admin)).rejects.toMatchObject({ code: "staffNotFound" });
  });

  it("сообщение об оплате переводом — один раз", async () => {
    const { place, svc, uow } = setup();
    const o = await place();
    await svc.claimPayment(o.id, "user-1");
    await svc.claimPayment(o.id, "user-1");
    expect(uow.types().filter((t) => t === "ordering.payment_claimed")).toHaveLength(1);
  });
});

describe("Ordering: промокоды и сертификаты", () => {
  it("PromoService: проверка, дубликат кода, переключение", async () => {
    const promos = new MemPromos();
    const svc = new PromoService(promos, clock());
    expect(await svc.check(" ")).toEqual({ ok: false, error: "empty" });
    expect(await svc.check("NOPE")).toEqual({ ok: false, error: "notFound" });
    const p = await svc.create({ code: "spring", kind: "fixed", value: 3000, expiresOn: new Date("2026-12-31") });
    expect(p.code).toBe("SPRING");
    expect(p.expiresAt!.toISOString()).toBe("2026-12-31T23:59:59.999Z");
    await expect(svc.create({ code: "SPRING", kind: "fixed", value: 1 })).rejects.toMatchObject({ code: "promoExists" });
    expect(await svc.check("spring")).toMatchObject({ ok: true, promo: { code: "SPRING", label: expect.stringContaining("3") } });
    await svc.toggle(p.id);
    expect(await svc.check("SPRING")).toEqual({ ok: false, error: "notFound" });
    expect(() => PromoCode.create("x", { code: "P", kind: "percent", value: 101 }, new Date())).toThrow(OrderingError);
  });

  it("GiftsService: оплата выпускает одноразовый код на номинал, повтор безопасен", async () => {
    const promos = new MemPromos();
    const store = new Map<string, ReturnType<GiftCard["snapshot"]>>();
    const load = (r?: ReturnType<GiftCard["snapshot"]>) => (r ? GiftCard.restore(r.id, (({ id: _id, ...p }) => (void _id, p))(structuredClone(r))) : null);
    const gifts: GiftCardRepository = {
      nextIdentity: async () => ({ id: crypto.randomUUID(), number: 7 }),
      findById: async (id) => load(store.get(id)),
      findByNumber: async (n) => load([...store.values()].find((g) => g.number === n)),
      findByToken: async (t) => load([...store.values()].find((g) => g.token === t)),
      findByPromoId: async () => null,
      findDueForDelivery: async () => [],
      lockById: async (id) => load(store.get(id)),
      add: async (g) => void store.set(g.id, g.snapshot()),
      save: async (g) => void store.set(g.id, g.snapshot()),
    };
    const uow = new FakeUow([promos, { snapshot: () => new Map(store), restore: () => {} }]);
    const svc = new GiftsService(gifts, promos, { giftCode: () => "GIFT-TEST-0001", giftToken: () => "t".repeat(24) }, { provider: () => "manual", currency: () => "KZT" }, uow, clock(), () => "2026-10-01");
    await expect(svc.purchase({ plan: "premium", buyerUserId: null, buyerName: "А", buyerEmail: "a@b.kz", buyerPhone: "", recipientName: "Б", recipientEmail: "b@c.kz", sendAt: "2026-09-01", message: "", locale: "ru", buyerLocale: "ru" })).rejects.toMatchObject({ code: "giftPastDate" });
    const gift = await svc.purchase({ plan: "premium", buyerUserId: null, buyerName: "А", buyerEmail: "a@b.kz", buyerPhone: "", recipientName: "Б", recipientEmail: null, sendAt: "2026-12-01", message: "", locale: "ru", buyerLocale: "ru" });
    expect(gift.amount).toBe(34900);
    expect(gift.snapshot().sendAt).toBeNull(); // без адреса получателя дата отправки не нужна
    await svc.confirmPayment(gift.id, "tx", admin);
    expect(await svc.confirmPayment(gift.id, "tx", admin)).toBeNull();
    const promo = (await promos.findByCode("GIFT-TEST-0001"))!.snapshot();
    expect(promo).toMatchObject({ kind: "fixed", value: 34900, maxUses: 1 });
    expect(uow.types()).toEqual(["ordering.gift_purchased", "ordering.gift_paid"]);
    await svc.cancel(gift.id);
    expect((await promos.findByCode("GIFT-TEST-0001"))!.active).toBe(false);
  });
});

// Тип шины используется контейнером; здесь — проверка, что фейк удовлетворяет интерфейсу событий.
export type _Bus = EventBus;
