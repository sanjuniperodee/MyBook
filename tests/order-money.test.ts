import { describe, expect, it } from "vitest";
import { orderMoney } from "@/modules/ordering/ui/money";

const paidAt = new Date("2026-10-12T13:15:00Z");

describe("orderMoney: цена, оплачено, долг в списке заказов", () => {
  it("предоплата по сделке и оплата заказа — оплачен полностью (Насиба)", () => {
    expect(orderMoney({ amount: 10000, prepaidAmount: 10000, receivedAmount: 10000, paidAt, status: "delivered" })).toEqual({ price: 20000, paid: 20000, debt: 0 });
  });
  it("всё внесено предоплатой, к оплате 0 (Бибарс)", () => {
    expect(orderMoney({ amount: 0, prepaidAmount: 20000, receivedAmount: 0, paidAt, status: "in_production" })).toEqual({ price: 20000, paid: 20000, debt: 0 });
  });
  it("оплачен без записи платежа — оплачен на «к оплате»", () => {
    expect(orderMoney({ amount: 9900, prepaidAmount: 0, receivedAmount: 0, paidAt, status: "paid" })).toEqual({ price: 9900, paid: 9900, debt: 0 });
  });
  it("постоплата не получена — долг остаток", () => {
    expect(orderMoney({ amount: 10000, prepaidAmount: 10000, receivedAmount: 4000, paidAt: null, status: "in_production" })).toEqual({ price: 20000, paid: 14000, debt: 6000 });
  });
  it("бесплатный и отменённый — без долга", () => {
    expect(orderMoney({ amount: 0, prepaidAmount: 0, receivedAmount: 0, paidAt, status: "paid" })).toEqual({ price: 0, paid: 0, debt: 0 });
    expect(orderMoney({ amount: 10000, prepaidAmount: 0, receivedAmount: 0, paidAt: null, status: "cancelled" }).debt).toBe(0);
  });
});
