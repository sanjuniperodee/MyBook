import { describe, expect, it } from "vitest";
import { consoleLogger } from "@/shared/application";
import { isPayToken, payComment } from "@/modules/ordering/domain";
import { DealInvoicesService } from "@/modules/ordering/application/DealInvoicesService";
import { GiftsService } from "@/modules/ordering/application/GiftsService";
import { KaspiPaymentsService } from "@/modules/ordering/application/KaspiPaymentsService";
import { CloudPaymentsWebhook } from "@/modules/ordering/infrastructure/payments/CloudPayments";
import { FakeUow, MemGifts, MemPromos, setup } from "./doubles/ordering";
import { FakeInvoiceSales, FakeKaspi, MemDealInvoices, MemInvoices, type LockLog } from "./doubles/kaspi";

/**
 * Платёжные системы для счёта из чата (docs/features/chat-invoices.md, 2.1–2.3): Kaspi с целью deal_invoice,
 * CloudPayments с InvoiceId «P<n>», ссылка /pay/<token>. Деньги и статус счёта решает DealInvoicesService; здесь —
 * что платёжные системы доводят до него каждую операцию ровно один раз и в правильном порядке блокировок.
 */
function dealSetup() {
  const base = setup();
  const locks: LockLog = [];
  const attempts = new MemInvoices(locks);
  const deals = new MemDealInvoices(locks);
  const sales = new FakeInvoiceSales(locks);
  const gifts = new MemGifts();
  const promos = new MemPromos();
  const uow = new FakeUow([attempts, deals, sales, base.orders, gifts, promos]);
  const invoices = new DealInvoicesService(deals, sales, uow, base.c);
  const giftsService = new GiftsService(gifts, promos, { giftCode: () => "GIFT-DEAL-0001", giftToken: () => "d".repeat(24) }, { provider: () => "manual", currency: () => "KZT" }, uow, base.c, () => "2026-10-01");
  const kaspi = new FakeKaspi();
  const logger = { ...consoleLogger("test"), warn: () => {}, error: () => {} };
  const ports = { repo: deals, service: invoices, sales, clock: base.c };
  const svc = new KaspiPaymentsService(attempts, base.orders, gifts, base.svc, giftsService, kaspi, async () => true, uow, base.c, logger, ports);
  const cloud = new CloudPaymentsWebhook(base.svc, giftsService, () => "cp-secret", ports);
  sales.addDeal("deal-1");
  const issue = async (amount = 15000, dealId = "deal-1") =>
    (await invoices.issue({ dealId, conversationId: null, phone: "77011234567", clientName: "Айжан", locale: "ru", channel: "whatsapp", plan: "hardcover", agreedTotal: 30000, amount, purpose: "prepayment", actor: { userId: "staff-1", label: "staff" }, maxDiscountPercent: null })).invoice;
  const paid = (externalId: string, amount: number | null) => ({ event: "payment.success", externalId, method: "invoice", status: "Processed", amount }) as const;
  const count = (type: string) => uow.types().filter((t) => t === type).length;
  const dealInvoice = async (id: string) => (await deals.findById(id))!.snapshot();
  return { ...base, ordersSvc: base.svc, locks, attempts, deals, sales, uow, invoices, kaspi, svc, cloud, issue, paid, count, dealInvoice };
}

describe("ссылка /pay/<token>", () => {
  it("токен — ровно 43 знака base64url; остальное отсекается до базы", () => {
    expect(isPayToken("A".repeat(43))).toBe(true);
    expect(isPayToken("aZ09_-".repeat(7) + "x")).toBe(true);
    expect(isPayToken("A".repeat(42))).toBe(false);
    expect(isPayToken("A".repeat(44))).toBe(false);
    expect(isPayToken(`${"A".repeat(42)}+`)).toBe(false);
    expect(isPayToken(`${"A".repeat(42)}/`)).toBe(false);
    expect(isPayToken(`${"A".repeat(40)}' or`)).toBe(false);
    expect(isPayToken(null)).toBe(false);
    expect(isPayToken(42)).toBe(false);
  });

  it("выпущенный счёт получает такой токен; комментарий к платежу — «MyBooks P<n>»", async () => {
    const t = dealSetup();
    const invoice = await t.issue();
    expect(isPayToken(invoice.token)).toBe(true);
    expect(invoice.label).toBe("P12");
    expect(payComment(invoice.label)).toBe("MyBooks P12");
  });
});

describe("Kaspi: счёт из чата", () => {
  it("по ссылке: сумма — сумма счёта, номер по умолчанию — из счёта; вебхук «оплачено» записывает платёж по операции один раз", async () => {
    const t = dealSetup();
    const invoice = await t.issue();
    const attempt = await t.svc.payDealInvoice(invoice.token, { method: "invoice", phone: "" });
    expect(t.kaspi.created).toEqual([{ method: "invoice", phone: "77011234567", amount: 15000, comment: "MyBooks P12" }]);
    expect(attempt.target).toEqual({ kind: "deal_invoice", id: invoice.id });
    expect(await t.svc.onWebhook(t.paid(attempt.externalId, 15000), true)).toBe("ok");
    expect(await t.dealInvoice(invoice.id)).toMatchObject({ status: "paid", paidMethod: "kaspi", paidRef: attempt.externalId, accessStatus: "due" });
    expect(t.sales.payments).toEqual([{ id: "pay-1", dealId: "deal-1", amount: 15000, method: "kaspi", externalRef: attempt.externalId, invoiceId: invoice.id }]);
    // Повтор той же операции (вебхук ещё раз, сверка, страница клиента) — ни денег, ни события.
    await t.svc.onWebhook(t.paid(attempt.externalId, 15000), true);
    t.kaspi.statuses.set(attempt.externalId, { status: "Processed", amount: 15000 });
    await t.svc.reconcile(3600_000);
    await t.svc.reconcileDealInvoices(8 * 86_400_000);
    expect(t.sales.payments).toHaveLength(1);
    expect(t.count("ordering.deal_invoice_paid")).toBe(1);
    expect(t.count("ordering.deal_invoice_extra_money")).toBe(0);
  });

  it("клиент ввёл свой номер — счёт Kaspi на него; городской номер — отказ", async () => {
    const t = dealSetup();
    const invoice = await t.issue();
    await t.svc.payDealInvoice(invoice.token, { method: "invoice", phone: "+7 705 000 00 11" });
    expect(t.kaspi.created.at(-1)).toMatchObject({ phone: "77050000011", amount: 15000 });
    await expect(t.svc.payDealInvoice(invoice.token, { method: "invoice", phone: "+7 727 000 00 00" })).rejects.toMatchObject({ code: "phoneInvalid" });
    await expect(t.svc.payDealInvoice("x".repeat(43), { method: "qr" })).rejects.toMatchObject({ code: "invoiceNotFound" });
  });

  it("блокировки: счёт из чата — до попытки Kaspi, сделка — последней (тот же порядок, что у ручного подтверждения)", async () => {
    const t = dealSetup();
    const invoice = await t.issue();
    const attempt = await t.svc.payDealInvoice(invoice.token, { method: "qr" });
    t.locks.length = 0;
    await t.svc.onWebhook({ ...t.paid(attempt.externalId, 15000), method: "qr" }, true);
    expect(t.locks.slice(0, 2)).toEqual(["deal_invoices", "payment_invoices"]);
    expect(t.locks.indexOf("crm_deals")).toBeGreaterThan(t.locks.indexOf("payment_invoices"));
  });

  it("сумма в уведомлении не совпала — попытка «failed», счёт ждёт, денег нет", async () => {
    const t = dealSetup();
    const invoice = await t.issue();
    const attempt = await t.svc.payDealInvoice(invoice.token, { method: "qr" });
    await t.svc.onWebhook({ ...t.paid(attempt.externalId, 1), method: "qr" }, true);
    expect((await t.attempts.findById(attempt.id))!.snapshot()).toMatchObject({ status: "failed", providerStatus: "AmountMismatch:1" });
    expect((await t.dealInvoice(invoice.id)).status).toBe("pending_payment");
    expect(t.sales.payments).toEqual([]);
  });

  it("счёт уже оплачен переводом, а прошла и попытка Kaspi — деньги записаны, «повторная оплата — нужен возврат», доступ второй раз не выдаётся", async () => {
    const t = dealSetup();
    const invoice = await t.issue();
    const attempt = await t.svc.payDealInvoice(invoice.token, { method: "invoice" });
    await t.uow.run(() => t.invoices.markPaidManually({ invoiceId: invoice.id, dealId: "deal-1", paymentId: "manual-1" }));
    await expect(t.svc.payDealInvoice(invoice.token, { method: "qr" })).rejects.toMatchObject({ code: "notPayable" });
    await t.svc.onWebhook(t.paid(attempt.externalId, 15000), true);
    expect(t.sales.payments).toHaveLength(1);
    expect(t.count("ordering.deal_invoice_paid")).toBe(1);
    expect(t.uow.published.find((e) => e.type === "ordering.deal_invoice_extra_money")?.payload).toMatchObject({ reason: "overpaid", recorded: true, ref: attempt.externalId });
  });

  it("по сделке уже заказ — по ссылке не платят; пришедшая оплата в сделку не пишется, событие «нужен возврат или зачёт»", async () => {
    const t = dealSetup();
    const invoice = await t.issue();
    const attempt = await t.svc.payDealInvoice(invoice.token, { method: "invoice" });
    t.sales.addDeal("deal-1", { orderId: "order-7" });
    await expect(t.svc.payDealInvoice(invoice.token, { method: "qr" })).rejects.toMatchObject({ code: "notPayable" });
    await expect(t.svc.pushDealInvoice(invoice.id, "77011234567")).rejects.toMatchObject({ code: "notPayable" });
    await t.svc.onWebhook(t.paid(attempt.externalId, 15000), true);
    expect(t.sales.payments).toEqual([]);
    expect(t.uow.published.find((e) => e.type === "ordering.deal_invoice_extra_money")?.payload).toMatchObject({ reason: "order", recorded: false });
  });

  it("неизвестная цель оплаты — ошибка, а не «как заказ»: попытка остаётся ждущей, заказы не тронуты", async () => {
    const t = dealSetup();
    const order = await t.place();
    const attempt = await t.svc.payOrder(order.id, "user-1", { method: "qr" });
    const row = t.attempts.rows.get(attempt.id)!;
    t.attempts.rows.set(attempt.id, { ...row, target: { kind: "voucher", id: order.id } as never });
    await expect(t.svc.onWebhook({ ...t.paid(attempt.externalId, order.amount), method: "qr" }, true)).rejects.toMatchObject({ code: "paymentRule" });
    expect(t.attempts.rows.get(attempt.id)!.status).toBe("pending");
    expect((await t.orders.findById(order.id))!.status).toBe("pending_payment");
    await expect(t.svc.status(attempt.id, { userId: "user-1" })).rejects.toMatchObject({ code: "paymentRule" });
  });

  it("сервис без счетов из чата: попытка deal_invoice — ошибка, заказ с тем же id не подтверждается", async () => {
    const t = dealSetup();
    const order = await t.place();
    const bare = new KaspiPaymentsService(t.attempts, t.orders, new MemGifts(), t.ordersSvc, {} as never, t.kaspi, async () => true, t.uow, t.c, { ...consoleLogger("test"), warn: () => {}, error: () => {} });
    const invoice = await t.issue();
    const attempt = await t.svc.payDealInvoice(invoice.token, { method: "qr" });
    // Подменяем id цели на id заказа: «как заказ» подтвердило бы его.
    t.attempts.rows.set(attempt.id, { ...t.attempts.rows.get(attempt.id)!, target: { kind: "deal_invoice", id: order.id } });
    await expect(bare.onWebhook({ ...t.paid(attempt.externalId, order.amount), method: "qr" }, true)).rejects.toMatchObject({ code: "invoiceNotFound" });
    expect((await t.orders.findById(order.id))!.status).toBe("pending_payment");
  });

  it("статус и отмена по ссылке: держатель токена счёта — да; чужой токен и владелец заказа — «счёт не найден»", async () => {
    const t = dealSetup();
    const invoice = await t.issue();
    const attempt = await t.svc.payDealInvoice(invoice.token, { method: "invoice" });
    expect((await t.svc.status(attempt.id, { dealInvoiceToken: invoice.token })).id).toBe(attempt.id);
    await expect(t.svc.status(attempt.id, { dealInvoiceToken: "y".repeat(43) })).rejects.toMatchObject({ code: "invoiceNotFound" });
    await expect(t.svc.status(attempt.id, { userId: "user-1" })).rejects.toMatchObject({ code: "invoiceNotFound" });
    await expect(t.svc.status(attempt.id, { giftToken: invoice.token })).rejects.toMatchObject({ code: "invoiceNotFound" });
  });

  it("счёт Kaspi на номер из CRM: тот же номер повторно — тот же счёт", async () => {
    const t = dealSetup();
    const invoice = await t.issue();
    const a = await t.svc.pushDealInvoice(invoice.id, "77011234567");
    const b = await t.svc.pushDealInvoice(invoice.id, "+7 701 123 45 67");
    expect(b.id).toBe(a.id);
    expect(t.kaspi.created).toEqual([{ method: "invoice", phone: "77011234567", amount: 15000, comment: "MyBooks P12" }]);
    expect(a.snapshot()).toMatchObject({ method: "invoice", phone: "77011234567", target: { kind: "deal_invoice", id: invoice.id } });
  });

  it("смена способа: прежнюю попытку отменяем только после ответа Kaspi «не оплачено»", async () => {
    const t = dealSetup();
    const invoice = await t.issue();
    const first = await t.svc.pushDealInvoice(invoice.id, "77011234567");
    // Kaspi не отвечает — второй счёт не выставляем, прежний остаётся ждущим (его досмотрит сверка).
    t.kaspi.detailsDown = true;
    await expect(t.svc.payDealInvoice(invoice.token, { method: "qr" })).rejects.toMatchObject({ code: "kaspiUnavailable" });
    expect(t.attempts.rows.get(first.id)!.status).toBe("pending");
    expect(t.kaspi.cancelled).toEqual([]);
    // Kaspi ответил «ждёт оплаты» — счёт отменяется в Kaspi и у нас, выставляется QR.
    t.kaspi.detailsDown = false;
    const qr = await t.svc.payDealInvoice(invoice.token, { method: "qr" });
    expect(t.kaspi.cancelled).toEqual([first.externalId]);
    expect(t.attempts.rows.get(first.id)!.status).toBe("cancelled");
    // А если прежняя попытка в эту секунду оплачена — платёж проводится, нового счёта нет.
    t.kaspi.statuses.set(qr.externalId, { status: "Processed", amount: 15000 });
    await expect(t.svc.payDealInvoice(invoice.token, { method: "invoice" })).rejects.toMatchObject({ code: "notPayable" });
    expect((await t.dealInvoice(invoice.id)).status).toBe("paid");
    expect(t.sales.payments).toHaveLength(1);
  });

  it("клиент нажал «изменить способ», а Kaspi не отменил счёт — попытка остаётся в сверке", async () => {
    const t = dealSetup();
    const invoice = await t.issue();
    const attempt = await t.svc.pushDealInvoice(invoice.id, "77011234567");
    t.kaspi.cancelDown = true;
    await t.svc.cancel(attempt.id, { dealInvoiceToken: invoice.token });
    expect(t.attempts.rows.get(attempt.id)!.status).toBe("pending");
    t.kaspi.cancelDown = false;
    await t.svc.cancel(attempt.id, { dealInvoiceToken: invoice.token });
    expect(t.attempts.rows.get(attempt.id)!.status).toBe("cancelled");
  });
});

describe("Kaspi: долгая сверка счетов из чата", () => {
  it("счёт закрыт — его ждущие попытки отменяются после ответа Kaspi; молчание Kaspi — попытку не трогаем", async () => {
    const t = dealSetup();
    const invoice = await t.issue();
    const pushed = await t.svc.pushDealInvoice(invoice.id, "77011234567");
    await t.invoices.cancel(invoice.id, "менеджер отменил");
    t.kaspi.silent.add(pushed.externalId);
    expect(await t.svc.reconcileDealInvoices(8 * 86_400_000)).toEqual({ checked: 1, paid: 0, closed: 0 });
    expect(t.attempts.rows.get(pushed.id)!.status).toBe("pending");
    t.kaspi.silent.clear();
    expect(await t.svc.reconcileDealInvoices(8 * 86_400_000)).toEqual({ checked: 1, paid: 0, closed: 1 });
    expect(t.kaspi.cancelled).toEqual([pushed.externalId]);
    expect(t.attempts.rows.get(pushed.id)!.status).toBe("cancelled");
  });

  it("оплата пришла по уже отменённой попытке (в пределах 8 дней) — проводится; старше окна — не смотрим", async () => {
    const t = dealSetup();
    const invoice = await t.issue();
    const attempt = await t.svc.payDealInvoice(invoice.token, { method: "qr" });
    await t.svc.cancel(attempt.id, { dealInvoiceToken: invoice.token });
    expect(t.attempts.rows.get(attempt.id)!.status).toBe("cancelled");
    t.kaspi.statuses.set(attempt.externalId, { status: "Processed", amount: 15000 });
    t.c.set("2026-10-09T11:00:00Z");
    expect(await t.svc.reconcileDealInvoices(8 * 86_400_000)).toMatchObject({ checked: 0 });
    t.c.set("2026-10-08T09:00:00Z");
    expect(await t.svc.reconcileDealInvoices(8 * 86_400_000)).toMatchObject({ checked: 1, paid: 1 });
    expect(t.sales.payments).toHaveLength(1);
    // Счёт из чата к этому времени истёк: оплата всё равно засчитывается (решает DealInvoicesService).
    expect((await t.dealInvoice(invoice.id)).status).toBe("paid");
  });

  it("быстрая сверка не закрывает просроченную попытку счёта из чата, пока Kaspi о ней молчит", async () => {
    const t = dealSetup();
    const invoice = await t.issue();
    const attempt = await t.svc.payDealInvoice(invoice.token, { method: "qr" }); // QR истекает в 10:05
    t.c.set("2026-10-01T10:09:00Z");
    t.kaspi.silent.add(attempt.externalId);
    await t.svc.reconcile(3600_000);
    expect(t.attempts.rows.get(attempt.id)!.status).toBe("pending");
    t.kaspi.silent.clear();
    await t.svc.reconcile(3600_000);
    expect(t.attempts.rows.get(attempt.id)!.status).toBe("expired");
  });
});

describe("CloudPayments: счёт из чата P<n>", () => {
  const body = (invoice: string, amount: number, extra: Record<string, string> = {}) => ({ InvoiceId: invoice, Amount: String(amount), Currency: "KZT", TransactionId: "7001", ...extra });

  it("check: 0 — ждёт и сумма совпала; 12 — сумма или валюта; 10 — нет такого счёта", async () => {
    const t = dealSetup();
    await t.issue();
    expect(await t.cloud.handle("check", body("P12", 15000))).toBe(0);
    expect(await t.cloud.handle("check", body("P12", 14999))).toBe(12);
    expect(await t.cloud.handle("check", body("P12", 15000, { Currency: "USD" }))).toBe(12);
    expect(await t.cloud.handle("check", body("P99", 15000))).toBe(10);
  });

  it("check: 13 — оплачен, отменён, истёк или по сделке заказ", async () => {
    const t = dealSetup();
    const a = await t.issue();
    t.sales.addDeal("deal-1", { orderId: "order-7" });
    expect(await t.cloud.handle("check", body("P12", 15000))).toBe(13);
    t.sales.addDeal("deal-1");
    await t.invoices.cancel(a.id, "менеджер отменил");
    expect(await t.cloud.handle("check", body("P12", 15000))).toBe(13);
    await t.issue(10000); // P13
    t.c.set("2026-10-09T10:00:00Z");
    expect(await t.cloud.handle("check", body("P13", 10000))).toBe(13);
    t.c.set("2026-10-01T10:00:00Z");
    await t.cloud.handle("pay", body("P13", 10000));
    expect(await t.cloud.handle("check", body("P13", 10000))).toBe(13);
  });

  it("pay дважды — один платёж с операцией TransactionId, счёт оплачен один раз; другая операция — «нужен возврат»", async () => {
    const t = dealSetup();
    const invoice = await t.issue();
    expect(await t.cloud.handle("pay", body("P12", 15000))).toBe(0);
    expect(await t.cloud.handle("pay", body("P12", 15000))).toBe(0);
    expect(await t.dealInvoice(invoice.id)).toMatchObject({ status: "paid", paidMethod: "cloudpayments", paidRef: "7001" });
    expect(t.sales.payments).toEqual([{ id: "pay-1", dealId: "deal-1", amount: 15000, method: "cloudpayments", externalRef: "7001", invoiceId: invoice.id }]);
    expect(t.count("ordering.deal_invoice_paid")).toBe(1);
    expect(await t.cloud.handle("pay", body("P12", 15000, { TransactionId: "7002" }))).toBe(0);
    expect(t.sales.payments).toHaveLength(2);
    expect(t.count("ordering.deal_invoice_paid")).toBe(1);
    expect(t.uow.published.find((e) => e.type === "ordering.deal_invoice_extra_money")?.payload).toMatchObject({ reason: "overpaid", ref: "7002" });
  });

  it("pay без номера операции или с другой суммой — не засчитывается; fail — счёт ждёт дальше", async () => {
    const t = dealSetup();
    const invoice = await t.issue();
    expect(await t.cloud.handle("pay", body("P12", 15000, { TransactionId: "" }))).toBe(13);
    expect(await t.cloud.handle("pay", body("P12", 1))).toBe(12);
    expect(await t.cloud.handle("fail", body("P12", 15000, { Reason: "InsufficientFunds" }))).toBe(0);
    expect((await t.dealInvoice(invoice.id)).status).toBe("pending_payment");
    expect(t.sales.payments).toEqual([]);
  });

  it("заказы по-прежнему работают, а «P<n>» не принимается за заказ №n", async () => {
    const t = dealSetup();
    const order = await t.place();
    expect(await t.cloud.handle("check", body(String(order.number), order.amount))).toBe(0);
    expect(await t.cloud.handle("check", body(`P${order.number}`, order.amount))).toBe(10);
    expect(await t.cloud.handle("pay", body(String(order.number), order.amount))).toBe(0);
    expect((await t.orders.findById(order.id))!.status).toBe("paid");
    // Без счетов из чата адаптер не знает P<n>.
    expect(await new CloudPaymentsWebhook(t.ordersSvc, {} as never, () => "s").handle("check", body("P12", 15000))).toBe(10);
  });
});

describe("Стыки зон: счёт из чата", () => {
  it("сумма оплаты не совпала со счётом — денег нет, но событие «разобраться» (задача менеджеру), а не тишина", async () => {
    const t = dealSetup();
    const invoice = await t.issue();
    expect(await t.invoices.confirmOnline({ invoiceId: invoice.id, method: "cloudpayments", ref: "TX-1", amount: 999 })).toBe("mismatch");
    const extra = t.uow.published.filter((e) => e.type === "ordering.deal_invoice_extra_money");
    expect(extra.map((e) => (e.payload as { reason: string; recorded: boolean })).map((p) => [p.reason, p.recorded])).toEqual([["mismatch", false]]);
    expect((await t.dealInvoice(invoice.id)).status).toBe("pending_payment");
  });

  it("закрытие счёта без оплаты (отмена, новый счёт) — событие для отмены попытки Kaspi", async () => {
    const t = dealSetup();
    const first = await t.issue(10000);
    await t.issue(12000);
    expect(t.count("ordering.deal_invoice_closed")).toBe(1);
    expect((await t.dealInvoice(first.id)).status).toBe("cancelled");
  });

  it("перевод по прежнему (истёкшему) счёту, а открыт новый — новый закрывается, как при онлайн-оплате", async () => {
    const t = dealSetup();
    const old = await t.issue(10000);
    t.c.set("2026-10-20T10:00:00Z");
    await t.invoices.expireOverdue();
    const fresh = await t.issue(10000);
    await t.uow.run(() => t.invoices.markPaidManually({ invoiceId: old.id, dealId: "deal-1", paymentId: "pay-1" }));
    expect([(await t.dealInvoice(old.id)).status, (await t.dealInvoice(fresh.id)).status]).toEqual(["paid", "cancelled"]);
  });
});
