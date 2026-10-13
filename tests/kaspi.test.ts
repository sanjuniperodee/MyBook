import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { consoleLogger } from "@/shared/application";
import { GiftCard, kaspiOutcome, kaspiPhone, OrderingError, parseKaspiPayment, parseKaspiWebhook, PaymentInvoice, type GiftCardRepository, type KaspiPaymentView, type PaymentInvoiceRepository, type PaymentTarget } from "@/modules/ordering/domain";
import { GiftsService } from "@/modules/ordering/application/GiftsService";
import { KaspiPaymentsService } from "@/modules/ordering/application/KaspiPaymentsService";
import { KaspiSetupService } from "@/modules/ordering/application/KaspiSetupService";
import type { KaspiConfigStore, KaspiGateway, KaspiSession } from "@/modules/ordering/application/ports";
import { KaspiPosClient, verifyKaspiSignature } from "@/modules/ordering/infrastructure/payments/KaspiPosClient";
import { FakeUow, MemPromos, setup } from "./doubles/ordering";

// ─── протокол kaspi-pos ────────────────────────────────────────────────────

describe("Kaspi: протокол", () => {
  it("статусы Kaspi → итог платежа", () => {
    expect(kaspiOutcome("Processed")).toBe("paid");
    expect(kaspiOutcome("RemotePaymentCanceled")).toBe("cancelled");
    expect(kaspiOutcome("CancelledByUser")).toBe("cancelled");
    expect(kaspiOutcome("RemotePaymentRejected")).toBe("failed");
    expect(kaspiOutcome("QrTokenDiscarded")).toBe("expired");
    expect(kaspiOutcome("Expired")).toBe("expired");
    expect(kaspiOutcome("RemotePaymentCreated")).toBe("pending");
    expect(kaspiOutcome("Wait")).toBe("pending");
    expect(kaspiOutcome(null)).toBe("pending");
  });

  it("номер для счёта — только казахстанский мобильный", () => {
    expect(kaspiPhone("+7 701 123 45 67")).toBe("77011234567");
    expect(kaspiPhone("87011234567")).toBe("77011234567");
    expect(kaspiPhone("7011234567")).toBe("77011234567");
    expect(kaspiPhone("+7 727 123 45 67")).toBeNull(); // городской Алматы
    expect(kaspiPhone("+7 916 123 45 67")).toBeNull(); // российский
    expect(kaspiPhone("")).toBeNull();
  });

  it("ответ о счёте: идентификатор, статус, сумма, ссылка; дата без зоны — время Алматы", () => {
    const invoice = parseKaspiPayment({ StatusCode: 0, Data: { Id: 123456, Status: "RemotePaymentCreated", Amount: 15000, ReceiptUrl: "https://kaspi.kz/r/1" } });
    expect(invoice).toMatchObject({ externalId: "123456", status: "RemotePaymentCreated", amount: 15000, checkoutUrl: "https://kaspi.kz/r/1", qrToken: null, expiresAt: null });
    const qr = parseKaspiPayment({ StatusCode: 0, Data: { QrOperationId: 789012, QrToken: "https://pay.kaspi.kz/pay/abc", ExpireDate: "2026-10-13T12:05:00", Amount: "500" } });
    expect(qr).toMatchObject({ externalId: "789012", amount: 500, qrToken: "https://pay.kaspi.kz/pay/abc", checkoutUrl: "https://pay.kaspi.kz/pay/abc" });
    expect(qr!.expiresAt!.toISOString()).toBe("2026-10-13T07:05:00.000Z");
    // Ответ статуса без идентификатора — берём известный нам номер.
    expect(parseKaspiPayment({ Data: { Status: "Processed" } }, "42")).toMatchObject({ externalId: "42", status: "Processed" });
    expect(parseKaspiPayment({ data: {} })).toBeNull();
  });

  it("вебхук: только события kaspi-pos с номером платежа", () => {
    expect(parseKaspiWebhook({ event: "payment.success", paymentId: "123", type: "qr", status: "Processed", amount: 5000 })).toEqual({ event: "payment.success", externalId: "123", method: "qr", status: "Processed", amount: 5000 });
    expect(parseKaspiWebhook({ event: "payment.failed", paymentId: 9, type: "invoice", status: "RemotePaymentCanceled" })).toMatchObject({ externalId: "9", method: "invoice", amount: null });
    expect(parseKaspiWebhook({ event: "order.created", paymentId: "1" })).toBeNull();
    expect(parseKaspiWebhook({ event: "payment.success" })).toBeNull();
  });

  it("подпись вебхука: sha256=<hex HMAC>, сравнение без утечки по времени", () => {
    const body = JSON.stringify({ event: "payment.success", paymentId: "1" });
    const sig = `sha256=${createHmac("sha256", "s3cret").update(body).digest("hex")}`;
    expect(verifyKaspiSignature(body, sig, "s3cret")).toBe(true);
    expect(verifyKaspiSignature(body, sig, "other")).toBe(false);
    expect(verifyKaspiSignature(`${body} `, sig, "s3cret")).toBe(false);
    expect(verifyKaspiSignature(body, null, "s3cret")).toBe(false);
    expect(verifyKaspiSignature(body, sig, "")).toBe(false);
  });
});

describe("Kaspi: счёт", () => {
  const issue = (expiresAt: Date | null = null) =>
    PaymentInvoice.issue("i1", { provider: "kaspi", target: { kind: "order", id: "o1" }, method: "qr", externalId: "e1", phone: null, amount: 10000, checkoutUrl: null, qrToken: "q", expiresAt }, new Date("2026-10-13T10:00:00Z"));

  it("оплата окончательна, отказ после оплаты ничего не меняет", () => {
    const inv = issue();
    expect(inv.apply("pending", "Wait", new Date())).toBe(false);
    expect(inv.apply("paid", "Processed", new Date())).toBe(true);
    expect(inv.apply("failed", "Error", new Date())).toBe(false);
    expect(inv.apply("paid", "Processed", new Date())).toBe(false);
    expect(inv.status).toBe("paid");
  });

  it("позднее подтверждение перекрывает истечение", () => {
    const inv = issue();
    inv.expire(new Date());
    expect(inv.status).toBe("expired");
    expect(inv.apply("paid", "Processed", new Date())).toBe(true);
    expect(inv.status).toBe("paid");
  });

  it("счёт открыт до срока плюс три минуты на позднее подтверждение", () => {
    const inv = issue(new Date("2026-10-13T10:05:00Z"));
    expect(inv.isOpen(new Date("2026-10-13T10:07:59Z"))).toBe(true);
    expect(inv.isOpen(new Date("2026-10-13T10:08:01Z"))).toBe(false);
    expect(inv.matchesAmount(null)).toBe(true);
    expect(inv.matchesAmount(10000)).toBe(true);
    expect(inv.matchesAmount(9999)).toBe(false);
  });
});

// ─── сценарии с фейками ─────────────────────────────────────────────────────

class MemInvoices implements PaymentInvoiceRepository {
  rows = new Map<string, ReturnType<PaymentInvoice["snapshot"]>>();
  private seq = 0;
  snapshot = () => new Map(this.rows);
  restore = (s: unknown) => (this.rows = structuredClone(s) as typeof this.rows);
  nextId = () => `inv-${++this.seq}`;
  private load(r?: ReturnType<PaymentInvoice["snapshot"]>) {
    if (!r) return null;
    const { id, ...p } = structuredClone(r);
    return PaymentInvoice.restore(id, p);
  }
  async findById(id: string) {
    return this.load(this.rows.get(id));
  }
  async lockById(id: string) {
    return this.load(this.rows.get(id));
  }
  async findByExternalId(_provider: "kaspi", externalId: string) {
    return this.load([...this.rows.values()].find((r) => r.externalId === externalId));
  }
  async latestFor(target: PaymentTarget) {
    const all = [...this.rows.values()].filter((r) => r.target.kind === target.kind && r.target.id === target.id);
    return this.load(all.at(-1));
  }
  async toReconcile(since: Date) {
    return [...this.rows.values()].filter((r) => (r.status === "pending" || r.status === "expired") && r.createdAt >= since).map((r) => this.load(r)!);
  }
  async add(i: PaymentInvoice) {
    this.rows.set(i.id, i.snapshot());
  }
  async save(i: PaymentInvoice) {
    this.rows.set(i.id, i.snapshot());
  }
}

class FakeKaspi implements KaspiGateway {
  created: { method: "invoice" | "qr"; phone?: string; amount: number; comment?: string }[] = [];
  cancelled: string[] = [];
  statuses = new Map<string, { status: string; amount?: number }>();
  isConnected = true;
  down = false;
  private seq = 1000;
  async connected() {
    return this.isConnected;
  }
  private view(status = "RemotePaymentCreated", qr = false): KaspiPaymentView {
    return { externalId: String(++this.seq), status, amount: null, checkoutUrl: qr ? "https://pay.kaspi.kz/pay/x" : null, qrToken: qr ? "https://pay.kaspi.kz/pay/x" : null, expiresAt: qr ? new Date("2026-10-01T10:05:00Z") : null };
  }
  async createInvoice(phone: string, amount: number, comment: string) {
    if (this.down) throw new OrderingError("kaspiUnavailable");
    this.created.push({ method: "invoice", phone, amount, comment });
    return this.view();
  }
  async createQr(amount: number) {
    this.created.push({ method: "qr", amount });
    return this.view("Wait", true);
  }
  async details(externalId: string) {
    const s = this.statuses.get(externalId);
    return { externalId, status: s?.status ?? "RemotePaymentCreated", amount: s?.amount ?? null, checkoutUrl: null, qrToken: null, expiresAt: null };
  }
  async cancel(externalId: string) {
    this.cancelled.push(externalId);
  }
}

function kaspiSetup() {
  const base = setup();
  const invoices = new MemInvoices();
  const promos = new MemPromos();
  const giftStore = new Map<string, ReturnType<GiftCard["snapshot"]>>();
  const loadGift = (r?: ReturnType<GiftCard["snapshot"]>) => (r ? GiftCard.restore(r.id, (({ id: _id, ...p }) => (void _id, p))(structuredClone(r))) : null);
  const gifts: GiftCardRepository = {
    nextIdentity: async () => ({ id: crypto.randomUUID(), number: 7 }),
    findById: async (id) => loadGift(giftStore.get(id)),
    findByNumber: async (n) => loadGift([...giftStore.values()].find((g) => g.number === n)),
    findByToken: async (t) => loadGift([...giftStore.values()].find((g) => g.token === t)),
    findByPromoId: async () => null,
    findDueForDelivery: async () => [],
    lockById: async (id) => loadGift(giftStore.get(id)),
    add: async (g) => void giftStore.set(g.id, g.snapshot()),
    save: async (g) => void giftStore.set(g.id, g.snapshot()),
  };
  const uow = new FakeUow([base.orders, promos, invoices]);
  const giftsService = new GiftsService(gifts, promos, { giftCode: () => "GIFT-KASPI-0001", giftToken: () => "g".repeat(24) }, { provider: () => "manual", currency: () => "KZT" }, uow, base.c, () => "2026-10-01");
  const kaspi = new FakeKaspi();
  let enabled = true;
  const logger = { ...consoleLogger("test"), warn: () => {}, error: () => {} };
  const svc = new KaspiPaymentsService(invoices, base.orders, gifts, base.svc, giftsService, kaspi, async () => enabled, uow, base.c, logger);
  return { ...base, invoices, kaspi, svc, giftsService, gifts, promos, setEnabled: (v: boolean) => void (enabled = v) };
}

describe("Kaspi: оплата заказа", () => {
  it("счёт по номеру → вебхук «оплачено» подтверждает заказ, повтор безопасен", async () => {
    const t = kaspiSetup();
    const order = await t.place();
    const inv = await t.svc.payOrder(order.id, "user-1", { method: "invoice", phone: "+7 701 000 00 00" });
    expect(t.kaspi.created).toEqual([{ method: "invoice", phone: "77010000000", amount: order.amount, comment: `MyBooks №${order.number}` }]);
    expect(await t.svc.onWebhook({ event: "payment.success", externalId: inv.externalId, method: "invoice", status: "Processed", amount: order.amount })).toBe("ok");
    expect((await t.orders.findById(order.id))!.status).toBe("paid");
    expect((await t.orders.findById(order.id))!.snapshot().paymentId).toBe(`kaspi:${inv.externalId}`);
    await t.svc.onWebhook({ event: "payment.success", externalId: inv.externalId, method: "invoice", status: "Processed", amount: order.amount });
    expect(t.uow.types().filter((x) => x === "ordering.order_paid")).toHaveLength(1);
    expect(await t.svc.onWebhook({ event: "payment.success", externalId: "чужой", method: "qr", status: "Processed", amount: 1 })).toBe("unknown");
  });

  it("повторное нажатие отдаёт тот же счёт; другой способ отменяет прежний счёт в Kaspi", async () => {
    const t = kaspiSetup();
    const order = await t.place();
    const a = await t.svc.payOrder(order.id, "user-1", { method: "invoice", phone: "87010000000" });
    const b = await t.svc.payOrder(order.id, "user-1", { method: "invoice", phone: "+77010000000" });
    expect(b.id).toBe(a.id);
    const qr = await t.svc.payOrder(order.id, "user-1", { method: "qr" });
    expect(qr.id).not.toBe(a.id);
    expect(t.kaspi.cancelled).toEqual([a.externalId]);
    expect((await t.invoices.findById(a.id))!.status).toBe("cancelled");
  });

  it("чужой заказ, оплаченный заказ, неверный номер и выключенный Kaspi — отказ", async () => {
    const t = kaspiSetup();
    const order = await t.place();
    await expect(t.svc.payOrder(order.id, "user-2", { method: "qr" })).rejects.toMatchObject({ code: "orderNotFound" });
    await expect(t.svc.payOrder(order.id, "user-1", { method: "invoice", phone: "+7 727 000 00 00" })).rejects.toMatchObject({ code: "phoneInvalid" });
    t.setEnabled(false);
    await expect(t.svc.payOrder(order.id, "user-1", { method: "qr" })).rejects.toMatchObject({ code: "kaspiNotConnected" });
    t.setEnabled(true);
    await t.svc.payOrder(order.id, "user-1", { method: "qr" });
    await t.svc.reconcile(60_000);
    t.kaspi.statuses.set([...t.invoices.rows.values()][0].externalId, { status: "Processed" });
    await t.svc.reconcile(60_000);
    await expect(t.svc.payOrder(order.id, "user-1", { method: "qr" })).rejects.toMatchObject({ code: "notPayable" });
  });

  it("сумма в уведомлении не совпала — заказ не подтверждается, счёт помечен", async () => {
    const t = kaspiSetup();
    const order = await t.place();
    const inv = await t.svc.payOrder(order.id, "user-1", { method: "qr" });
    await t.svc.onWebhook({ event: "payment.success", externalId: inv.externalId, method: "qr", status: "Processed", amount: 1 });
    expect((await t.orders.findById(order.id))!.status).toBe("pending_payment");
    expect((await t.invoices.findById(inv.id))!.snapshot()).toMatchObject({ status: "failed", providerStatus: "AmountMismatch:1" });
  });

  it("сверка без вебхука: оплата подтверждается, истёкший счёт закрывается, позднее подтверждение всё равно засчитывается", async () => {
    const t = kaspiSetup();
    const order = await t.place();
    const inv = await t.svc.payOrder(order.id, "user-1", { method: "qr" }); // QR истекает в 10:05
    t.c.set("2026-10-01T10:09:00Z");
    expect(await t.svc.reconcile(3600_000)).toEqual({ checked: 1, paid: 0 });
    expect((await t.invoices.findById(inv.id))!.status).toBe("expired");
    t.kaspi.statuses.set(inv.externalId, { status: "Processed", amount: order.amount });
    expect(await t.svc.reconcile(3600_000)).toEqual({ checked: 1, paid: 1 });
    expect((await t.orders.findById(order.id))!.status).toBe("paid");
  });

  it("клиент оплатил второй счёт по уже оплаченному заказу — заказ не трогаем, в журнал — «нужен возврат»", async () => {
    const t = kaspiSetup();
    const order = await t.place();
    const first = await t.svc.payOrder(order.id, "user-1", { method: "qr" });
    // Счёт закрыли по сроку, клиент взял новый, а прежний QR всё-таки успел пройти.
    t.c.set("2026-10-01T10:09:00Z");
    await t.svc.reconcile(3600_000);
    const second = await t.svc.payOrder(order.id, "user-1", { method: "qr" });
    await t.svc.onWebhook({ event: "payment.success", externalId: second.externalId, method: "qr", status: "Processed", amount: null });
    await t.svc.onWebhook({ event: "payment.success", externalId: first.externalId, method: "qr", status: "Processed", amount: null });
    expect(t.uow.types().filter((x) => x === "ordering.order_paid")).toHaveLength(1);
    expect(t.orders.history.at(-1)!.note).toContain("нужен возврат");
  });

  it("статус для страницы: только владелец, ждущий счёт сверяется не чаще раза в 3 секунды", async () => {
    const t = kaspiSetup();
    const order = await t.place();
    const inv = await t.svc.payOrder(order.id, "user-1", { method: "invoice", phone: "77010000000" });
    await expect(t.svc.status(inv.id, { userId: "user-2" })).rejects.toMatchObject({ code: "invoiceNotFound" });
    t.kaspi.statuses.set(inv.externalId, { status: "Processed" });
    expect((await t.svc.status(inv.id, { userId: "user-1" })).status).toBe("pending"); // только что создан
    t.c.set("2026-10-01T10:00:04Z");
    expect((await t.svc.status(inv.id, { userId: "user-1" })).status).toBe("paid");
    expect((await t.orders.findById(order.id))!.status).toBe("paid");
  });

  it("отмена заказа закрывает открытый счёт в Kaspi", async () => {
    const t = kaspiSetup();
    const order = await t.place();
    const inv = await t.svc.payOrder(order.id, "user-1", { method: "invoice", phone: "77010000000" });
    await t.svc.cancelOpenFor({ kind: "order", id: order.id });
    expect(t.kaspi.cancelled).toEqual([inv.externalId]);
    expect(await t.svc.current({ kind: "order", id: order.id })).toBeNull();
  });
});

describe("Kaspi: оплата сертификата", () => {
  it("по секретной ссылке, после оплаты выпускается код", async () => {
    const t = kaspiSetup();
    const gift = await t.giftsService.purchase({ plan: "hardcover", buyerUserId: null, buyerName: "А", buyerEmail: "a@b.kz", buyerPhone: "+77010000000", recipientName: "Б", recipientEmail: null, sendAt: null, message: "", locale: "ru", buyerLocale: "ru" });
    const inv = await t.svc.payGift(gift.token, { method: "invoice", phone: "+77010000000" });
    await expect(t.svc.status(inv.id, { giftToken: "x".repeat(24) })).rejects.toMatchObject({ code: "invoiceNotFound" });
    await t.svc.onWebhook({ event: "payment.success", externalId: inv.externalId, method: "invoice", status: "Processed", amount: gift.amount });
    expect((await t.gifts.findById(gift.id))!.status).toBe("paid");
    expect(await t.promos.findByCode("GIFT-KASPI-0001")).not.toBeNull();
  });
});

// ─── клиент kaspi-pos и подключение кассира ────────────────────────────────

const session: KaspiSession = { tokenSn: "TSN", vtokenSecret: "VSEC", profileId: 12345, organizationId: 6789, orgName: "ИП MyBooks", phone: "77010000000" };

function memConfig(initial: KaspiSession | null = session): KaspiConfigStore & { state: { enabled: boolean; session: KaspiSession | null } } {
  const state = { enabled: false, session: initial };
  return {
    state,
    config: async () => ({ enabled: state.enabled, apiUrl: "http://kaspi-pos:3000/", session: state.session }),
    saveSession: async (s) => void (state.session = s),
    setEnabled: async (v) => void (state.enabled = v),
    webhookSecret: async () => "secret",
  };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("Kaspi: клиент kaspi-pos", () => {
  it("счёт: адрес, заголовки сессии и тело запроса", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const client = new KaspiPosClient(memConfig(), async (url, init) => {
      calls.push({ url: String(url), init: init! });
      return json({ StatusCode: 0, Data: { Id: 5, Status: "RemotePaymentCreated", Amount: 100 } });
    });
    const view = await client.createInvoice("77010000000", 100, "MyBooks №1");
    expect(view.externalId).toBe("5");
    expect(calls[0].url).toBe("http://kaspi-pos:3000/api/invoice/create");
    expect(calls[0].init.headers).toMatchObject({ "X-Token-SN": "TSN", "X-Vtoken-Secret": "VSEC", "X-Profile-Id": "12345", "Content-Type": "application/json" });
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ phoneNumber: "77010000000", amount: 100, comment: "MyBooks №1" });
  });

  it("ошибки: нет сессии, сессия не принята, сервис недоступен, отказ Kaspi", async () => {
    await expect(new KaspiPosClient(memConfig(null), async () => json({})).createQr(1)).rejects.toMatchObject({ code: "kaspiNotConnected" });
    await expect(new KaspiPosClient(memConfig(), async () => json({ error: "no" }, 401)).createQr(1)).rejects.toMatchObject({ code: "kaspiNotConnected" });
    await expect(
      new KaspiPosClient(memConfig(), async () => {
        throw new TypeError("fetch failed");
      }).createQr(1),
    ).rejects.toMatchObject({ code: "kaspiUnavailable" });
    await expect(new KaspiPosClient(memConfig(), async () => json({ StatusCode: 3, Data: null })).createQr(1)).rejects.toMatchObject({ code: "kaspiUnavailable" });
  });

  it("вход кассира: init → send-phone → verify-otp → сессия сохраняется и оплата включается", async () => {
    const store = memConfig(null);
    const paths: string[] = [];
    const client = new KaspiPosClient(store, async (url, init) => {
      const path = new URL(String(url)).pathname;
      paths.push(path);
      if (path === "/api/auth/init") return json({ success: true, processId: "p1" });
      if (path === "/api/auth/send-phone") return json({ success: true, processId: "p1" });
      if (path === "/api/auth/verify-otp") {
        expect(JSON.parse(String(init!.body))).toEqual({ processId: "p1", otp: "1234" });
        return json({ success: true, tokenSN: "T", vtokenSecret: "V", profileId: 1, organizationId: 2, orgName: "ИП Тест", phone: "77010000000" });
      }
      return json({ active: true });
    });
    const setup = new KaspiSetupService(client, store);
    await expect(setup.requestCode("+7 727 000 00 00")).rejects.toMatchObject({ code: "phoneInvalid" });
    expect(await setup.requestCode("+7 701 000 00 00")).toEqual({ processId: "p1" });
    expect(await setup.confirmCode("p1", " 1234 ", "staff-1")).toEqual({ orgName: "ИП Тест", phone: "77010000000" });
    expect(store.state).toMatchObject({ enabled: true, session: { tokenSn: "T", vtokenSecret: "V", profileId: 1 } });
    expect(paths).toEqual(["/api/auth/init", "/api/auth/send-phone", "/api/auth/verify-otp"]);
    expect(await setup.status()).toMatchObject({ enabled: true, connected: true, active: true, orgName: "ИП Тест" });
    await setup.disconnect("staff-1");
    expect(store.state).toEqual({ enabled: false, session: null });
    await expect(setup.setEnabled(true, "staff-1")).rejects.toMatchObject({ code: "kaspiNotConnected" });
  });

  it("Kaspi просит пароль — вход не завершён", async () => {
    const client = new KaspiPosClient(memConfig(null), async () => json({ view: { code: "KPEnterLoginPassword" } }));
    await expect(client.verify("p1", "1234")).rejects.toMatchObject({ code: "kaspiUnavailable" });
  });
});
