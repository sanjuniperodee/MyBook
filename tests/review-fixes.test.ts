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


import { safeContactName } from "@/modules/messaging/domain";
import { findSensitive } from "@/modules/messaging/domain/sensitive";

describe("имя контакта с номером", () => {
  it.each([
    ["+7 701 234 56 78", "…5678"],
    ["77012345678", "…5678"],
    ["Мама 8 (701) 234-56-78", "Мама …5678"],
    ["Айгерим", "Айгерим"],
    ["Азамат 2024", "Азамат 2024"],
  ])("«%s» → «%s»", (name, out) => {
    expect(safeContactName(name)).toBe(out);
  });
});

describe("«левак»: номера не только казахстанские", () => {
  it.each(["пишите +7 916 123 45 67", "8 495 123-45-67", "8-800-555-35-35", "+90 532 123 45 67", "٧٧٠١٢٣٤٥٦٧٨", "9161234567"])("«%s» — номер", (t) => {
    expect(findSensitive(t).some((f) => f.kind === "phone")).toBe(true);
  });
  it.each(["оплата 10 000 20 000", "итого 1 200 000", "заказ №1234567890", "77 01 2025"])("«%s» — не номер", (t) => {
    expect(findSensitive(t).some((f) => f.kind === "phone")).toBe(false);
  });
  it("номер клиента и магазина разрешён в любом виде", () => {
    expect(findSensitive("мой номер +7 916 123 45 67", ["89161234567"])).toEqual([]);
  });
});
