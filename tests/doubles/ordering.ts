import type { Actor, Clock, UnitOfWork } from "@/shared/application";
import type { AggregateRoot, DomainEvent } from "@/shared/domain";
import { Order, PromoCode, type OrderRepository, type PromoCodeRepository } from "@/modules/ordering/domain";
import { OrdersService } from "@/modules/ordering/application/OrdersService";
import type { BookGateway, PeopleGateway } from "@/modules/ordering/application/ports";

// ─── тестовые двойники ─────────────────────────────────────────────────────

export const clock = (iso = "2026-10-01T10:00:00Z"): Clock & { set(iso: string): void } => {
  let now = new Date(iso);
  return { now: () => new Date(now), set: (v) => (now = new Date(v)) };
};

/** Unit of Work в памяти: откат = восстановление снимка репозиториев, события — после «коммита». */
export class FakeUow implements UnitOfWork {
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

export class MemOrders implements OrderRepository {
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
  async hasPaidOrders(userId: string) {
    return [...this.rows.values()].some((r) => r.userId === userId && r.paidAt && r.status !== "cancelled");
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

export class MemPromos implements PromoCodeRepository {
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
  async findByOwner(ownerId: string) {
    return this.load([...this.rows.values()].find((r) => r.ownerId === ownerId));
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

export class MemBooks implements BookGateway {
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

export const people: PeopleGateway = { rememberPhoneIfMissing: async () => {}, staffLabel: async (id) => (id === "staff-1" ? "Айгерим" : null) };
export const admin: Actor = { label: "admin:a@b.kz" };

export function setup() {
  const orders = new MemOrders();
  const promos = new MemPromos();
  const books = new MemBooks();
  const c = clock();
  const uow = new FakeUow([orders, promos, books]);
  let agreement: { dealId: string; dealNumber: number; agreedTotal: number; prepaid: number; deadline: string | null; plan: string | null } | null = null;
  const agreements = { agreementFor: async () => agreement };
  const svc = new OrdersService(orders, promos, books, people, { prepare: async () => null }, { provider: () => "manual", currency: () => "KZT" }, agreements, uow, c);
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
  const setAgreement = (a: typeof agreement) => void (agreement = a);
  return { orders, promos, books, c, uow, svc, place, setAgreement };
}

export const addPromo = async (promos: MemPromos, code: string, input: Partial<{ kind: "percent" | "fixed"; value: number; maxUses: number | null; expiresAt: Date | null }> = {}) => {
  const p = PromoCode.create(promos.nextId(), { code, kind: input.kind ?? "percent", value: input.value ?? 10, maxUses: input.maxUses ?? null, expiresAt: input.expiresAt ?? null }, new Date("2026-01-01"));
  await promos.add(p);
  return p;
};
