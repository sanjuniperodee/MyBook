import { describe, expect, it } from "vitest";
import { Order, OrderingError } from "@/modules/ordering/domain";
import { isAgree, isDecline } from "@/modules/messaging/domain/botNlu";

describe("бот: согласие на предложение", () => {
  it.each(["не готова", "не готов", "не берём", "не беру", "не присылайте", "не отправляйте", "давайте уточню у мужа", "давайте обсудим", "давайте потом", "қажет емес"])("«%s» — не согласие", (t) => {
    expect(isAgree(t)).toBe(false);
  });
  it.each(["да", "да, давайте", "оформляем", "присылайте", "иә", "ок", "давайте оформим на маму"])("«%s» — согласие", (t) => {
    expect(isAgree(t)).toBe(true);
  });
  it("«қызықтырмайды» — отказ", () => {
    expect(isDecline("маған қызықтырмайды")).toBe(true);
  });
});

describe("заказ: отменённый неоплаченный не обходит оплату", () => {
  const now = new Date();
  it.each(["in_production", "paid", "delivered", "shipped"] as const)("cancelled → %s без оплаты — ошибка", (to) => {
    const o = Order.restore("o1", { ...setupSnapshot(), status: "cancelled" } as never);
    expect(() => o.changeStatus(to, "x", "", now)).toThrow(OrderingError);
    expect(o.status).toBe("cancelled");
  });
  it("оплаченный заказ, отменённый по ошибке, можно вернуть", () => {
    const o = Order.restore("o1", { ...setupSnapshot(), status: "cancelled", paidAt: now } as never);
    o.changeStatus("in_production", "x", "", now);
    expect(o.status).toBe("in_production");
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
    postpay: false,
    receivedAmount: 0,
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

