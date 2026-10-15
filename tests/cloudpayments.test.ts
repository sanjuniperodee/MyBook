import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { GiftsService } from "@/modules/ordering/application/GiftsService";
import { CloudPaymentsWebhook } from "@/modules/ordering/infrastructure/payments/CloudPayments";
import { MemGifts, setup } from "./doubles/ordering";
import { formatPrice } from "@/config/site";

// Адаптер уведомлений CloudPayments поверх настоящих OrdersService и GiftsService с хранилищами в памяти.
function cloudSetup(secret: string | undefined = "cp-secret") {
  const base = setup();
  const gifts = new MemGifts();
  const giftsService = new GiftsService(gifts, base.promos, { giftCode: () => "GIFT-CLOUD-0001", giftToken: () => "c".repeat(24) }, { provider: () => "cloudpayments", currency: () => "KZT" }, base.uow, base.c, () => "2026-10-01");
  return { ...base, gifts, giftsService, webhook: new CloudPaymentsWebhook(base.svc, giftsService, () => secret) };
}

const payment = (invoice: string, amount: number, extra: Record<string, string> = {}) => ({ InvoiceId: invoice, Amount: String(amount), Currency: "KZT", TransactionId: "3001", ...extra });
const count = (types: string[], type: string) => types.filter((t) => t === type).length;

describe("CloudPayments: уведомления о заказе", () => {
  it("повторное pay идемпотентно: заказ подтверждается один раз, событие order_paid одно", async () => {
    const t = cloudSetup();
    const order = await t.place();
    const body = payment(String(order.number), order.amount);
    expect(await t.webhook.handle("pay", body)).toBe(0);
    expect(await t.webhook.handle("pay", body)).toBe(0);
    expect(t.orders.rows.get(order.id)).toMatchObject({ status: "paid", paymentId: "3001" });
    expect(t.orders.history.filter((h) => h.status === "paid")).toEqual([{ orderId: order.id, note: "Платёж 3001", status: "paid" }]);
    expect(count(t.uow.types(), "ordering.order_paid")).toBe(1);
  });

  it("второй платёж по оплаченному заказу (другой TransactionId): заказ не меняется, заметка «нужен возврат», как у Kaspi (B13)", async () => {
    const t = cloudSetup();
    const order = await t.place();
    const first = payment(String(order.number), order.amount);
    const second = { ...first, TransactionId: "3002" };
    // Две вкладки оплаты: оба платежа прошли check, пока заказ ждал оплаты.
    expect([await t.webhook.handle("check", first), await t.webhook.handle("check", second)]).toEqual([0, 0]);
    await t.webhook.handle("pay", first);
    const history = [...t.orders.history];
    expect(await t.webhook.handle("pay", second)).toBe(0);
    expect(t.orders.rows.get(order.id)).toMatchObject({ status: "paid", paymentId: "3001" });
    expect(t.orders.history.slice(history.length)).toEqual([{ orderId: order.id, status: null, note: `CloudPayments: повторная оплата ${formatPrice(order.amount)} (операция 3002), заказ уже «paid» — нужен возврат` }]);
    expect(count(t.uow.types(), "ordering.order_paid")).toBe(1);
    // тот же платёж повторно — без заметки
    await t.webhook.handle("pay", first);
    expect(t.orders.history).toHaveLength(history.length + 1);
  });

  it("pay по отменённому заказу — 0, заказ остаётся отменённым, заметка «нужен возврат» (B13)", async () => {
    const t = cloudSetup();
    const order = await t.place();
    await t.svc.cancelByCustomer(order.id, "user-1");
    const history = [...t.orders.history];
    expect(await t.webhook.handle("pay", payment(String(order.number), order.amount))).toBe(0);
    expect(t.orders.rows.get(order.id)!.status).toBe("cancelled");
    expect(t.orders.history.slice(history.length)).toEqual([{ orderId: order.id, status: null, note: `CloudPayments: повторная оплата ${formatPrice(order.amount)} (операция 3001), заказ уже «cancelled» — нужен возврат` }]);
    expect(count(t.uow.types(), "ordering.order_paid")).toBe(0);
  });

  it("check: ждёт оплаты — 0, оплачен — 13; неизвестный счёт — 10, другая сумма или валюта — 12", async () => {
    const t = cloudSetup();
    const order = await t.place();
    const body = payment(String(order.number), order.amount);
    expect(await t.webhook.handle("check", body)).toBe(0);
    expect(await t.webhook.handle("check", { ...body, InvoiceId: "999" })).toBe(10);
    expect(await t.webhook.handle("check", { ...body, Amount: String(order.amount - 1) })).toBe(12);
    expect(await t.webhook.handle("pay", { ...body, Currency: "USD" })).toBe(12);
    expect(t.orders.rows.get(order.id)!.status).toBe("pending_payment");
    await t.webhook.handle("pay", body);
    expect(await t.webhook.handle("check", body)).toBe(13);
  });

  it("fail после оплаты только пишет в журнал, заказ остаётся оплаченным", async () => {
    const t = cloudSetup();
    const order = await t.place();
    const body = payment(String(order.number), order.amount);
    await t.webhook.handle("pay", body);
    expect(await t.webhook.handle("fail", { ...body, Reason: "InsufficientFunds" })).toBe(0);
    expect(t.orders.rows.get(order.id)!.status).toBe("paid");
    expect(t.orders.history.at(-1)).toMatchObject({ note: "Неуспешная оплата: InsufficientFunds", status: null });
    expect(count(t.uow.types(), "ordering.order_paid")).toBe(1);
  });
});

describe("CloudPayments: уведомления о сертификате", () => {
  it("повторное pay по счёту G<номер> выпускает код один раз", async () => {
    const t = cloudSetup();
    const gift = await t.giftsService.purchase({ plan: "hardcover", buyerUserId: null, buyerName: "А", buyerEmail: "a@b.kz", buyerPhone: "", recipientName: "Б", recipientEmail: null, sendAt: null, message: "", locale: "ru", buyerLocale: "ru" });
    const body = payment(`G${gift.number}`, gift.amount, { TransactionId: "4001" });
    expect(await t.webhook.handle("check", body)).toBe(0);
    expect(await t.webhook.handle("pay", body)).toBe(0);
    expect(await t.webhook.handle("pay", body)).toBe(0);
    expect(t.gifts.rows.get(gift.id)).toMatchObject({ status: "paid", paymentId: "4001" });
    expect([...t.promos.rows.values()].map((p) => p.code)).toEqual(["GIFT-CLOUD-0001"]);
    expect(count(t.uow.types(), "ordering.gift_paid")).toBe(1);
    expect(await t.webhook.handle("check", body)).toBe(13);
    expect(await t.webhook.handle("pay", { ...body, InvoiceId: "G8" })).toBe(10);
  });
});

describe("CloudPayments: подпись", () => {
  it("base64(HMAC-SHA256 тела); без подписи, с чужой подписью или без секрета — отказ", () => {
    const raw = "InvoiceId=101&Amount=49900";
    const sign = (secret: string) => createHmac("sha256", secret).update(raw, "utf8").digest("base64");
    const { webhook } = cloudSetup();
    expect(webhook.verify(raw, sign("cp-secret"))).toBe(true);
    expect(webhook.verify(raw, sign("other"))).toBe(false);
    expect(webhook.verify(`${raw}0`, sign("cp-secret"))).toBe(false);
    expect(webhook.verify(raw, null)).toBe(false);
    expect(cloudSetup(undefined).webhook.verify(raw, sign(""))).toBe(false);
  });
});
