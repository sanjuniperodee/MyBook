import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, pool } from "@/shared/infrastructure/db";
import { txStorage } from "@/shared/infrastructure/database";
import { consoleLogger, type UnitOfWork } from "@/shared/application";
import type { AggregateRoot, DomainEvent } from "@/shared/domain";
import { DealInvoicesService, type InvoiceSales } from "@/modules/ordering/application/DealInvoicesService";
import { KaspiPaymentsService } from "@/modules/ordering/application/KaspiPaymentsService";
import { DrizzleDealInvoiceRepository } from "@/modules/ordering/infrastructure/persistence/DrizzleDealInvoiceRepository";
import { DrizzlePaymentInvoiceRepository } from "@/modules/ordering/infrastructure/persistence/DrizzlePaymentInvoiceRepository";
import { CloudPaymentsWebhook } from "@/modules/ordering/infrastructure/payments/CloudPayments";
import { DealPayments } from "@/modules/sales/infrastructure/payments";
import { FakeKaspi } from "./doubles/kaspi";

/**
 * Счёт из чата на настоящем PostgreSQL: одна операция платёжной системы, пришедшая параллельно несколькими путями
 * (вебхук Kaspi + сверка + страница клиента, CloudPayments pay дважды), даёт один платёж в сделке (индекс
 * crm_payments_external_idx) и оплачивает счёт ровно один раз. Порядок блокировок deal_invoices → payment_invoices →
 * crm_deals — без взаимных блокировок. Запуск: INTEGRATION=1 npx vitest run tests/deal-invoice-payments.integration.test.ts
 */
const run = process.env.INTEGRATION === "1" ? describe : describe.skip;
const tag = `dip${Date.now()}`;

run("счёт из чата: параллельные подтверждения (PostgreSQL)", () => {
  const ids: { deals: string[]; invoices: string[]; staff: string } = { deals: [], invoices: [], staff: "" };
  const q = async <T extends Record<string, unknown>>(query: ReturnType<typeof sql>) => (await db.execute<T>(query)).rows;

  // Unit of Work на настоящих транзакциях, но без outbox: события теста не уходят подписчикам запущенного приложения.
  const published: DomainEvent[] = [];
  const uow: UnitOfWork = {
    async run(work) {
      if (txStorage.getStore()) return work();
      let events: DomainEvent[] = [];
      const value = await db.transaction((tx) => {
        const ctx = { tx, events: [] as DomainEvent[], aggregates: new Set<AggregateRoot<object, string | number>>() };
        return txStorage.run(ctx, async () => {
          const v = await work();
          events = [...ctx.aggregates].flatMap((a) => a.pullEvents());
          return v;
        });
      });
      published.push(...events);
      return value;
    },
    track(...aggregates) {
      const ctx = txStorage.getStore();
      if (!ctx) throw new Error("track() вне run()");
      for (const a of aggregates) ctx.aggregates.add(a);
    },
  };

  const payments = new DealPayments();
  const sales: InvoiceSales = {
    deal: async (dealId) => {
      const [d] = await q<{ id: string; number: number; title: string; client_id: string | null; assignee_id: string | null; amount: number; order_id: string | null }>(sql`select id, number, title, client_id, assignee_id, amount, order_id from crm_deals where id = ${dealId}`);
      return d ? { id: d.id, number: d.number, title: d.title, clientId: d.client_id, assigneeId: d.assignee_id, amount: d.amount, paid: await payments.paidTotal(d.id), orderId: d.order_id, closed: false } : null;
    },
    setAgreement: async () => {},
    acceptOnline: async (input) => {
      const row = await payments.addOnline(input);
      return row ? { paymentId: row.id } : null;
    },
  };
  // Страница клиента спрашивает Kaspi, только если попытка не обновлялась 3 секунды: часы сервиса — на минуту вперёд.
  const clock = { now: () => new Date(Date.now() + 60_000) };
  const dealRepo = new DrizzleDealInvoiceRepository();
  const invoices = new DealInvoicesService(dealRepo, sales, uow, clock);
  const kaspi = new FakeKaspi(`${tag}-`);
  kaspi.onlyKnown = true;
  const logger = { ...consoleLogger("test"), warn: () => {}, error: () => {} };
  const ports = { repo: dealRepo, service: invoices, sales, clock };
  const svc = new KaspiPaymentsService(new DrizzlePaymentInvoiceRepository(), {} as never, {} as never, {} as never, {} as never, kaspi, async () => true, uow, clock, logger, ports);
  const cloud = new CloudPaymentsWebhook({} as never, {} as never, () => "secret", ports);

  const issue = async (dealId: string, amount: number) => {
    const { invoice } = await invoices.issue({ dealId, conversationId: null, phone: "77011234567", clientName: "Тест", locale: "ru", channel: "whatsapp", plan: "hardcover", agreedTotal: 30000, amount, purpose: "custom", actor: { userId: ids.staff, label: "test" }, maxDiscountPercent: null });
    ids.invoices.push(invoice.id);
    return invoice;
  };
  const dealPayments = (dealId: string) => q<{ method: string; external_ref: string | null; amount: number }>(sql`select method, external_ref, amount from crm_payments where deal_id = ${dealId} order by created_at`);
  const status = async (invoiceId: string) => (await q<{ status: string; paid_ref: string | null }>(sql`select status, paid_ref from deal_invoices where id = ${invoiceId}`))[0];
  const paidEvents = (invoiceId: string) => published.filter((e) => e.type === "ordering.deal_invoice_paid" && (e.payload as { invoiceId: string }).invoiceId === invoiceId).length;

  beforeAll(async () => {
    const [open] = await q<{ id: string }>(sql`select id from crm_stages where kind = 'open' order by position limit 1`);
    // Кто выставил счёт — любой существующий аккаунт (внешний ключ issued_by_id).
    const [user] = await q<{ id: string }>(sql`select id from users order by created_at limit 1`);
    ids.staff = user.id;
    for (const key of ["kaspi", "cloud", "mixed"]) {
      const [d] = await q<{ id: string }>(sql`insert into crm_deals (title, stage_id, amount, contact_name) values (${`${tag}-${key}`}, ${open.id}, 30000, 'Тест') returning id`);
      ids.deals.push(d.id);
    }
  });

  afterAll(async () => {
    for (const id of ids.invoices) await q(sql`delete from payment_invoices where target_kind = 'deal_invoice' and target_id = ${id}`);
    for (const id of ids.deals) {
      await q(sql`delete from crm_payments where deal_id = ${id}`);
      await q(sql`delete from deal_invoices where deal_id = ${id}`);
      await q(sql`delete from crm_deals where id = ${id}`);
    }
    await pool.end();
  });

  it("Kaspi: вебхук, повтор вебхука, страница клиента и долгая сверка одновременно — один платёж, счёт оплачен один раз", async () => {
    const dealId = ids.deals[0];
    const invoice = await issue(dealId, 15000);
    const attempt = await svc.payDealInvoice(invoice.token, { method: "invoice" });
    kaspi.statuses.set(attempt.externalId, { status: "Processed", amount: 15000 });
    const hook = { event: "payment.success", externalId: attempt.externalId, method: "invoice", status: "Processed", amount: 15000 } as const;
    await Promise.all([svc.onWebhook(hook, true), svc.onWebhook(hook, true), svc.status(attempt.id, { dealInvoiceToken: invoice.token }), svc.reconcileDealInvoices(8 * 86_400_000), svc.onWebhook(hook, false)]);
    expect(await dealPayments(dealId)).toEqual([{ method: "kaspi", external_ref: attempt.externalId, amount: 15000 }]);
    expect(await status(invoice.id)).toEqual({ status: "paid", paid_ref: attempt.externalId });
    expect(paidEvents(invoice.id)).toBe(1);
    expect((await q<{ status: string }>(sql`select status from payment_invoices where id = ${attempt.id}`))[0].status).toBe("paid");
  });

  it("CloudPayments: pay дважды одновременно — один платёж с операцией, счёт оплачен один раз", async () => {
    const dealId = ids.deals[1];
    const invoice = await issue(dealId, 12000);
    const body = { InvoiceId: invoice.label, Amount: "12000", Currency: "KZT", TransactionId: `${tag}-cp` };
    expect(await Promise.all([cloud.handle("pay", body), cloud.handle("pay", body), cloud.handle("pay", body)])).toEqual([0, 0, 0]);
    expect(await dealPayments(dealId)).toEqual([{ method: "cloudpayments", external_ref: `${tag}-cp`, amount: 12000 }]);
    expect(await status(invoice.id)).toEqual({ status: "paid", paid_ref: `${tag}-cp` });
    expect(paidEvents(invoice.id)).toBe(1);
  });

  it("Kaspi и карта по одному счёту одновременно — оба платежа записаны, счёт оплачен один раз, второй — «нужен возврат»", async () => {
    const dealId = ids.deals[2];
    const invoice = await issue(dealId, 10000);
    const attempt = await svc.payDealInvoice(invoice.token, { method: "invoice" });
    const hook = { event: "payment.success", externalId: attempt.externalId, method: "invoice", status: "Processed", amount: 10000 } as const;
    const body = { InvoiceId: invoice.label, Amount: "10000", Currency: "KZT", TransactionId: `${tag}-mix` };
    await Promise.all([svc.onWebhook(hook, true), cloud.handle("pay", body), svc.onWebhook(hook, true), cloud.handle("pay", body)]);
    const rows = await dealPayments(dealId);
    expect(rows.map((r) => r.method).sort()).toEqual(["cloudpayments", "kaspi"]);
    expect((await status(invoice.id)).status).toBe("paid");
    expect(paidEvents(invoice.id)).toBe(1);
    expect(published.filter((e) => e.type === "ordering.deal_invoice_extra_money" && (e.payload as { invoiceId: string }).invoiceId === invoice.id)).toHaveLength(1);
  });

  it("индекс crm_payments_external_idx: одна операция, записанная параллельно мимо счёта, — одна строка", async () => {
    const dealId = ids.deals[1];
    const input = { dealId, clientId: null, amount: 500, paidAt: new Date(), method: "kaspi" as const, externalRef: `${tag}-raw`, invoiceId: ids.invoices[1], note: "тест" };
    const results = await Promise.all([payments.addOnline(input), payments.addOnline(input), payments.addOnline(input)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await dealPayments(dealId)).filter((r) => r.external_ref === `${tag}-raw`)).toHaveLength(1);
  });
});
