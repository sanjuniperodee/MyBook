import { describe, expect, it } from "vitest";
import { OrderPaymentsService, OrdersService } from "@/modules/ordering/application";
import type { OrderPaymentRecord, OrderPaymentRepository } from "@/modules/ordering/domain";
import { admin, clock, FakeUow } from "./doubles/ordering";
import { setup as orderingSetup } from "./doubles/ordering";

/** Журнал оплат в памяти: та же операция платёжной системы второй раз не записывается. */
class MemPayments implements OrderPaymentRepository {
  rows: OrderPaymentRecord[] = [];
  seq = 0;
  snapshot = () => [...this.rows];
  restore = (s: unknown) => void (this.rows = [...(s as OrderPaymentRecord[])]);
  nextId = () => `p${++this.seq}`;
  async add(p: Parameters<OrderPaymentRepository["add"]>[0]) {
    if (p.externalRef && this.rows.some((r) => r.method === p.method && r.externalRef === p.externalRef)) return false;
    this.rows.push({ ...p, reviewedById: null, reviewedAt: null, createdAt: new Date() });
    return true;
  }
  list = async (orderId: string) => this.rows.filter((r) => r.orderId === orderId);
  find = async (id: string) => this.rows.find((r) => r.id === id) ?? null;
  review = async (id: string, by: string, at: Date) => void Object.assign(this.rows.find((r) => r.id === id)!, { reviewedById: by, reviewedAt: at });
}

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const staff = { label: "admin:m@b.kz", userId: "m1" };

function setup() {
  const base = orderingSetup();
  const payments = new MemPayments();
  const files = new Map<string, Buffer>();
  const uow = new FakeUow([base.orders, payments]);
  const c = clock("2026-10-10T10:00:00Z");
  const money = new OrderPaymentsService(base.orders, payments, { put: async (k, b) => void files.set(k, b), remove: async (k) => void files.delete(k), read: async (k) => files.get(k) ?? null }, uow, c);
  const svc = new OrdersService(base.orders, base.promos, base.books, { activeStaff: async () => null, rememberPhoneIfMissing: async () => {} } as never, { prepare: async () => null }, { provider: () => "manual", currency: () => "KZT" }, { agreementFor: async () => null }, uow, c, money);
  const order = async () => {
    const o = await base.place();
    return o;
  };
  const manual = (orderId: string, amount: number, bytes = PNG) => money.acceptManual({ orderId, amount, paidAt: c.now(), note: "", receipt: { bytes, fileName: "чек.png" }, actor: staff });
  return { ...base, payments, files, uow, c, money, svc, order, manual };
}

describe("Деньги по заказу", () => {
  it("перевод с чеком покрыл «к оплате» — заказ оплачен датой денег; частичная оплата — ждёт остаток", async () => {
    const t = setup();
    const o = await t.order();
    const half = Math.floor(o.amount / 2);
    expect(await t.manual(o.id, half)).toMatchObject({ settled: false, overpaid: 0 });
    let fresh = (await t.orders.findById(o.id))!;
    expect([fresh.status, fresh.received, fresh.outstanding]).toEqual(["pending_payment", half, o.amount - half]);
    expect(await t.manual(o.id, o.amount - half)).toMatchObject({ settled: true, overpaid: 0 });
    fresh = (await t.orders.findById(o.id))!;
    expect(fresh.status).toBe("paid");
    expect(fresh.snapshot().paidAt).toEqual(t.c.now());
    expect(t.payments.rows.map((r) => r.receipt?.fileName)).toEqual(["чек.png", "чек.png"]);
  });

  it("без чека или с не-картинкой — ни денег, ни файла; переплата — событие", async () => {
    const t = setup();
    const o = await t.order();
    await expect(t.manual(o.id, 100, Buffer.from("hello"))).rejects.toMatchObject({ code: "receiptInvalid" });
    expect([t.payments.rows.length, t.files.size]).toEqual([0, 0]);
    expect(await t.manual(o.id, o.amount + 500)).toMatchObject({ settled: true, overpaid: 500 });
    expect(t.uow.types()).toContain("ordering.order_overpaid");
  });

  it("онлайн-оплата: заказ оплачен, та же операция повторно — ничего, вторая — «нужен возврат»", async () => {
    const t = setup();
    const o = await t.order();
    expect(await t.svc.acceptProviderPayment({ orderId: o.id, paymentId: "kaspi:A1", provider: "Kaspi", operationId: "A1", amount: o.amount }, admin)).toBe("paid");
    expect(await t.svc.acceptProviderPayment({ orderId: o.id, paymentId: "kaspi:A1", provider: "Kaspi", operationId: "A1", amount: o.amount }, admin)).toBe("duplicate");
    expect(await t.svc.acceptProviderPayment({ orderId: o.id, paymentId: "kaspi:B2", provider: "Kaspi", operationId: "B2", amount: o.amount }, admin)).toBe("refundNeeded");
    expect((await t.orders.findById(o.id))!.received).toBe(o.amount * 2);
    expect(t.payments.rows.map((r) => [r.method, r.externalRef])).toEqual([["kaspi", "A1"], ["kaspi", "B2"]]);
  });

  it("постоплата: в печать без денег, выручки нет; доставлен без оплаты — «получить постоплату»; деньги пришли — выручка с их даты", async () => {
    const t = setup();
    const o = await t.order();
    await expect(t.svc.changeStatus({ orderId: o.id, to: "in_production" }, admin)).rejects.toMatchObject({ code: "paymentRule" });
    await t.money.startPostpay(o.id, "договорились", admin);
    let fresh = (await t.orders.findById(o.id))!;
    expect([fresh.status, fresh.postpay, fresh.isSettled]).toEqual(["in_production", true, false]);
    await t.svc.changeStatus({ orderId: o.id, to: "delivered" }, admin);
    expect(t.uow.types()).toContain("ordering.postpay_due");
    t.c.set("2026-10-20T10:00:00Z");
    expect(await t.manual(o.id, o.amount)).toMatchObject({ settled: true });
    fresh = (await t.orders.findById(o.id))!;
    expect([fresh.status, fresh.isSettled, fresh.snapshot().paidAt?.toISOString()]).toEqual(["delivered", true, "2026-10-20T10:00:00.000Z"]);
    const paid = t.uow.published.filter((e) => e.type === "ordering.order_paid");
    expect(paid.map((e) => (e.payload as { settled?: boolean }).settled)).toEqual([true]);
  });

  it("отменённый заказ: перевод не принимается, онлайн-деньги — записаны как «нужен возврат»", async () => {
    const t = setup();
    const o = await t.order();
    await t.svc.changeStatus({ orderId: o.id, to: "cancelled" }, admin);
    await expect(t.manual(o.id, o.amount)).rejects.toMatchObject({ code: "paymentRule" });
    expect(await t.svc.acceptProviderPayment({ orderId: o.id, paymentId: "kaspi:C3", provider: "Kaspi", operationId: "C3", amount: o.amount }, admin)).toBe("refundNeeded");
    expect((await t.orders.findById(o.id))!.status).toBe("cancelled");
  });

  it("сумма — целое больше нуля, дата не из будущего", async () => {
    const t = setup();
    const o = await t.order();
    await expect(t.manual(o.id, 0)).rejects.toMatchObject({ code: "invalidAmount" });
    await expect(t.money.acceptManual({ orderId: o.id, amount: 100, paidAt: new Date("2030-01-01"), note: "", receipt: { bytes: PNG, fileName: "x.png" }, actor: staff })).rejects.toMatchObject({ code: "invalidAmount" });
  });
});

