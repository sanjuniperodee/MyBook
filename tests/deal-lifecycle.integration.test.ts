import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, pool } from "@/shared/infrastructure/db";
import { systemClock } from "@/shared/application";
import type { DomainEvent } from "@/shared/domain";
import { DrizzleUnitOfWork } from "@/shared/infrastructure/DrizzleUnitOfWork";
import { InProcessEventBus } from "@/shared/infrastructure/InProcessEventBus";
import type { OutboxDispatcher } from "@/shared/infrastructure/OutboxDispatcher";
import { DealsService, SiteFunnelService, type DealInvoicesPort } from "@/modules/sales/application";
import { DrizzleDealRepository, DrizzleFunnelRepository, DrizzleSalesQueries } from "@/modules/sales/infrastructure/persistence";
import { duplicateGroups } from "@/modules/reporting/infrastructure/Duplicates";
import { drizzleClients } from "@/modules/sales/infrastructure/adapters";
import { agreementForClient, attachAgreementOrder, dealMoney } from "@/modules/sales/infrastructure/agreements";
import { setDealAgreedPlan } from "@/modules/sales/infrastructure/agreedPlan";
import { DealPayments } from "@/modules/sales/infrastructure/payments";
import { DealInvoiceLifecycle, DealInvoicesService, OrdersService, type InvoiceSales } from "@/modules/ordering/application";
import { DrizzleDealInvoiceRepository } from "@/modules/ordering/infrastructure/persistence/DrizzleDealInvoiceRepository";
import { DrizzleDealInvoiceLifecycleStore } from "@/modules/ordering/infrastructure/persistence/DrizzleDealInvoiceLifecycleStore";
import { DrizzleOrderRepository } from "@/modules/ordering/infrastructure/persistence/DrizzleOrderRepository";
import { DrizzlePromoCodeRepository } from "@/modules/ordering/infrastructure/persistence/DrizzlePromoCodeRepository";

/**
 * Деньги и счета в жизни сделки и заказа на PostgreSQL (chat-invoices 1.3–1.5, 1.10): слияние переносит платежи, чеки
 * и счета (открыт у обеих — открытый счёт сливаемой отменяется), удаление сделки со счётом — нельзя, с отменёнными — можно,
 * закрытие и отклонение сделки отменяют счёт (подписчик), заказ по договорённости закрывает счёт и пишет переплату,
 * отмена заказа возвращает договорённость и счёт можно выставить снова.
 * Запуск: INTEGRATION=1 npx vitest run tests/deal-lifecycle.integration.test.ts (база из DATABASE_URL с миграциями).
 */
const run = process.env.INTEGRATION === "1" ? describe : describe.skip;
const tag = `dl${Date.now()}`;

run("жизнь сделки: деньги и счета (PostgreSQL)", () => {
  const q = async <T extends Record<string, unknown>>(query: ReturnType<typeof sql>) => (await db.execute<T>(query)).rows;
  const ids: Record<string, string> = {};
  const stages: Record<"open" | "won" | "lost", string> = { open: "", won: "", lost: "" };

  // События, которые команды записали бы в outbox (здесь — в память; доставляем сами).
  const events: DomainEvent[] = [];
  const outbox = { enqueue: async (list: readonly DomainEvent[]) => (events.push(...list), []), dispatch: async () => 0 } as unknown as OutboxDispatcher;
  const uow = new DrizzleUnitOfWork(outbox);
  const repo = new DrizzleDealRepository();
  const funnels = new DrizzleFunnelRepository();
  const lifecycle = new DealInvoiceLifecycle(new DrizzleDealInvoiceLifecycleStore(), uow);
  const port: DealInvoicesPort = { moveAll: (i) => lifecycle.moveAll(i), holdForDelete: (id) => lifecycle.holdForDelete(id), purgeClosed: (id) => lifecycle.purgeClosed(id) };
  const settings = { unsortedEnabled: async () => true, autoDealFrom: async () => "off" as const, reassignMinutes: async () => 15, mergeClosedDays: async () => 14, entryStageId: async () => null };
  const router = { isWorkTime: async () => false, lock: async () => {}, next: async () => null, isActive: async () => false };
  const deals = new DealsService(repo, funnels, drizzleClients, settings, router, uow, systemClock, port);
  const site = new SiteFunnelService(repo, funnels, drizzleClients, settings, { progress: async () => null }, deals, { info: () => {}, warn: () => {}, error: () => {} }, dealMoney);
  const payments = new DealPayments();
  const invoiceSales: InvoiceSales = {
    deal: async (dealId) => {
      const d = await deals.findById(dealId);
      if (!d) return null;
      const stage = await deals.stage(d.stageId);
      return { id: d.id, number: d.number, title: d.title, clientId: d.clientId, assigneeId: d.assigneeId, amount: d.amount, paid: await payments.paidTotal(d.id), orderId: d.orderId, closed: !!stage && stage.kind !== "open" };
    },
    setAgreement: async (dealId, { plan, agreedTotal, actorId }) => {
      await setDealAgreedPlan(dealId, plan);
      await deals.setAgreedTotal(dealId, agreedTotal, actorId);
    },
    acceptOnline: async (input) => {
      const row = await payments.addOnline(input);
      return row ? { paymentId: row.id } : null;
    },
  };
  const invoices = new DealInvoicesService(new DrizzleDealInvoiceRepository(), invoiceSales, uow, systemClock);
  const books = { checkoutInfo: async () => ({ status: "draft" as const, blockingIssue: null, estimatedPages: 40 }), lockForOrder: async () => true, unlock: async () => {}, toggleEditing: async () => "draft" as const };
  const people = { rememberPhoneIfMissing: async () => {}, activeStaff: async () => null };
  const orders = new OrdersService(new DrizzleOrderRepository(), new DrizzlePromoCodeRepository(), books, people, { prepare: async () => null }, { provider: () => "manual", currency: () => "KZT" }, { agreementFor: agreementForClient, attachOrder: attachAgreementOrder }, uow, systemClock, undefined, lifecycle);

  /** Подписчики жизни сделки — те же, что в приложении (src/server/subscriptions.ts), поверх настоящих сервисов. */
  const bus = new InProcessEventBus({ info: () => {}, warn: () => {}, error: (m: string, e?: unknown) => console.error(m, e) });
  const deliver = async (type: string) => {
    const due = events.filter((e) => e.type === type);
    events.splice(0, events.length, ...events.filter((e) => e.type !== type));
    await bus.publish(due);
  };

  const deal = async (key: string, opts: { amount?: number; stage?: "open" | "won"; client?: string; source?: string; plan?: string; unsorted?: boolean } = {}) => {
    const [d] = await q<{ id: string }>(sql`
      insert into crm_deals (title, stage_id, amount, source, client_id, assignee_id, contact_name, agreed_plan, unsorted, closed_at)
      values (${tag + key}, ${stages[opts.stage ?? "open"]}, ${opts.amount ?? 20000}, ${opts.source ?? "whatsapp"}, ${opts.client ?? null}, ${ids.mgr}, 'Клиент', ${opts.plan ?? null}, ${!!opts.unsorted}, ${opts.stage === "won" ? sql`now()` : sql`null`})
      returning id`);
    return (ids[key] = d.id);
  };
  const pay = async (dealId: string, amount: number) => {
    const [p] = await q<{ id: string }>(sql`insert into crm_payments (deal_id, client_id, amount, kind) values (${dealId}, null, ${amount}, 'prepayment') returning id`);
    return p.id;
  };
  let tokenSeq = 0;
  const bill = async (dealId: string, status: "pending_payment" | "paid" | "cancelled" | "expired" = "pending_payment") => {
    const token = `${tag}${++tokenSeq}`.padEnd(43, "x");
    const [r] = await q<{ id: string; number: number }>(sql`
      insert into deal_invoices (token, deal_id, plan, agreed_total, amount, purpose, status, expires_at)
      values (${token}, ${dealId}, 'hardcover', 20000, 10000, 'prepayment', ${status}, now() + interval '7 days') returning id, number`);
    return { id: r.id, label: `P${r.number}` };
  };
  const invoiceRow = async (id: string) => (await q<{ deal_id: string; status: string; closed_reason: string | null }>(sql`select deal_id, status, closed_reason from deal_invoices where id = ${id}`))[0];
  const dealRow = async (id: string) => (await q<{ id: string; stage_id: string; order_id: string | null; amount: number; lost_reason: string | null }>(sql`select id, stage_id, order_id, amount, lost_reason from crm_deals where id = ${id}`))[0];

  beforeAll(async () => {
    const funnel = await funnels.load();
    stages.open = funnel.firstOfKind("open")!.id;
    stages.won = funnel.firstOfKind("won")!.id;
    stages.lost = funnel.firstOfKind("lost")!.id;
    const [mgr] = await q<{ id: string }>(sql`insert into users (email, password_hash, name, role) values (${tag + "m@t.kz"}, 'x', 'Менеджер', 'admin') returning id`);
    ids.mgr = mgr.id;
    for (const c of ["c1", "c2"]) {
      const [u] = await q<{ id: string }>(sql`insert into users (email, password_hash, name) values (${tag + c + "@t.kz"}, 'x', 'Клиент') returning id`);
      ids[c] = u.id;
      const [b] = await q<{ id: string }>(sql`insert into books (user_id, theme, title, author_name, recipient_name) values (${u.id}, 'love', 'Т', 'А', 'Б') returning id`);
      ids[`book_${c}`] = b.id;
    }
    const { registerSubscriptions } = await import("@/server/subscriptions");
    registerSubscriptions({ bus, sales: { deals, funnel: site }, ordering: { invoices } } as never);
  });

  afterAll(async () => {
    const mine = sql`(select id from crm_deals where title like ${tag + "%"})`;
    await q(sql`delete from payment_invoices where external_id like ${tag + "%"}`);
    await q(sql`delete from deal_invoices where deal_id in ${mine} or token like ${tag + "%"}`);
    await q(sql`delete from crm_deals where title like ${tag + "%"}`);
    await q(sql`delete from orders where user_id in (${ids.c1}, ${ids.c2})`);
    await q(sql`delete from books where user_id in (${ids.c1}, ${ids.c2})`);
    await q(sql`delete from users where email like ${tag + "%"}`);
    await pool.end();
  });

  it("слияние: платежи, чеки и счета — в целевую; открыт у обеих — открытый счёт сливаемой отменён; тариф договорённости переходит", async () => {
    const target = await deal("mergeT");
    const source = await deal("mergeS", { plan: "hardcover" });
    const p = await pay(source, 10000);
    await q(sql`insert into crm_receipts (deal_id, payment_id, storage_key, file_name, mime, size, amount) values (${source}, ${p}, ${"receipts/" + source + "/x.pdf"}, 'чек.pdf', 'application/pdf', 1, 10000)`);
    const [sOpen, sPaid, tOpen] = [await bill(source), await bill(source, "paid"), await bill(target)];
    await deals.merge(target, source, ids.mgr);
    expect(await dealRow(source)).toBeUndefined();
    expect(await q(sql`select amount from crm_payments where deal_id = ${target}`)).toEqual([{ amount: 10000 }]);
    expect(await q(sql`select file_name from crm_receipts where deal_id = ${target}`)).toEqual([{ file_name: "чек.pdf" }]);
    expect(await invoiceRow(sOpen.id)).toEqual({ deal_id: target, status: "cancelled", closed_reason: "сделки объединены" });
    expect(await invoiceRow(sPaid.id)).toMatchObject({ deal_id: target, status: "paid" });
    expect(await invoiceRow(tOpen.id)).toMatchObject({ deal_id: target, status: "pending_payment" });
    expect(await q(sql`select agreed_plan from crm_deals where id = ${target}`)).toEqual([{ agreed_plan: "hardcover" }]);
    const notes = await q<{ text: string }>(sql`select text from crm_notes where deal_id = ${target}`);
    expect(notes.map((n) => n.text)).toContainEqual(expect.stringContaining(`отменены открытые ${sOpen.label} (сделки объединены)`));
  });

  /** Заказ клиента c2 (вставкой: книга остаётся черновиком) — к успешной сделке. */
  const withOrder = async (dealId: string) => {
    const [o] = await q<{ id: string }>(sql`
      insert into orders (user_id, book_id, plan, items_amount, amount, currency, payment_provider, contact_name, contact_email, contact_phone, status, paid_at)
      values (${ids.c2}, ${ids.book_c2}, 'hardcover', 20000, 20000, 'KZT', 'cloudpayments', ${tag}, ${`${tag}@test.kz`}, '77010000000', 'paid', now())
      returning id`);
    await q(sql`update crm_deals set order_id = ${o.id} where id = ${dealId}`);
  };

  it("слияние в успешную сделку заказа (заявка той же покупки) — открытый счёт дубля отменяется, а не висит у закрытой", async () => {
    const target = await deal("wonT", { stage: "won" });
    await withOrder(target);
    const source = await deal("wonS");
    const open = await bill(source);
    await deals.merge(target, source, ids.mgr);
    expect(await invoiceRow(open.id)).toMatchObject({ deal_id: target, status: "cancelled", closed_reason: "сделки объединены, а сделка закрыта или по ней заказ" });
  });

  it("новую заявку в прошлогоднюю успешную сделку не вливают (deals-d6): заявка, её счёт и этап на месте", async () => {
    const lastYear = await deal("oldWon", { stage: "won" });
    await withOrder(lastYear);
    await q(sql`update crm_deals set closed_at = now() - interval '365 days', created_at = now() - interval '370 days' where id = ${lastYear}`);
    const fresh = await deal("newLead");
    const open = await bill(fresh);
    await expect(deals.merge(lastYear, fresh, ids.mgr)).rejects.toMatchObject({ code: "mergeIntoClosed" });
    expect(await dealRow(fresh)).toMatchObject({ stage_id: stages.open });
    expect(await invoiceRow(open.id)).toMatchObject({ deal_id: fresh, status: "pending_payment" });
  });

  it("слияние переносит историю этапов дубля в целевую; выигранный дубль не вливается — его счёт и этап на месте", async () => {
    const target = await deal("histT");
    const source = await deal("histS");
    await q(sql`insert into crm_stage_history (deal_id, from_stage_id, to_stage_id, actor_id) values (${source}, null, ${stages.open}, ${ids.mgr})`);
    await deals.merge(target, source, ids.mgr);
    expect(await q(sql`select from_stage_id, to_stage_id from crm_stage_history where deal_id = ${target}`)).toEqual([{ from_stage_id: null, to_stage_id: stages.open }]);

    const won = await deal("histWon", { stage: "won" });
    const paid = await bill(won, "paid");
    await expect(deals.merge(target, won, ids.mgr)).rejects.toMatchObject({ code: "mergeClosed" });
    expect(await dealRow(won)).toMatchObject({ stage_id: stages.won });
    expect(await invoiceRow(paid.id)).toMatchObject({ deal_id: won, status: "paid" });
  });

  it("«Похоже на дубль» — только открытые сделки контакта, закрытые — прошлые; группы дублей — только из открытых", async () => {
    const phone = `7701${String(Date.now()).slice(-7)}`;
    const mk = async (key: string, stage: "open" | "won") => {
      const id = await deal(key, { stage });
      await q(sql`update crm_deals set contact_phone = ${phone} where id = ${id}`);
      return id;
    };
    const [self, open, won] = [await mk("dupSelf", "open"), await mk("dupOpen", "open"), await mk("dupWon", "won")];
    const related = await new DrizzleSalesQueries().duplicates({ id: self, clientId: null, contactEmail: null, contactPhone: phone, extraPhones: [] });
    expect(related.open.map((r) => r.deal.id)).toEqual([open]);
    expect(related.past.map((r) => r.deal.id)).toEqual([won]);
    const group = (await duplicateGroups()).find((g) => g.key === phone.slice(-10));
    expect(group?.deals.map((d) => d.id).sort()).toEqual([self, open].sort());
  });

  it("удаление: счёт ждёт оплаты — 409 понятным текстом; отменённые и истёкшие — удаляются вместе со сделкой; счёт Kaspi ещё ждёт — нельзя", async () => {
    const withOpen = await deal("delOpen");
    const open = await bill(withOpen);
    await expect(deals.delete(withOpen)).rejects.toMatchObject({ code: "dealHasInvoice", message: `У сделки есть счёт ${open.label} — отмените его или объедините сделки` });
    expect(await dealRow(withOpen)).toBeDefined();

    const closed = await deal("delClosed");
    const [cancelled, expired] = [await bill(closed, "cancelled"), await bill(closed, "expired")];
    await q(sql`insert into payment_invoices (provider, target_kind, target_id, method, external_id, amount, status) values ('kaspi', 'deal_invoice', ${cancelled.id}, 'invoice', ${tag + "k1"}, 10000, 'pending')`);
    await expect(deals.delete(closed)).rejects.toMatchObject({ code: "dealHasInvoice", message: expect.stringContaining(`По счёту ${cancelled.label} ещё может прийти оплата Kaspi`) });
    await q(sql`update payment_invoices set status = 'cancelled' where external_id = ${tag + "k1"}`);
    await deals.delete(closed);
    expect(await dealRow(closed)).toBeUndefined();
    expect(await q(sql`select id from deal_invoices where id in (${cancelled.id}, ${expired.id})`)).toEqual([]);

    const withMoney = await deal("delMoney");
    await pay(withMoney, 5000);
    await bill(withMoney, "cancelled");
    await expect(deals.delete(withMoney)).rejects.toMatchObject({ code: "dealHasPayments" });
    expect(await q(sql`select count(*)::int as n from deal_invoices where deal_id = ${withMoney}`)).toEqual([{ n: 1 }]);
  });

  it("сделка проиграна — событие → подписчик отменяет её открытый счёт, в ленте — запись", async () => {
    const d = await deal("lost");
    const open = await bill(d);
    await deals.move(d, stages.lost, ids.mgr, "Дорого");
    await deliver("sales.deal_closed");
    expect(await invoiceRow(open.id)).toMatchObject({ status: "cancelled", closed_reason: "сделка проиграна (Дорого)" });
    const notes = await q<{ text: string }>(sql`select text from crm_notes where deal_id = ${d}`);
    expect(notes.map((n) => n.text)).toContainEqual(expect.stringMatching(new RegExp(`^Счёт ${open.label} на .+ отменён: сделка проиграна \\(Дорого\\)$`)));
  });

  it("отклонение руководителем: заявка со счётом не удаляется, а закрывается «отказом»; счёт отменяет подписчик", async () => {
    const d = await deal("reject", { unsorted: true });
    const open = await bill(d);
    expect(await deals.reject(d, { kind: "spam", reason: "реклама", actorId: ids.mgr })).toMatchObject({ deleted: false });
    expect(await dealRow(d)).toMatchObject({ stage_id: stages.lost, lost_reason: "Спам: реклама" });
    await deliver("sales.deal_closed");
    expect(await invoiceRow(open.id)).toMatchObject({ status: "cancelled" });
    const empty = await deal("rejectEmpty", { unsorted: true });
    await bill(empty, "expired");
    expect(await deals.reject(empty, { kind: "reject", actorId: ids.mgr })).toMatchObject({ deleted: true });
    expect(await dealRow(empty)).toBeUndefined();
  });

  it("заказ по договорённости закрывает открытый счёт в своей транзакции и сразу привязывается к сделке; отмена заказа возвращает договорённость — счёт можно выставить снова", async () => {
    const d = await deal("agreed", { client: ids.c1, plan: "hardcover", amount: 20000 });
    await pay(d, 10000);
    const open = await bill(d);
    const order = await orders.place({ userId: ids.c1, userPhone: "+77010000000", locale: "ru", bookId: ids.book_c1, plan: "hardcover", quantity: 1, delivery: { method: "courier", city: "Алматы", address: "Абая, 1", postalCode: null }, addons: [], contact: { name: "Айжан", phone: "+77010000000", email: "a@b.kz" } });
    // книга по договорённости 20 000 + доставка сверху; внесено 10 000
    expect(order.snapshot().price).toMatchObject({ prepaidAmount: 10000 });
    expect(await invoiceRow(open.id)).toMatchObject({ status: "cancelled", closed_reason: `оформлен заказ №${order.number}` });
    expect((await dealRow(d)).order_id).toBe(order.id);
    // новый счёт по сделке с заказом не выставить
    await expect(invoices.issue({ dealId: d, conversationId: null, phone: null, clientName: "Айжан", locale: "ru", channel: "whatsapp", plan: "hardcover", agreedTotal: 20000, amount: 5000, purpose: "remainder", actor: { userId: ids.mgr, label: "m" }, maxDiscountPercent: null })).rejects.toMatchObject({ code: "paymentRule" });

    // подписчик воронки: заказ — к этой же сделке (не дубль), её сумма — цена договорённости (без доставки)
    const placed = events.find((e) => e.type === "ordering.order_placed" && (e.payload as { orderId: string }).orderId === order.id)!.payload as { amount: number; prepaid: number; number: number; agreementDealId: string };
    expect(placed.agreementDealId).toBe(d);
    await site.orderCreated({ id: order.id, userId: ids.c1, number: placed.number, amount: placed.amount + placed.prepaid, dealId: placed.agreementDealId });
    expect(await dealRow(d)).toMatchObject({ order_id: order.id, amount: 20000 });

    await orders.changeStatus({ orderId: order.id, to: "cancelled" }, { label: "admin" });
    await site.orderCancelled(order.id, order.number);
    const back = await dealRow(d);
    expect(back).toMatchObject({ order_id: null, amount: 20000 });
    expect((await funnels.load()).stage(back.stage_id)?.kind).toBe("open");
    expect(await agreementForClient(ids.c1)).toMatchObject({ dealId: d, agreedTotal: 20000, prepaid: 10000, plan: "hardcover" });
    const again = await invoices.issue({ dealId: d, conversationId: null, phone: null, clientName: "Айжан", locale: "ru", channel: "whatsapp", plan: "hardcover", agreedTotal: 20000, amount: 10000, purpose: "remainder", actor: { userId: ids.mgr, label: "m" }, maxDiscountPercent: null });
    expect(again.invoice.status).toBe("pending_payment");
  });

  it("внесено больше итога заказа — в журнале заказа «переплата N ₸ по договорённости — нужен возврат», в событии prepaidExcess", async () => {
    const d = await deal("excess", { client: ids.c2, plan: "hardcover", amount: 20000 });
    await pay(d, 25000);
    const order = await orders.place({ userId: ids.c2, userPhone: "+77010000001", locale: "ru", bookId: ids.book_c2, plan: "hardcover", quantity: 1, delivery: { method: "pickup", city: null, address: null, postalCode: null }, addons: [], contact: { name: "Айжан", phone: "+77010000001", email: "b@b.kz" } });
    expect(order.snapshot().price).toMatchObject({ prepaidAmount: 20000, amount: 0 });
    const journal = await q<{ note: string }>(sql`select note from order_events where order_id = ${order.id}`);
    expect(journal.map((j) => j.note)).toContainEqual(expect.stringMatching(/^Переплата 5\s000 ₸ по договорённости — нужен возврат$/));
    const placed = events.find((e) => e.type === "ordering.order_placed" && (e.payload as { orderId: string }).orderId === order.id)!;
    expect(placed.payload).toMatchObject({ agreementDealId: d, prepaidExcess: 5000 });
    expect(await q(sql`select status from orders where id = ${order.id}`)).toEqual([{ status: "paid" }]);
  });
});
