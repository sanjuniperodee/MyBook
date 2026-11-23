import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { ReceiptCheck } from "@/shared/domain/receipt";
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
  findByRequestKey = async (key: string) => this.rows.find((r) => r.requestKey === key) ?? null;
  review = async (id: string, by: string, at: Date) => void Object.assign(this.rows.find((r) => r.id === id)!, { reviewedById: by, reviewedAt: at });
  void = async (id: string, by: string, at: Date, reason: string) => void Object.assign(this.rows.find((r) => r.id === id)!, { voidedById: by, voidedAt: at, voidReason: reason });
  tagKaspiForms = async (forms: Record<string, string>) =>
    this.rows.filter((r) => r.method === "kaspi" && r.externalRef && forms[r.externalRef] && !r.payForm).map((r) => ((r.payForm = forms[r.externalRef!]), { orderId: r.orderId, form: r.payForm! }));
}

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const staff = { label: "admin:m@b.kz", userId: "m1" };

function setup(opts: { checkReceipts?: boolean } = {}) {
  const base = orderingSetup();
  const payments = new MemPayments();
  const files = new Map<string, Buffer>();
  const uow = new FakeUow([base.orders, payments]);
  const c = clock("2026-10-10T10:00:00Z");
  // Повтор чека — как в базе: тот же хэш у живого (не отменённого) платежа; номер заказа — из заказа платежа.
  const checkReceipt: ReceiptCheck = async (bytes) => {
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const used = payments.rows.find((r) => r.receipt?.sha256 === sha256 && !r.voidedAt);
    const order = used ? await base.orders.findById(used.orderId) : null;
    return { sha256, use: used ? { source: "order", number: order?.number ?? 0, amount: used.amount, paidAt: used.paidAt, orderId: used.orderId } : null };
  };
  const money = new OrderPaymentsService(base.orders, payments, { put: async (k, b) => void files.set(k, b), remove: async (k) => void files.delete(k), read: async (k) => files.get(k) ?? null }, uow, c, opts.checkReceipts ? checkReceipt : undefined);
  const svc = new OrdersService(base.orders, base.promos, base.books, { activeStaff: async () => null, rememberPhoneIfMissing: async () => {} } as never, { prepare: async () => null }, { provider: () => "manual", currency: () => "KZT" }, { agreementFor: async () => null }, uow, c, money);
  const order = async () => {
    const o = await base.place();
    return o;
  };
  const manual = (orderId: string, amount: number, bytes = PNG) => money.acceptManual({ orderId, amount, paidAt: c.now(), note: "", receipt: { bytes, fileName: "чек.png" }, actor: staff });
  return { ...base, payments, files, uow, c, money, svc, order, manual };
}

/** Тот же заказ, но OrdersService без журнала денег — путь подтверждения заказа без записи в order_payments. */
const orderingSvc = (t: ReturnType<typeof setup>) =>
  new OrdersService(t.orders, t.promos, t.books, { activeStaff: async () => null, rememberPhoneIfMissing: async () => {} } as never, { prepare: async () => null }, { provider: () => "manual", currency: () => "KZT" }, { agreementFor: async () => null }, t.uow, t.c);

/**
 * Блокировка строки заказа, как SELECT … FOR UPDATE: lockById внутри run() ждёт, пока другая транзакция с этим заказом
 * не закончится; вложенный run() — та же транзакция. findById не ждёт (чтение без блокировки).
 */
function rowLocks(t: ReturnType<typeof setup>) {
  const tx = new AsyncLocalStorage<{ held: Set<string>; release: (() => void)[] }>();
  const queue = new Map<string, Promise<void>>();
  const run = t.uow.run.bind(t.uow);
  t.uow.run = <T,>(work: () => Promise<T>) => {
    if (tx.getStore()) return run(work);
    const ctx = { held: new Set<string>(), release: [] as (() => void)[] };
    return tx.run(ctx, () => run(work).finally(() => ctx.release.forEach((r) => r())));
  };
  const lock = t.orders.lockById.bind(t.orders);
  t.orders.lockById = async (id: string) => {
    const ctx = tx.getStore();
    if (ctx && !ctx.held.has(id)) {
      const before = queue.get(id) ?? Promise.resolve();
      let release!: () => void;
      const mine = new Promise<void>((r) => (release = r));
      queue.set(id, before.then(() => mine));
      ctx.held.add(id);
      ctx.release.push(release);
      await before;
    }
    return lock(id);
  };
}

describe("Деньги по заказу", () => {
  it("форма оплаты перевода сохраняется в записи; онлайн-оплате Kaspi форму ставит история кассы — один раз", async () => {
    const t = setup();
    const o = await t.order();
    await t.money.acceptManual({ orderId: o.id, amount: 1000, paidAt: t.c.now(), note: "", payForm: "Kaspi Red", receipt: { bytes: PNG, fileName: "чек.png" }, actor: staff });
    expect(t.payments.rows[0].payForm).toBe("Kaspi Red");
    t.payments.rows.push({ id: "k1", orderId: o.id, kind: "payment", amount: 500, method: "kaspi", externalRef: "777", payForm: null, paidAt: t.c.now(), note: "", receipt: null, createdById: null, reviewedById: null, reviewedAt: null, createdAt: t.c.now() });
    expect(await t.money.tagKaspiForms({ "777": "Kaspi Рассрочка", "888": "Kaspi Gold" })).toEqual([{ orderId: o.id, form: "Kaspi Рассрочка" }]);
    expect(await t.money.tagKaspiForms({ "777": "Kaspi Gold" })).toEqual([]);
    expect(t.payments.rows.find((r) => r.id === "k1")!.payForm).toBe("Kaspi Рассрочка");
  });

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

  it("та же отправка формы ещё раз (сбой ответа) — тот же платёж: денег не прибавилось, файл второй раз не лежит", async () => {
    const t = setup({ checkReceipts: true });
    const o = await t.order();
    const send = () => t.money.acceptManual({ orderId: o.id, amount: 1000, paidAt: t.c.now(), note: "", receipt: { bytes: PNG, fileName: "чек.png" }, requestKey: "11111111-1111-4111-8111-111111111111", actor: staff });
    const first = await send();
    // Тот же чек к той же покупке без ключа отклоняется — с ключом это повтор, а не второй платёж.
    const again = await send();
    expect([first.repeated, again.repeated, again.payment.id]).toEqual([false, true, first.payment.id]);
    expect([(await t.orders.findById(o.id))!.received, t.payments.rows.length, t.files.size]).toEqual([1000, 1, 1]);
    // Двойное нажатие: обе отправки одновременно — одна запись.
    const t2 = setup();
    rowLocks(t2);
    const o2 = await t2.order();
    const both = await Promise.all([0, 1].map(() => t2.money.acceptManual({ orderId: o2.id, amount: 700, paidAt: t2.c.now(), note: "", receipt: { bytes: PNG, fileName: "чек.png" }, requestKey: "22222222-2222-4222-8222-222222222222", actor: staff })));
    expect(both.map((r) => r.repeated).sort()).toEqual([false, true]);
    expect([(await t2.orders.findById(o2.id))!.received, t2.payments.rows.length, t2.files.size]).toEqual([700, 1, 1]);
    // Ключ другого заказа — ошибка формы, а не чужой платёж.
    t.payments.rows.push({ ...t.payments.rows[0], id: "foreign", orderId: "other-order", requestKey: "33333333-3333-4333-8333-333333333333" });
    await expect(t.money.acceptManual({ orderId: o.id, amount: 1, paidAt: t.c.now(), note: "", receipt: { bytes: PNG, fileName: "x.png" }, requestKey: "33333333-3333-4333-8333-333333333333", actor: staff })).rejects.toMatchObject({ code: "paymentRule" });
  });

  it("две разные оплаты одного заказа в одну секунду: по очереди под блокировкой — одна оплатила, вторая «нужен возврат»", async () => {
    // С журналом денег (как на проде) и без него (старый путь): вторая оплата видит заказ уже оплаченным.
    for (const withJournal of [true, false]) {
      const t = setup();
      const svc = withJournal ? t.svc : orderingSvc(t);
      rowLocks(t);
      const o = await t.order();
      const pay = (op: string) => svc.acceptProviderPayment({ orderId: o.id, paymentId: `kaspi:${op}`, provider: "Kaspi", operationId: op, amount: o.amount }, admin);
      const results = await Promise.all([pay("A1"), pay("B2")]);
      expect([...results].sort()).toEqual(["paid", "refundNeeded"]);
      const fresh = (await t.orders.findById(o.id))!;
      expect(fresh.status).toBe("paid");
      if (withJournal) expect(fresh.received).toBe(o.amount * 2);
      else expect(t.orders.history.some((h) => h.orderId === o.id && /повторная оплата .* нужен возврат/.test(h.note))).toBe(true);
    }
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

describe("Ошибочный платёж и повторный чек (заказ №110: «доплата» тем же чеком)", () => {
  const png = (n: number) => Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, n]);

  it("тот же чек ко второму платежу (любого заказа) — отказ с тем, к какому приложен; файл не сохраняется", async () => {
    const t = setup({ checkReceipts: true });
    const o = await t.order();
    await t.manual(o.id, 15000, png(1));
    const files = t.files.size;
    await expect(t.manual(o.id, 9000, png(1))).rejects.toMatchObject({ code: "paymentRule", message: expect.stringMatching(/уже приложен к платежу 15\s000 ₸ от .* заказа №\d+/) });
    expect([t.payments.rows.length, t.files.size]).toEqual([1, files]);
    // Другой чек — принимается; хэш записан у платежа.
    await t.manual(o.id, 9000, png(2));
    expect(t.payments.rows.map((r) => r.receipt?.sha256?.length)).toEqual([64, 64]);
  });

  it("руководитель отменяет фиктивный платёж: в журнале с пометкой, получено меньше, заказ снова ждёт оплату; чек можно приложить заново", async () => {
    const t = setup({ checkReceipts: true });
    const o = await t.order();
    await t.manual(o.id, o.amount - 9000, png(1));
    const fake = await t.manual(o.id, 9000, png(2));
    expect((await t.orders.findById(o.id))!.status).toBe("paid");
    await expect(t.money.voidPayment({ paymentId: fake.payment.id, reason: " ", actor: staff })).rejects.toMatchObject({ code: "paymentRule" });
    const r = await t.money.voidPayment({ paymentId: fake.payment.id, reason: "тот же чек, денег не было", actor: staff });
    expect(r).toMatchObject({ received: o.amount - 9000, outstanding: 9000, reopened: true, payment: { voidReason: "тот же чек, денег не было" } });
    const fresh = (await t.orders.findById(o.id))!;
    expect([fresh.status, fresh.isSettled, fresh.received]).toEqual(["pending_payment", false, o.amount - 9000]);
    // Запись осталась (не удалена) — помечена отменённой; повторно — нельзя; проверить отменённый — нельзя.
    expect(t.payments.rows.map((r) => [r.amount, !!r.voidedAt])).toEqual([[o.amount - 9000, false], [9000, true]]);
    await expect(t.money.voidPayment({ paymentId: fake.payment.id, reason: "ещё раз", actor: staff })).rejects.toMatchObject({ message: "Платёж уже отменён" });
    expect(await t.money.review(fake.payment.id, "boss")).toBeNull();
    // Чек отменённого платежа — к настоящей оплате можно.
    await t.manual(o.id, 9000, png(2));
    expect((await t.orders.findById(o.id))!.status).toBe("paid");
  });

  it("фиктивная пара «платёж + возврат» — одной отменой: обе записи помечены, получено прежнее, без событий о деньгах", async () => {
    const t = setup();
    const o = await t.order();
    await t.manual(o.id, o.amount);
    const fake = await t.manual(o.id, 9000, Buffer.concat([PNG, Buffer.from([7])]));
    const back = await t.money.refund({ orderId: o.id, amount: 9000, note: "Ааааа", actor: staff });
    const types = t.uow.types().length;
    const r = await t.money.voidPayment({ paymentId: back.payment.id, also: [fake.payment.id], reason: "фиктивная пара, денег не было", actor: { label: "сверка", userId: null } });
    expect([r.received, r.reopened]).toEqual([o.amount, false]);
    expect(t.payments.rows.filter((p) => p.voidedAt).map((p) => p.id).sort()).toEqual([back.payment.id, fake.payment.id].sort());
    expect(t.uow.types().slice(types).filter((e) => e !== "ordering.order_updated")).toEqual([]);
    // Чужой заказ или онлайн-запись в паре — отказ целиком.
    await expect(t.money.voidPayment({ paymentId: t.payments.rows[0].id, also: ["нет-такого"], reason: "проверка", actor: staff })).rejects.toMatchObject({ message: "Платёж не найден" });
    expect(t.payments.rows[0].voidedAt).toBeFalsy();
  });

  it("онлайн-оплату не отменить — только вернуть", async () => {
    const t = setup();
    const o = await t.order();
    await t.svc.acceptProviderPayment({ orderId: o.id, paymentId: "kaspi:A1", provider: "Kaspi", operationId: "A1", amount: o.amount }, admin);
    await expect(t.money.voidPayment({ paymentId: t.payments.rows[0].id, reason: "ошибка", actor: staff })).rejects.toMatchObject({ message: expect.stringContaining("платёжная система") });
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
  const digital = async (t: ReturnType<typeof setup>, bookId = "book-1") => {
    t.books.books.set(bookId, { userId: "user-1", status: "draft", blocking: null });
    return t.place({ bookId, plan: "digital", delivery: { method: null, city: null, address: null, postalCode: null } });
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

  it("получено меньше — отказ с суммой; доплату приняли в «Оплате» — перевод проходит, заказ оплачен и пойдёт в печать", async () => {
    const t = setup();
    const o = await digital(t);
    await t.manual(o.id, 9900);
    await expect(t.svc.upgradeToPrinted({ orderId: o.id, plan: "hardcover" }, admin)).rejects.toMatchObject({ code: "paymentRule", message: expect.stringContaining("Не хватает 20") });
    let fresh = (await t.orders.findById(o.id))!;
    expect([fresh.plan, fresh.status, fresh.isSettled]).toEqual(["digital", "paid", true]);
    // Доплата по оплаченной электронной — переплата, затем перевод засчитывает всё полученное.
    expect(await t.manual(o.id, 20100)).toMatchObject({ overpaid: 20100 });
    const r = await t.svc.upgradeToPrinted({ orderId: o.id, plan: "hardcover" }, admin);
    expect(r).toMatchObject({ due: 30000, credited: 30000, outstanding: 0, overpaid: 0 });
    fresh = (await t.orders.findById(o.id))!;
    expect([fresh.plan, fresh.status, fresh.isSettled]).toEqual(["hardcover", "paid", true]);
  });

  it("уже печатный, отменённый и неоплаченный — отказ", async () => {
    const t = setup();
    const printed = await t.order();
    await t.manual(printed.id, printed.amount);
    await expect(t.svc.upgradeToPrinted({ orderId: printed.id, plan: "premium" }, admin)).rejects.toMatchObject({ code: "paymentRule", message: "Заказ уже на печатную книгу" });
    // Вторая книга: у первой уже живой заказ, второй на неё не оформить.
    const unpaid = await digital(t, "book-2");
    await expect(t.svc.upgradeToPrinted({ orderId: unpaid.id, plan: "hardcover" }, admin)).rejects.toMatchObject({ message: expect.stringContaining("ещё не оплачена") });
    await t.manual(unpaid.id, 9900);
    await expect(t.svc.upgradeToPrinted({ orderId: unpaid.id, plan: "digital" }, admin)).rejects.toMatchObject({ message: "Выберите печатный тариф" });
    await t.svc.changeStatus({ orderId: unpaid.id, to: "cancelled" }, admin);
    await expect(t.svc.upgradeToPrinted({ orderId: unpaid.id, plan: "hardcover" }, admin)).rejects.toMatchObject({ message: "Заказ отменён: оформите новый заказ" });
  });
});

