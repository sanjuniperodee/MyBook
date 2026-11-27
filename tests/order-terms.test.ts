import { describe, expect, it } from "vitest";
import { calculatePrice, Order } from "@/modules/ordering/domain";
import type { PromoCode } from "@/modules/ordering/domain";
import { receiptReuseAllowed, receiptUsedText } from "@/shared/domain/receipt";

const now = new Date("2026-10-25T10:00:00Z");
const planName = (id: string) => id;

/** Неоплаченный заказ на твёрдую обложку без договорённости. */
function place(agreement: Parameters<typeof Order.place>[0]["agreement"] = null) {
  return Order.place(
    {
      id: "o1",
      number: 1,
      userId: "u1",
      bookId: "b1",
      plan: "hardcover",
      quantity: 1,
      delivery: { method: "pickup", city: null, address: null, postalCode: null },
      addons: [],
      contact: { name: "A", phone: "+77010000000", email: "a@b.kz" },
      promo: null as PromoCode | null,
      agreement,
      currency: "KZT",
      paymentProvider: "kaspi",
      estimatedPages: 100,
      formatMoney: (n) => `${n}`,
    },
    now,
  );
}

describe("Order.changeTerms: тариф и договорённая цена неоплаченного заказа", () => {
  it("договорённая цена: разница идёт в скидку", () => {
    const order = place();
    order.changeTerms({ plan: "hardcover", agreedTotal: 25000, discount: null, planName }, "admin", now);
    const price = order.snapshot().price;
    expect(price.itemsAmount).toBe(30000);
    expect(price.discountAmount).toBe(5000);
    expect(order.amount).toBe(25000);
  });

  it("пустая цена возвращает прайс тарифа", () => {
    const order = place({ agreedTotal: 20000, prepaid: 0 });
    expect(order.amount).toBe(20000);
    order.changeTerms({ plan: "hardcover", agreedTotal: null, discount: null, planName }, "admin", now);
    expect(order.amount).toBe(30000);
  });

  it("смена тарифа на электронную версию убирает печать и доставку", () => {
    const order = place();
    order.changeTerms({ plan: "digital", agreedTotal: null, discount: null, planName }, "admin", now);
    const s = order.snapshot();
    expect(s.plan).toBe("digital");
    expect(s.quantity).toBe(1);
    expect(s.delivery.method).toBeNull();
    expect(order.amount).toBe(calculatePrice("digital", 1, null).amount);
  });

  it("предоплата остаётся авансом: к оплате — сумма минус внесённое", () => {
    const order = place({ agreedTotal: 30000, prepaid: 10000 });
    expect(order.amount).toBe(20000);
    order.changeTerms({ plan: "hardcover", agreedTotal: 22000, discount: null, planName }, "admin", now);
    expect(order.snapshot().price.prepaidAmount).toBe(10000);
    expect(order.amount).toBe(12000);
  });

  it("новая сумма меньше уже полученного: заказ оплачен, переплата к возврату", () => {
    const order = place();
    order.receiveMoney({ paymentId: "p1", amount: 10000, method: "manual", paidAt: now, label: "перевод", actor: "admin" });
    expect(order.status).toBe("pending_payment");
    order.changeTerms({ plan: "hardcover", agreedTotal: 8000, discount: null, planName }, "admin", now);
    expect(order.status).toBe("paid");
    expect(order.snapshot().paidAt).not.toBeNull();
  });

  it("оплаченный без права руководителя и отменённый заказы не меняются", () => {
    const paid = place();
    paid.markPaid(null, "admin", now);
    expect(() => paid.changeTerms({ plan: "premium", agreedTotal: null, discount: null, planName }, "admin", now)).toThrow(/оплачен/);
    const cancelled = place();
    cancelled.cancel("admin", "", now);
    expect(() => cancelled.changeTerms({ plan: "premium", agreedTotal: null, discount: null, planName }, "admin", now)).toThrow(/отменён/);
  });

  it("неверная сумма и неизвестный тариф отклоняются", () => {
    const order = place();
    expect(() => order.changeTerms({ plan: "hardcover", agreedTotal: 0, discount: null, planName }, "admin", now)).toThrow();
    expect(() => order.changeTerms({ plan: "nope" as never, agreedTotal: null, discount: null, planName }, "admin", now)).toThrow();
  });
});

describe("Order.changeTerms оплаченного заказа: руководитель меняет цену с причиной", () => {
  const types = (o: Order) => o.pullEvents().map((e) => e.type);
  /** Оплачен переводом полностью: по прайсу твёрдой обложки (30 000 ₸) или по договорённой цене. */
  const paidOrder = (agreed: number | null = null) => {
    const o = place();
    if (agreed) o.changeTerms({ plan: "hardcover", agreedTotal: agreed, discount: null, planName }, "manager", now);
    o.receiveMoney({ paymentId: "p1", amount: o.amount, method: "manual", paidAt: now, label: "перевод", actor: "admin" });
    expect(o.status).toBe("paid");
    o.pullEvents();
    o.pullHistory();
    return o;
  };
  const settled = { reason: "договорились на меньшую цену в переписке" };

  it("без права (settled) и без причины — отказ; тариф оплаченного не меняется", () => {
    const o = paidOrder();
    expect(() => o.changeTerms({ plan: "hardcover", agreedTotal: 25000, discount: null, planName }, "manager", now)).toThrow(/руководител/);
    expect(() => o.changeTerms({ plan: "hardcover", agreedTotal: 25000, discount: null, planName, settled: { reason: " " } }, "owner", now)).toThrow(/причину/);
    expect(() => o.changeTerms({ plan: "premium", agreedTotal: 25000, discount: null, planName, settled }, "owner", now)).toThrow(/тариф/);
    expect(o.amount).toBe(30000);
  });

  it("цена ниже полученного: заказ остаётся оплаченным, выручка — с прежней даты, переплата — задача; журнал с причиной", () => {
    const o = paidOrder();
    const r = o.changeTerms({ plan: "hardcover", agreedTotal: 25000, discount: null, planName, settled }, "owner", now);
    expect(r).toMatchObject({ wasPaid: true, previousAmount: 30000, amount: 25000, received: 30000, overpaid: 5000, outstanding: 0, reopened: false });
    expect([o.status, o.snapshot().paidAt]).toEqual(["paid", now]);
    expect(o.refundable).toBe(5000);
    expect(types(o)).toEqual(["ordering.order_repriced", "ordering.order_overpaid"]);
    expect(o.pullHistory().map((h) => h.note).join("\n")).toMatch(/Цена оплаченного заказа изменена: к оплате 30.000 ₸ → 25.000 ₸.*Причина: договорились/);
  });

  it("цена выше полученного: печатный «Оплачен» снова ждёт оплаты остатка, выручка снята до доплаты", () => {
    const o = paidOrder(26000);
    const r = o.changeTerms({ plan: "hardcover", agreedTotal: null, discount: null, planName, settled }, "owner", now);
    expect(r).toMatchObject({ amount: 30000, overpaid: 0, outstanding: 4000, reopened: true });
    expect([o.status, o.snapshot().paidAt, o.postpay, o.outstanding]).toEqual(["pending_payment", null, false, 4000]);
    // Доплата остатка — заказ снова оплачен датой денег.
    const later = new Date("2026-10-26T10:00:00Z");
    expect(o.receiveMoney({ paymentId: "p2", amount: 4000, method: "manual", paidAt: later, label: "перевод", actor: "admin" })).toMatchObject({ settled: true, overpaid: 0 });
    expect([o.status, o.snapshot().paidAt]).toEqual(["paid", later]);
  });

  it("цена выше полученного у заказа в печати: статус прежний, остаток ждём как постоплату; доставленному — задача", () => {
    const o = paidOrder(27000);
    // В печать — после согласования макета клиентом.
    const book = { fingerprint: "fp", bookOpen: false };
    o.approveLayout(book, now);
    o.changeStatus("in_production", "admin", "", now, book);
    o.changeStatus("delivered", "admin", "", now);
    o.pullEvents();
    o.changeTerms({ plan: "hardcover", agreedTotal: null, discount: null, planName, settled }, "owner", now);
    expect([o.status, o.snapshot().paidAt, o.postpay, o.outstanding]).toEqual(["delivered", null, true, 3000]);
    expect(types(o)).toEqual(["ordering.order_repriced", "ordering.postpay_due"]);
    o.receiveMoney({ paymentId: "p2", amount: 3000, method: "manual", paidAt: now, label: "перевод", actor: "admin" });
    expect([o.status, o.isSettled]).toEqual(["delivered", true]);
  });

  it("оплата подтверждена без денег в журнале — цену выше записанного не поставить (выручка не пропадёт); та же цена — без последствий", () => {
    const o = place();
    o.markPaid(null, "admin", now);
    expect(() => o.changeTerms({ plan: "hardcover", agreedTotal: 25000, discount: null, planName, settled }, "owner", now)).toThrow(/без денег в журнале/);
    const recorded = paidOrder();
    expect(recorded.changeTerms({ plan: "hardcover", agreedTotal: 30000, discount: null, planName, settled }, "owner", now).reopened).toBe(false);
  });
});

describe("Order.voidMoney: отмена ошибочного платежа", () => {
  it("фиктивная «доплата» отменена: получено меньше, оплаченный печатный снова ждёт оплату остатка", () => {
    const o = place();
    o.changeTerms({ plan: "hardcover", agreedTotal: 24000, discount: null, planName }, "admin", now);
    o.receiveMoney({ paymentId: "real", amount: 15000, method: "manual", paidAt: now, label: "перевод", actor: "m" });
    o.receiveMoney({ paymentId: "fake", amount: 9000, method: "manual", paidAt: now, label: "перевод", actor: "m" });
    expect(o.status).toBe("paid");
    const r = o.voidMoney({ kind: "payment", amount: 9000, label: "перевод", reason: "тот же чек, денег нет", actor: "owner", now });
    expect(r).toEqual({ received: 15000, outstanding: 9000, reopened: true });
    expect([o.status, o.snapshot().paidAt]).toEqual(["pending_payment", null]);
    expect(o.pullHistory().at(-2)!.note).toMatch(/отменён как ошибочный.*Причина: тот же чек.*24.000 ₸ → 15.000 ₸/);
  });

  it("лишний платёж у переплаченного — заказ остаётся оплаченным; без причины — отказ; отмена ошибочного возврата — задача на переплату", () => {
    const o = place();
    o.receiveMoney({ paymentId: "a", amount: 30000, method: "manual", paidAt: now, label: "перевод", actor: "m" });
    o.receiveMoney({ paymentId: "b", amount: 2000, method: "manual", paidAt: now, label: "перевод", actor: "m" });
    expect(() => o.voidMoney({ kind: "payment", amount: 2000, label: "перевод", reason: "", actor: "owner", now })).toThrow(/причину/);
    expect(o.voidMoney({ kind: "payment", amount: 2000, label: "перевод", reason: "дубль записи", actor: "owner", now })).toEqual({ received: 30000, outstanding: 0, reopened: false });
    expect(o.isSettled).toBe(true);
    o.pullEvents();
    o.voidMoney({ kind: "refund", amount: 1000, label: "перевод", reason: "возврат не делали", actor: "owner", now });
    expect(o.received).toBe(31000);
    expect(o.pullEvents().map((e) => e.type)).toEqual(["ordering.order_overpaid"]);
  });

  it("фиктивная пара «платёж 9 000 + возврат 9 000» отменяется одной операцией: получено то же, без «переплаты» и «ждёт доплату»", () => {
    const o = place();
    o.receiveMoney({ paymentId: "a", amount: 30000, method: "manual", paidAt: now, label: "перевод", actor: "m" });
    o.receiveMoney({ paymentId: "b", amount: 9000, method: "manual", paidAt: now, label: "перевод", actor: "m" });
    o.refundMoney({ amount: 9000, paidAt: now, label: "перевод", reason: "Ааааа", actor: "m" });
    const paidAt = o.snapshot().paidAt;
    o.pullEvents();
    const r = o.voidMoney({ kind: "refund", amount: 9000, label: "возврат", reason: "фиктивная пара, денег не было", actor: "owner", now, also: [{ kind: "payment", amount: 9000, label: "перевод" }] });
    expect(r).toEqual({ received: 30000, outstanding: 0, reopened: false });
    expect([o.status, o.isSettled, o.snapshot().paidAt]).toEqual(["paid", true, paidAt]);
    expect(o.pullEvents()).toEqual([]);
  });

  it("отменили ошибочный возврат у заказа, который ждал доплату, — денег хватает: заказ снова оплачен", () => {
    const o = place();
    const due = o.amount;
    o.receiveMoney({ paymentId: "a", amount: due, method: "manual", paidAt: now, label: "перевод", actor: "m" });
    o.receiveMoney({ paymentId: "b", amount: 1000, method: "manual", paidAt: now, label: "перевод", actor: "m" });
    o.refundMoney({ amount: 1000, paidAt: now, label: "перевод", reason: "лишнее", actor: "m" });
    o.voidMoney({ kind: "payment", amount: due, label: "перевод", reason: "не тот чек", actor: "owner", now });
    o.receiveMoney({ paymentId: "c", amount: due - 1000, method: "manual", paidAt: now, label: "перевод", actor: "m" });
    expect([o.status, o.isSettled]).toEqual(["pending_payment", false]);
    o.voidMoney({ kind: "refund", amount: 1000, label: "перевод", reason: "возврат не делали", actor: "owner", now });
    expect([o.received, o.status, o.isSettled]).toEqual([due, "paid", true]);
  });

  it("электронная (клиент уже получил книгу): статус прежний, остаток — постоплатой", () => {
    const o = Order.place(
      { id: "o3", number: 3, userId: "u1", bookId: "b1", plan: "digital", quantity: 1, delivery: { method: null, city: null, address: null, postalCode: null }, addons: [], contact: { name: "A", phone: "+77010000000", email: "a@b.kz" }, promo: null, currency: "KZT", paymentProvider: "kaspi", estimatedPages: 100, formatMoney: (n) => `${n}` },
      now,
    );
    o.receiveMoney({ paymentId: "a", amount: o.amount, method: "manual", paidAt: now, label: "перевод", actor: "m" });
    o.voidMoney({ kind: "payment", amount: o.amount, label: "перевод", reason: "не тот заказ", actor: "owner", now });
    expect([o.status, o.postpay, o.isSettled, o.outstanding]).toEqual(["paid", true, false, o.amount]);
  });
});

describe("Order.upgradeToPrinted и refundMoney: электронная — в печатную, возврат переплаты", () => {
  const digital = (agreement: Parameters<typeof Order.place>[0]["agreement"] = null) =>
    Order.place(
      { id: "o2", number: 2, userId: "u1", bookId: "b1", plan: "digital", quantity: 1, delivery: { method: null, city: null, address: null, postalCode: null }, addons: [], contact: { name: "A", phone: "+77010000000", email: "a@b.kz" }, promo: null, agreement, currency: "KZT", paymentProvider: "kaspi", estimatedPages: 100, formatMoney: (n) => `${n}` },
      now,
    );
  const pay = (o: Order, amount: number) => o.receiveMoney({ paymentId: `m:${amount}`, amount, method: "manual", paidAt: now, label: "перевод", actor: "admin" });

  it("предоплата по сделке остаётся авансом; денег не хватает — отказ с суммой, заказ не меняется", () => {
    const o = digital({ agreedTotal: Number.POSITIVE_INFINITY, prepaid: 5000 });
    expect(o.amount).toBe(4900);
    pay(o, 4900);
    expect(() => o.upgradeToPrinted({ plan: "hardcover", discount: null, planName }, "admin", now)).toThrow(/Не хватает 20/);
    expect([o.plan, o.status, o.isSettled]).toEqual(["digital", "paid", true]);
    // Доплату приняли — перевод проходит, заказ остаётся оплаченным, предоплата по сделке — авансом.
    pay(o, 20100);
    const r = o.upgradeToPrinted({ plan: "hardcover", discount: null, planName }, "admin", now);
    expect(r).toEqual({ due: 25000, credited: 25000, outstanding: 0, overpaid: 0 });
    expect([o.plan, o.status, o.isSettled, o.snapshot().price.prepaidAmount]).toEqual(["hardcover", "paid", true, 5000]);
    expect(o.pullEvents().map((e) => e.type)).toContain("ordering.order_repriced");
  });

  it("переплата после перевода — возвращается; больше переплаты — нельзя", () => {
    const o = digital();
    pay(o, 32000);
    o.upgradeToPrinted({ plan: "hardcover", discount: null, planName }, "admin", now);
    expect([o.status, o.refundable]).toEqual(["paid", 2000]);
    expect(() => o.refundMoney({ amount: 2001, paidAt: now, label: "перевод", reason: "лишнее", actor: "admin" })).toThrow(/не больше/);
    expect(o.refundMoney({ amount: 2000, paidAt: now, label: "перевод", reason: "лишнее", actor: "admin" })).toEqual({ refundable: 0 });
    expect([o.received, o.isSettled]).toEqual([30000, true]);
  });

  it("неоплаченная электронная, печатная, отменённая и не печатный тариф — отказ", () => {
    expect(() => digital().upgradeToPrinted({ plan: "hardcover", discount: null, planName }, "admin", now)).toThrow(/не оплачена/);
    const printed = place();
    printed.markPaid(null, "admin", now);
    expect(() => printed.upgradeToPrinted({ plan: "premium", discount: null, planName }, "admin", now)).toThrow(/уже на печатную/);
    const paid = digital();
    pay(paid, 9900);
    expect(() => paid.upgradeToPrinted({ plan: "digital", discount: null, planName }, "admin", now)).toThrow(/печатный тариф/);
    paid.cancel("admin", "", now);
    expect(() => paid.upgradeToPrinted({ plan: "hardcover", discount: null, planName }, "admin", now)).toThrow(/отменён/);
  });
});

describe("Повтор чека: что можно, что нельзя", () => {
  const use = { source: "order" as const, number: 110, amount: 15000, paidAt: new Date("2026-11-23T08:00:00Z"), clientId: "c1", orderId: "o110", dealId: null };
  it("та же покупка (заказ или его сделка) и чужой клиент — нельзя; другая сделка того же клиента (пакет книг) — можно", () => {
    expect(receiptReuseAllowed(use, { clientId: "c1", orderId: "o110", dealId: null })).toBe(false);
    expect(receiptReuseAllowed(use, { clientId: "c1", orderId: "o110", dealId: "d1558" })).toBe(false);
    expect(receiptReuseAllowed({ ...use, source: "deal", orderId: null, dealId: "d1632" }, { clientId: "c1", orderId: null, dealId: "d1632" })).toBe(false);
    expect(receiptReuseAllowed(use, { clientId: "c2", orderId: "o99", dealId: null })).toBe(false);
    expect(receiptReuseAllowed(use, { clientId: null, orderId: null, dealId: "d1" })).toBe(false);
    expect(receiptReuseAllowed({ ...use, source: "deal", orderId: null, dealId: "d1641" }, { clientId: "c1", orderId: null, dealId: "d1642" })).toBe(true);
  });
  it("текст отказа — к какому платежу приложен", () => {
    expect(receiptUsedText(use)).toMatch(/^Этот чек уже приложен к платежу 15\s000 ₸ от 23 ноября 2026 г\. заказа №110\./);
    expect(receiptUsedText({ ...use, source: "deal", number: 1537, amount: 0, paidAt: null })).toMatch(/^Этот чек уже приложен к платежу сделки Д1537\./);
  });
});
