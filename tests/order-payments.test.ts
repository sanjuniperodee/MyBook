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

describe("Возврат клиенту по заказу", () => {
  const refund = (t: ReturnType<typeof setup>, orderId: string, amount: number, extra: { note?: string; bytes?: Buffer | null } = {}) =>
    t.money.refund({ orderId, amount, note: extra.note ?? "лишний перевод", receipt: extra.bytes === null ? null : extra.bytes ? { bytes: extra.bytes, fileName: "возврат.png" } : null, actor: staff });

  it("живой заказ: вернуть можно только переплату, частями; получено уменьшается, заказ остаётся оплаченным", async () => {
    const t = setup();
    const o = await t.order();
    await t.manual(o.id, o.amount + 500);
    expect((await t.orders.findById(o.id))!.refundable).toBe(500);
    await expect(refund(t, o.id, 600)).rejects.toMatchObject({ code: "paymentRule", message: expect.stringContaining("не больше") });
    expect(await refund(t, o.id, 300, { bytes: PNG })).toMatchObject({ refundable: 200, payment: { kind: "refund", amount: 300, method: "manual", note: "лишний перевод" } });
    let fresh = (await t.orders.findById(o.id))!;
    expect([fresh.status, fresh.received, fresh.isSettled]).toEqual(["paid", o.amount + 200, true]);
    expect(await refund(t, o.id, 200)).toMatchObject({ refundable: 0, payment: { receipt: null } });
    fresh = (await t.orders.findById(o.id))!;
    expect([fresh.received, fresh.refundable, fresh.outstanding]).toEqual([o.amount, 0, 0]);
    // Переплаты больше нет — оплату самого заказа так не вернуть (только отменив заказ).
    await expect(refund(t, o.id, 1)).rejects.toMatchObject({ code: "paymentRule", message: expect.stringContaining("Переплаты по заказу нет") });
    expect(t.payments.rows.map((r) => [r.kind, r.amount])).toEqual([
      ["payment", o.amount + 500],
      ["refund", 300],
      ["refund", 200],
    ]);
    // Чек возврата — только у первого; файл лежит рядом с чеками оплат.
    expect([...t.files.keys()].filter((k) => k.includes(t.payments.rows[1].id))).toHaveLength(1);
  });

  it("отменённый заказ: вернуть можно всё полученное (и частично); больше — нельзя", async () => {
    const t = setup();
    const o = await t.order();
    await t.manual(o.id, o.amount);
    await t.svc.changeStatus({ orderId: o.id, to: "cancelled" }, admin);
    expect((await t.orders.findById(o.id))!.refundable).toBe(o.amount);
    await expect(refund(t, o.id, o.amount + 1)).rejects.toMatchObject({ code: "paymentRule" });
    await refund(t, o.id, 1000);
    expect((await t.orders.findById(o.id))!.refundable).toBe(o.amount - 1000);
    await refund(t, o.id, o.amount - 1000);
    const fresh = (await t.orders.findById(o.id))!;
    expect([fresh.status, fresh.received, fresh.refundable]).toEqual(["cancelled", 0, 0]);
    await expect(refund(t, o.id, 1)).rejects.toMatchObject({ message: expect.stringContaining("возвращать нечего") });
  });

  it("без причины, с нулём или с битым чеком — ничего не записано; запись в журнале заказа", async () => {
    const t = setup();
    const o = await t.order();
    await t.manual(o.id, o.amount + 1000);
    const files = t.files.size;
    await expect(refund(t, o.id, 100, { note: " a " })).rejects.toMatchObject({ code: "paymentRule" });
    await expect(refund(t, o.id, 0)).rejects.toMatchObject({ code: "paymentRule" });
    await expect(refund(t, o.id, 100, { bytes: Buffer.from("hello") })).rejects.toMatchObject({ code: "receiptInvalid" });
    // Отказ правила денег после сохранения чека — файл убран.
    await expect(refund(t, o.id, 5000, { bytes: PNG })).rejects.toMatchObject({ code: "paymentRule" });
    expect([t.payments.rows.length, t.files.size]).toEqual([1, files]);
    await refund(t, o.id, 1000, { note: "клиент перевёл дважды" });
    const history = t.orders.history.filter((h) => h.orderId === o.id);
    expect(history.map((h) => h.note).at(-1)).toMatch(/^Возврат 1\s000 ₸ клиенту \(перевод, без чека\)\. Причина: клиент перевёл дважды$/);
  });

  it("сводка денег заказа: сколько можно вернуть", async () => {
    const t = setup();
    const o = await t.order();
    await t.manual(o.id, o.amount + 700);
    expect(await t.money.summary(o.id)).toMatchObject({ due: o.amount, received: o.amount + 700, refundable: 700 });
  });
});

describe("«Перевести в печатную» (сотрудник)", () => {
  const digital = async (t: ReturnType<typeof setup>) => {
    t.books.books.set("book-1", { userId: "user-1", status: "draft", blocking: null });
    return t.place({ plan: "digital", delivery: { method: null, city: null, address: null, postalCode: null } });
  };

  it("получено больше цены печатной — заказ остаётся оплаченным, лишнее — переплата; файлы — событием", async () => {
    const t = setup();
    const o = await digital(t);
    await t.manual(o.id, 9900);
    await t.manual(o.id, 22000);
    const r = await t.svc.upgradeToPrinted({ orderId: o.id, plan: "hardcover" }, admin);
    expect(r).toMatchObject({ due: 30000, credited: 30000, outstanding: 0, overpaid: 1900 });
    const fresh = (await t.orders.findById(o.id))!;
    expect([fresh.plan, fresh.amount, fresh.status, fresh.isSettled, fresh.refundable]).toEqual(["hardcover", 30000, "paid", true, 1900]);
    expect(t.uow.types()).toContain("ordering.order_repriced");
    const note = t.orders.history.filter((h) => h.orderId === o.id).at(-1)?.note.replace(/\s/g, " ");
    expect(note).toMatch(/→ .+, зачтено 30 000 ₸, к доплате 0 ₸; переплата 1 900 ₸ — к возврату$/);
  });

  it("получено меньше — заказ ждёт доплату остатка; доплата пришла — оплачен и пойдёт в печать", async () => {
    const t = setup();
    const o = await digital(t);
    await t.manual(o.id, 9900);
    const r = await t.svc.upgradeToPrinted({ orderId: o.id, plan: "hardcover" }, admin);
    expect(r).toMatchObject({ due: 30000, credited: 9900, outstanding: 20100, overpaid: 0 });
    let fresh = (await t.orders.findById(o.id))!;
    expect([fresh.status, fresh.isSettled, fresh.outstanding]).toEqual(["pending_payment", false, 20100]);
    // Неоплаченный печатный — не в печать в обход оплаты.
    await expect(t.svc.changeStatus({ orderId: o.id, to: "in_production" }, admin)).rejects.toMatchObject({ code: "paymentRule" });
    expect(await t.manual(o.id, 20100)).toMatchObject({ settled: true, overpaid: 0 });
    fresh = (await t.orders.findById(o.id))!;
    expect([fresh.status, fresh.isSettled]).toEqual(["paid", true]);
  });

  it("уже печатный, отменённый и неоплаченный — отказ", async () => {
    const t = setup();
    const printed = await t.order();
    await t.manual(printed.id, printed.amount);
    await expect(t.svc.upgradeToPrinted({ orderId: printed.id, plan: "premium" }, admin)).rejects.toMatchObject({ code: "paymentRule", message: "Заказ уже на печатную книгу" });
    const unpaid = await digital(t);
    await expect(t.svc.upgradeToPrinted({ orderId: unpaid.id, plan: "hardcover" }, admin)).rejects.toMatchObject({ message: expect.stringContaining("ещё не оплачена") });
    await t.manual(unpaid.id, 9900);
    await expect(t.svc.upgradeToPrinted({ orderId: unpaid.id, plan: "digital" }, admin)).rejects.toMatchObject({ message: "Выберите печатный тариф" });
    await t.svc.changeStatus({ orderId: unpaid.id, to: "cancelled" }, admin);
    await expect(t.svc.upgradeToPrinted({ orderId: unpaid.id, plan: "hardcover" }, admin)).rejects.toMatchObject({ message: "Заказ отменён: оформите новый заказ" });
  });
});

