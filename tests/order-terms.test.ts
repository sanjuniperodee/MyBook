import { describe, expect, it } from "vitest";
import { calculatePrice, Order } from "@/modules/ordering/domain";
import type { PromoCode } from "@/modules/ordering/domain";

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

  it("оплаченный и отменённый заказы не меняются", () => {
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
