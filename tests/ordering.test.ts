import { describe, expect, it } from "vitest";
import type { EventBus } from "@/shared/application";
import { isPaid, Order, OrderingError, PromoCode } from "@/modules/ordering/domain";
import { ORDER_STATUSES } from "@/shared/domain/orders";
import { GiftsService } from "@/modules/ordering/application/GiftsService";
import { PromoService } from "@/modules/ordering/application/PromoService";
import { addPromo, admin, clock, FakeUow, MemGifts, MemOrders, MemPromos, setup } from "./doubles/ordering";

// ─── домен ─────────────────────────────────────────────────────────────────

describe("Ordering: договорённая цена и предоплата по ручной сделке", () => {
  const deal = (agreedTotal: number, prepaid: number) => ({ dealId: "d1", dealNumber: 6, agreedTotal, prepaid, deadline: null, plan: null as string | null });

  it("цена по договорённости: скидка до согласованной суммы, предоплата вычтена из «к оплате»", async () => {
    const { place, setAgreement, orders, uow } = setup();
    setAgreement(deal(20000, 10000));
    const o = await place({ delivery: { method: "pickup", city: null, address: null, postalCode: null } });
    // каталог: твёрдая обложка 30 000, самовывоз → за книгу по договорённости 20 000, из них внесено 10 000
    expect(o.snapshot().price).toMatchObject({ itemsAmount: 30000, discountAmount: 10000, prepaidAmount: 10000, amount: 10000 });
    expect(o.status).toBe("pending_payment");
    expect(orders.history[0].note).toContain("по договорённости с менеджером: итог 20");
    expect(uow.types()).toEqual(["ordering.order_placed"]);
    expect(o.ref()).toMatchObject({ amount: 10000, prepaid: 10000 });
  });

  it("доставка и допы считаются сверху договорённой цены книги; предоплата не покрывает доставку", async () => {
    const { place, setAgreement, svc } = setup();
    setAgreement(deal(20000, 10000));
    const o = await place({ addons: ["giftwrap"], delivery: { method: "courier", city: "Алматы", address: "ул. Абая 1", postalCode: null } });
    // книга 30 000 → 20 000 по договорённости; сверху доставка 2 000 и упаковка 5 000; внесено 10 000
    expect(o.snapshot().price).toMatchObject({ itemsAmount: 30000, discountAmount: 10000, deliveryAmount: 2000, addonsAmount: 5000, prepaidAmount: 10000, amount: 17000 });
    // книга оплачена полностью, но доставка — нет: заказ ждёт оплаты, в работу сам не уходит
    const full = setup();
    full.setAgreement(deal(20000, 20000));
    const f = await full.place({ delivery: { method: "courier", city: "Алматы", address: "ул. Абая 1", postalCode: null } });
    expect((await full.svc.findByNumber(f.number))!.snapshot()).toMatchObject({ status: "pending_payment", price: { deliveryAmount: 2000, prepaidAmount: 20000, amount: 2000 } });
    void svc;
  });

  it("тариф договорённости фиксирован: по договорённости заказ идёт на него, «с нуля» — на любой; доп. экземпляры сверху", async () => {
    const a = setup();
    a.setAgreement({ ...deal(9000, 5000), plan: "digital" });
    // клиент (или подмена формы) просит печатный тариф, а договорились на электронный — заказ оформляется на электронный
    const agreed = await a.place({ plan: "hardcover", delivery: { method: "pickup", city: null, address: null, postalCode: null } });
    expect(agreed.snapshot().plan).toBe("digital");
    expect(agreed.snapshot().price).toMatchObject({ itemsAmount: 9900, discountAmount: 900, prepaidAmount: 5000, amount: 4000 });
    const a2 = setup();
    a2.setAgreement({ ...deal(9000, 5000), plan: "digital" });
    const scratch = await a2.place({ plan: "hardcover", agreementMode: "advance", delivery: { method: "pickup", city: null, address: null, postalCode: null } });
    expect(scratch.snapshot().plan).toBe("hardcover");
    const b = setup();
    b.setAgreement({ ...deal(20000, 10000), plan: "hardcover" });
    const two = await b.place({ quantity: 2, delivery: { method: "pickup", city: null, address: null, postalCode: null } });
    // первый экземпляр по договорённости (20 000), второй — по прайсу (17 900)
    expect(two.snapshot().price).toMatchObject({ itemsAmount: 30000 + 17900, discountAmount: 10000, prepaidAmount: 10000, amount: 27900 });
  });

  it("«с нуля»: обычная цена по каталогу, внесённые деньги засчитываются как аванс", async () => {
    const { place, setAgreement } = setup();
    setAgreement(deal(20000, 10000));
    const o = await place({ agreementMode: "advance", delivery: { method: "pickup", city: null, address: null, postalCode: null } });
    expect(o.snapshot().price).toMatchObject({ itemsAmount: 30000, discountAmount: 0, prepaidAmount: 10000, amount: 20000 });
  });

  it("предоплата покрыла всё — заказ сразу оплачен и уходит в работу", async () => {
    const { place, setAgreement, svc, uow } = setup();
    setAgreement(deal(20000, 20000));
    const o = await place({ delivery: { method: "pickup", city: null, address: null, postalCode: null } });
    expect((await svc.findByNumber(o.number))!.snapshot()).toMatchObject({ status: "paid", price: { amount: 0, prepaidAmount: 20000 } });
    expect(uow.types()).toEqual(["ordering.order_placed", "ordering.order_paid"]);
  });

  it("договорённость не может поднять цену, предоплата не больше итога, без договорённости всё как раньше", async () => {
    const a = setup();
    a.setAgreement(deal(90000, 10000)); // договорились на сумму больше каталога
    const high = await a.place({ delivery: { method: "pickup", city: null, address: null, postalCode: null } });
    expect(high.snapshot().price).toMatchObject({ discountAmount: 0, prepaidAmount: 10000, amount: 20000 });
    const b = setup();
    b.setAgreement(deal(20000, 50000)); // внесли больше итога — зачёт не больше итога
    expect((await b.place({ delivery: { method: "pickup", city: null, address: null, postalCode: null } })).snapshot().price).toMatchObject({ prepaidAmount: 20000, amount: 0 });
    const c = setup();
    expect((await c.place({ delivery: { method: "pickup", city: null, address: null, postalCode: null } })).snapshot().price).toEqual({ itemsAmount: 30000, discountAmount: 0, deliveryAmount: 0, addonsAmount: 0, addons: [], amount: 30000 });
  });
});

describe("Ordering: печатная версия к оплаченной электронной", () => {
  const pickup = { method: "pickup" as const, city: null, address: null, postalCode: null };
  const digitalPaid = async (t: ReturnType<typeof setup>) => {
    const d = await t.place({ plan: "digital", delivery: pickup });
    await t.svc.confirmPayment({ orderId: d.id, paymentId: null }, admin);
    return d;
  };

  it("предложение есть только у оплаченной электронной версии без других живых заказов", async () => {
    const t = setup();
    const d = await t.place({ plan: "digital", delivery: pickup });
    expect(await t.svc.upgradeOffer(d.id, "user-1")).toBeNull(); // ещё не оплачена
    await t.svc.confirmPayment({ orderId: d.id, paymentId: null }, admin);
    expect(await t.svc.upgradeOffer(d.id, "user-1")).toMatchObject({ number: d.number, bookId: "book-1", credit: 9900 });
    expect(await t.svc.upgradeOffer(d.id, "user-2")).toBeNull(); // чужой заказ
  });

  it("оплата электронной засчитывается; книга остаётся закрытой; повторно дозаказать нельзя, отмена печатного книгу не открывает", async () => {
    const t = setup();
    const d = await digitalPaid(t);
    expect(t.books.books.get("book-1")!.status).toBe("ordered");
    const o = await t.place({ plan: "hardcover", upgradeFromOrderId: d.id, delivery: pickup });
    expect(o.snapshot().price).toMatchObject({ itemsAmount: 30000, prepaidAmount: 9900, amount: 20100 });
    expect(t.orders.history.find((h) => h.orderId === o.id)?.note).toContain(`засчитана оплата электронной версии (заказ №${d.number}): 9`);
    expect(t.books.books.get("book-1")!.status).toBe("ordered");
    // печатный уже заказан — второй дозаказ невозможен
    expect(await t.svc.upgradeOffer(d.id, "user-1")).toBeNull();
    await expect(t.place({ plan: "hardcover", upgradeFromOrderId: d.id, delivery: pickup })).rejects.toMatchObject({ code: "upgradeUnavailable" });
    // отмена печатного: электронный остаётся живым, книга не открывается для правок
    await t.svc.cancelByCustomer(o.id, "user-1");
    expect(t.books.books.get("book-1")!.status).toBe("ordered");
    expect(await t.svc.upgradeOffer(d.id, "user-1")).toMatchObject({ credit: 9900 });
  });

  it("нельзя дозаказать электронный тариф или заказ, который не оплачен/чужой; доставка считается сверху", async () => {
    const t = setup();
    const d = await digitalPaid(t);
    await expect(t.place({ plan: "digital", upgradeFromOrderId: d.id, delivery: pickup })).rejects.toMatchObject({ code: "upgradeUnavailable" });
    await expect(t.place({ plan: "hardcover", upgradeFromOrderId: crypto.randomUUID(), delivery: pickup })).rejects.toMatchObject({ code: "upgradeUnavailable" });
    const o = await t.place({ plan: "hardcover", upgradeFromOrderId: d.id, delivery: { method: "courier", city: "Алматы", address: "Абая, 1", postalCode: null } });
    expect(o.snapshot().price).toMatchObject({ prepaidAmount: 9900, deliveryAmount: 2000, amount: 30000 + 2000 - 9900 });
  });

  it("бесплатная электронная (по промокоду): зачёта нет, печатную можно заказать по полной цене", async () => {
    const t = setup();
    const promo = await addPromo(t.promos, "FREE", { kind: "percent", value: 100 });
    const d = await t.place({ plan: "digital", promoCode: promo.code, delivery: pickup });
    expect((await t.svc.findByNumber(d.number))!.status).toBe("paid");
    expect(await t.svc.upgradeOffer(d.id, "user-1")).toMatchObject({ credit: 0 });
    const o = await t.place({ plan: "hardcover", upgradeFromOrderId: d.id, delivery: pickup });
    expect(o.snapshot().price).toMatchObject({ itemsAmount: 30000, amount: 30000 });
    expect(o.snapshot().price.prepaidAmount ?? 0).toBe(0);
  });
});

describe("Ordering: агрегат Order", () => {
  it("цена считается в агрегате: тариф, доставка, скидка только на книги", async () => {
    const { place, orders, uow } = setup();
    const order = await place({ quantity: 2 });
    const s = order.snapshot();
    expect(s.price).toMatchObject({ itemsAmount: 30000 + 17900, deliveryAmount: 2000, amount: 30000 + 17900 + 2000 });
    expect(order.status).toBe("pending_payment");
    expect(orders.history[0].note).toBe("Заказ создан, 64 стр. (оценка)");
    expect(uow.types()).toEqual(["ordering.order_placed"]);
  });

  it("электронный тариф игнорирует доставку, допы и количество", async () => {
    const { place } = setup();
    const s = (await place({ plan: "digital", quantity: 5, addons: ["express"] })).snapshot();
    expect(s).toMatchObject({ quantity: 1, delivery: { method: null }, price: { amount: 9900, addonsAmount: 0 } });
  });

  it("оплата идемпотентна: повторное уведомление ничего не меняет", async () => {
    const { place, svc, uow } = setup();
    const o = await place();
    await svc.confirmPayment({ orderId: o.id, paymentId: "tx-1" }, admin);
    await svc.confirmPayment({ orderId: o.id, paymentId: "tx-2" }, admin);
    const paid = (await svc.findByNumber(o.number))!.snapshot();
    expect(paid).toMatchObject({ status: "paid", paymentId: "tx-1" });
    expect(uow.types().filter((t) => t === "ordering.order_paid")).toHaveLength(1);
  });

  it("сверка платежа: сумма и валюта", async () => {
    const o = await setup().place();
    expect(o.matchesPayment(o.amount, "KZT")).toBe(true);
    expect(o.matchesPayment(o.amount - 1, "KZT")).toBe(false);
    expect(o.matchesPayment(o.amount, "USD")).toBe(false);
  });

  it("отменённый заказ нельзя вернуть в «ожидает оплаты»", () => {
    const now = new Date();
    const o = Order.restore("o1", { ...setupSnapshot(), status: "cancelled" });
    expect(() => o.changeStatus("pending_payment", "x", "", now)).toThrow(OrderingError);
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

// ─── сценарии ──────────────────────────────────────────────────────────────

describe("Ordering: оформление заказа", () => {
  it("книга блокируется, второй заказ той же книги невозможен", async () => {
    const { place, books } = setup();
    await place();
    expect(books.books.get("book-1")!.status).toBe("ordered");
    await expect(place()).rejects.toMatchObject({ code: "alreadyOrdered" });
  });

  it("неготовая книга не заказывается — текст причины доходит до клиента", async () => {
    const { place, books } = setup();
    books.books.get("book-1")!.blocking = "Добавьте название книги";
    await expect(place()).rejects.toMatchObject({ code: "notReady", message: "Добавьте название книги" });
  });

  it("промокод: скидка, резерв использования, отказ просроченного", async () => {
    const { place, promos, c } = setup();
    await addPromo(promos, "SALE10", { value: 10, maxUses: 1 });
    const o = await place({ promoCode: "sale10" });
    expect(o.snapshot().price.discountAmount).toBe(3000);
    expect((await promos.findByCode("SALE10"))!.snapshot().usedCount).toBe(1);
    await addPromo(promos, "OLD", { expiresAt: new Date("2026-09-01") });
    c.set("2026-10-01T10:00:00Z");
    await expect(setupWith(promos).place({ promoCode: "OLD" })).rejects.toMatchObject({ code: "expired" });
  });

  it("гонка за последнее использование: транзакция откатывается целиком", async () => {
    const { place, promos, books, orders } = setup();
    const p = await addPromo(promos, "LAST", { maxUses: 1 });
    await promos.tryReserve(p.id, new Date()); // кто-то успел раньше
    await expect(place({ promoCode: "LAST" })).rejects.toMatchObject({ code: "used" });
    expect(books.books.get("book-1")!.status).toBe("draft");
    expect(orders.rows.size).toBe(0);
  });

  it("заказ на 100% сертификатом сразу оплачен", async () => {
    const { place, promos, uow } = setup();
    await addPromo(promos, "GIFT-AAAA-BBBB", { kind: "fixed", value: 100000, maxUses: 1 });
    const o = await place({ plan: "digital", promoCode: "GIFT-AAAA-BBBB" });
    expect(uow.types()).toEqual(["ordering.order_placed", "ordering.order_paid"]);
    expect(o.isFree).toBe(true);
  });
});

function setupWith(promos: MemPromos) {
  const s = setup();
  s.promos.rows = promos.rows;
  return s;
}

describe("Ordering: отмена и статусы", () => {
  it("«заказ оплачен» — одно правило: всё, кроме ожидания оплаты и отмены", () => {
    expect(ORDER_STATUSES.filter(isPaid)).toEqual(["paid", "in_production", "shipped", "delivered"]);
    expect(ORDER_STATUSES.filter((s) => !isPaid(s))).toEqual(["pending_payment", "cancelled"]);
  });

  it("отмена неоплаченного возвращает промокод и открывает книгу", async () => {
    const { place, promos, books, svc } = setup();
    await addPromo(promos, "BACK", { maxUses: 1 });
    const o = await place({ promoCode: "BACK" });
    await svc.cancelByCustomer(o.id, "user-1");
    expect((await promos.findByCode("BACK"))!.snapshot().usedCount).toBe(0);
    expect(books.books.get("book-1")!.status).toBe("draft");
  });

  it("клиент не может отменить чужой или оплаченный заказ", async () => {
    const { place, svc, orders } = setup();
    const o = await place();
    await expect(svc.cancelByCustomer(o.id, "other")).rejects.toMatchObject({ code: "not_found" });
    await svc.confirmPayment({ orderId: o.id, paymentId: null }, admin);
    await svc.cancelByCustomer(o.id, "user-1");
    expect(orders.rows.get(o.id)!.status).toBe("paid");
  });

  it("канбан: переход в производство, журнал и событие", async () => {
    const { place, svc, uow, orders } = setup();
    const o = await place();
    await svc.changeStatus({ orderId: o.id, to: "paid" }, admin);
    await svc.changeStatus({ orderId: o.id, to: "in_production", note: "в типографии" }, admin);
    expect(uow.types()).toContain("ordering.order_status_changed");
    expect(orders.history.at(-1)).toMatchObject({ status: "in_production", note: "в типографии" });
  });

  it("ответственным может быть только сотрудник", async () => {
    const { place, svc, orders } = setup();
    const o = await place();
    await svc.assign(o.id, "staff-1", admin);
    expect(orders.history.at(-1)!.note).toBe("Ответственный: Айгерим");
    await expect(svc.assign(o.id, "client-9", admin)).rejects.toMatchObject({ code: "staffNotFound" });
  });

  it("ответственный в журнале подписан как везде в CRM: имя, а у «Администратора» — логин из почты (не полный адрес)", async () => {
    const { place, svc, orders } = setup();
    const o = await place();
    await svc.assign(o.id, "staff-2", admin);
    expect(orders.history.at(-1)!.note).toBe("Ответственный: boss");
    await svc.assign(o.id, null, admin);
    expect(orders.history.at(-1)!.note).toBe("Ответственный: снят");
  });

  it("сообщение об оплате переводом — один раз", async () => {
    const { place, svc, uow } = setup();
    const o = await place();
    await svc.claimPayment(o.id, "user-1");
    await svc.claimPayment(o.id, "user-1");
    expect(uow.types().filter((t) => t === "ordering.payment_claimed")).toHaveLength(1);
  });
});

describe("Ordering: промокоды и сертификаты", () => {
  it("PromoService: проверка, дубликат кода, переключение", async () => {
    const promos = new MemPromos();
    const svc = new PromoService(promos, new MemOrders(), clock());
    expect(await svc.check(" ")).toEqual({ ok: false, error: "empty" });
    expect(await svc.check("NOPE")).toEqual({ ok: false, error: "notFound" });
    const p = await svc.create({ code: "spring", kind: "fixed", value: 3000, expiresOn: new Date("2026-12-31") });
    expect(p.code).toBe("SPRING");
    expect(p.expiresAt!.toISOString()).toBe("2026-12-31T23:59:59.999Z");
    await expect(svc.create({ code: "SPRING", kind: "fixed", value: 1 })).rejects.toMatchObject({ code: "promoExists" });
    expect(await svc.check("spring")).toMatchObject({ ok: true, promo: { code: "SPRING", label: expect.stringContaining("3") } });
    await svc.toggle(p.id);
    expect(await svc.check("SPRING")).toEqual({ ok: false, error: "notFound" });
    expect(() => PromoCode.create("x", { code: "P", kind: "percent", value: 101 }, new Date())).toThrow(OrderingError);
  });

  it("GiftsService: оплата выпускает одноразовый код на номинал, повтор безопасен", async () => {
    const promos = new MemPromos();
    const gifts = new MemGifts();
    const uow = new FakeUow([promos, gifts]);
    const svc = new GiftsService(gifts, promos, { giftCode: () => "GIFT-TEST-0001", giftToken: () => "t".repeat(24) }, { provider: () => "manual", currency: () => "KZT" }, uow, clock(), () => "2026-10-01");
    await expect(svc.purchase({ plan: "premium", buyerUserId: null, buyerName: "А", buyerEmail: "a@b.kz", buyerPhone: "", recipientName: "Б", recipientEmail: "b@c.kz", sendAt: "2026-09-01", message: "", locale: "ru", buyerLocale: "ru" })).rejects.toMatchObject({ code: "giftPastDate" });
    const gift = await svc.purchase({ plan: "premium", buyerUserId: null, buyerName: "А", buyerEmail: "a@b.kz", buyerPhone: "", recipientName: "Б", recipientEmail: null, sendAt: "2026-12-01", message: "", locale: "ru", buyerLocale: "ru" });
    expect(gift.amount).toBe(35000);
    expect(gift.snapshot().sendAt).toBeNull(); // без адреса получателя дата отправки не нужна
    await svc.confirmPayment(gift.id, "tx", admin);
    expect(await svc.confirmPayment(gift.id, "tx", admin)).toBeNull();
    const promo = (await promos.findByCode("GIFT-TEST-0001"))!.snapshot();
    expect(promo).toMatchObject({ kind: "fixed", value: 35000, maxUses: 1 });
    expect(uow.types()).toEqual(["ordering.gift_purchased", "ordering.gift_paid"]);
    await svc.cancel(gift.id);
    expect((await promos.findByCode("GIFT-TEST-0001"))!.active).toBe(false);
  });
});

// Тип шины используется контейнером; здесь — проверка, что фейк удовлетворяет интерфейсу событий.
export type _Bus = EventBus;

describe("Ordering: коды-приглашения", () => {
  const invite = async (promos: MemPromos, ownerId = "friend-owner") => {
    const p = PromoCode.create(promos.nextId(), { code: "ASEL-7K2Q", kind: "percent", value: 10, ownerId, firstOrderOnly: true }, new Date("2026-01-01"));
    await promos.add(p);
    return p;
  };

  it("свой код применить нельзя, на повторный заказ код «на первую книгу» не подходит", () => {
    const p = PromoCode.create("p", { code: "ASEL-7K2Q", kind: "percent", value: 10, ownerId: "u-owner", firstOrderOnly: true }, new Date("2026-01-01"));
    const now = new Date("2026-03-01");
    expect(p.rejection(now, { userId: "u-owner", hasPaidOrders: false })).toBe("ownCode");
    expect(p.rejection(now, { userId: "u-friend", hasPaidOrders: true })).toBe("firstOrderOnly");
    expect(p.rejection(now, { userId: "u-friend", hasPaidOrders: false })).toBeNull();
    // Без покупателя (страница активации) правила покупателя не применяются.
    expect(p.rejection(now)).toBeNull();
  });

  it("PromoService.check учитывает покупателя", async () => {
    const promos = new MemPromos();
    const orders = new MemOrders();
    await invite(promos, "user-1");
    const svc = new PromoService(promos, orders, clock());
    expect(await svc.check("asel-7k2q", "user-1")).toEqual({ ok: false, error: "ownCode" });
    const ok = await svc.check("asel-7k2q", "user-2");
    expect(ok.ok && ok.promo.ownerId).toBe("user-1");
    expect(await svc.issueReferral({ ownerId: "user-3", code: "ASEL-7K2Q", percent: 10, note: "" })).toBeNull();
    expect((await svc.referralOf("user-1"))?.code).toBe("ASEL-7K2Q");
  });

  it("заказ: друг получает скидку на первую книгу, второй раз — нет, владелец — никогда", async () => {
    const { place, promos, books, svc } = setup();
    await invite(promos);
    const first = await place({ promoCode: "ASEL-7K2Q" });
    expect(first.snapshot().price.discountAmount).toBeGreaterThan(0);
    await svc.confirmPayment({ orderId: first.id, paymentId: null }, admin);

    books.books.set("book-2", { userId: "user-1", status: "draft", blocking: null });
    await expect(place({ bookId: "book-2", promoCode: "ASEL-7K2Q" })).rejects.toMatchObject({ code: "firstOrderOnly" });

    books.books.set("book-3", { userId: "friend-owner", status: "draft", blocking: null });
    await expect(place({ userId: "friend-owner", bookId: "book-3", promoCode: "ASEL-7K2Q" })).rejects.toMatchObject({ code: "ownCode" });
  });
});
