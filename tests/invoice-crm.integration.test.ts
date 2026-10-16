import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, pool } from "@/shared/infrastructure/db";
import { paymentsExport } from "@/modules/reporting/infrastructure/PaymentsExport";
import { clientBrief } from "@/modules/reporting/infrastructure/DealCard";
import { DrizzleDealInvoiceRepository } from "@/modules/ordering/infrastructure/persistence/DrizzleDealInvoiceRepository";
import { invoiceViews } from "@/app/admin/invoices/view";

/**
 * Счета из чата в CRM на настоящем PostgreSQL (зона C): выгрузка платежей помечает онлайн-платёж «онлайн» вместо чека,
 * язык аккаунта клиента для формы счёта, счета сделки — в блок «Счета». Данные с уникальной меткой, чистятся свои.
 * Запуск: INTEGRATION=1 npx vitest run tests/invoice-crm.integration.test.ts (база из DATABASE_URL).
 */
const run = process.env.INTEGRATION === "1" ? describe : describe.skip;
const tag = `invc${Date.now()}`;

run("CRM: счета из чата и онлайн-платежи (PostgreSQL)", () => {
  const ids: Record<string, string> = {};
  const q = async <T extends Record<string, unknown>>(query: ReturnType<typeof sql>) => (await db.execute<T>(query)).rows;

  beforeAll(async () => {
    const [open] = await q<{ id: string }>(sql`select id from crm_stages where kind = 'open' order by position limit 1`);
    const [u] = await q<{ id: string }>(sql`insert into users (email, password_hash, name, locale) values (${tag + "@phone.invalid"}, 'x', ${tag}, 'kk') returning id`);
    ids.client = u.id;
    const [d] = await q<{ id: string; number: number }>(sql`insert into crm_deals (title, stage_id, amount, contact_name, client_id) values (${tag}, ${open.id}, 30000, 'К', ${u.id}) returning id, number`);
    ids.deal = d.id;
    const [inv] = await q<{ id: string }>(sql`
      insert into deal_invoices (token, deal_id, plan, agreed_total, amount, purpose, status, paid_method, paid_ref, paid_at, expires_at, access_status)
      values (${tag + "x".repeat(30)}, ${d.id}, 'hardcover', 30000, 15000, 'prepayment', 'paid', 'kaspi', ${tag + "-op"}, now(), now() + interval '7 days', 'needs_manager') returning id`);
    ids.invoice = inv.id;
    const [online] = await q<{ id: string }>(sql`
      insert into crm_payments (deal_id, client_id, amount, kind, method, external_ref, invoice_id) values (${d.id}, ${u.id}, 15000, 'prepayment', 'kaspi', ${tag + "-op"}, ${inv.id}) returning id`);
    ids.online = online.id;
    const [manual] = await q<{ id: string }>(sql`insert into crm_payments (deal_id, client_id, amount, kind) values (${d.id}, ${u.id}, 5000, 'payment') returning id`);
    ids.manual = manual.id;
    await q(sql`insert into crm_receipts (deal_id, payment_id, storage_key, file_name, mime, size, amount) values (${d.id}, ${manual.id}, ${"receipts/" + d.id + "/x.pdf"}, 'чек.pdf', 'application/pdf', 1, 5000)`);
  });

  afterAll(async () => {
    await q(sql`delete from crm_receipts where deal_id = ${ids.deal}`);
    await q(sql`delete from crm_payments where deal_id = ${ids.deal}`);
    await q(sql`delete from deal_invoices where deal_id = ${ids.deal}`);
    await q(sql`delete from crm_deals where id = ${ids.deal}`);
    await q(sql`delete from users where id = ${ids.client}`);
    await pool.end();
  });

  it("выгрузка платежей: онлайн-платёж — «онлайн» в колонке чека, ручной с чеком — «да»", async () => {
    const rows = (await paymentsExport(1)).filter((r) => r.client === tag);
    expect(rows.map((r) => [r.amount, r.receipt]).sort()).toEqual([
      [15000, "онлайн"],
      [5000, "да"],
    ]);
  });

  it("клиент коротко: язык кабинета и роль — для языка формы счёта; мусор вместо id — null без запроса", async () => {
    expect(await clientBrief(ids.client)).toMatchObject({ id: ids.client, locale: "kk", role: "user" });
    expect(await clientBrief("nope")).toBeNull();
  });

  it("счета сделки — в блок «Счета»: оплачен Kaspi с операцией, доступ «нужен менеджер», ссылки у оплаченного нет", async () => {
    const list = await new DrizzleDealInvoiceRepository().listFor(ids.deal);
    const [v] = invoiceViews(list, { now: new Date(), withLink: true });
    expect(v).toMatchObject({ id: ids.invoice, amount: 15000, purpose: "prepayment", status: "paid", paidMethod: "kaspi", paidRef: `${tag}-op`, access: "needs_manager", link: null, hasChat: false });
    expect(v.label).toMatch(/^P\d+$/);
  });
});
