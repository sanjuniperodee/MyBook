import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "@/shared/infrastructure/db";
import { txStorage } from "@/shared/infrastructure/database";
import { PaymentInvoice } from "@/modules/ordering/domain";
import { DrizzlePaymentInvoiceRepository } from "@/modules/ordering/infrastructure/persistence/DrizzlePaymentInvoiceRepository";

/**
 * Хранение счетов Kaspi на настоящем PostgreSQL. Запуск: INTEGRATION=1 npx vitest run tests/kaspi.integration.test.ts
 * (нужна база из DATABASE_URL с применёнными миграциями).
 */
const run = process.env.INTEGRATION === "1" ? describe : describe.skip;

run("счета Kaspi (PostgreSQL)", () => {
  const repo = new DrizzlePaymentInvoiceRepository();
  const orderId = randomUUID();
  const ext = `it-${Date.now()}`;

  afterAll(async () => {
    await db.execute(sql`delete from payment_invoices where target_id = ${orderId}`);
    await pool.end();
  });

  it("сохраняет, находит по номеру Kaspi и по заказу, отдаёт на сверку", async () => {
    const created = new Date(Date.now() - 60_000);
    const first = PaymentInvoice.issue(repo.nextId(), { provider: "kaspi", target: { kind: "order", id: orderId }, method: "qr", externalId: `${ext}-1`, phone: null, amount: 15000, checkoutUrl: "https://pay.kaspi.kz/pay/x", qrToken: "https://pay.kaspi.kz/pay/x", expiresAt: new Date(Date.now() + 300_000) }, created);
    await repo.add(first);
    const second = PaymentInvoice.issue(repo.nextId(), { provider: "kaspi", target: { kind: "order", id: orderId }, method: "invoice", externalId: `${ext}-2`, phone: "77010000000", amount: 15000, checkoutUrl: null, qrToken: null, expiresAt: null }, new Date());
    await repo.add(second);

    expect((await repo.findByExternalId("kaspi", `${ext}-1`))!.id).toBe(first.id);
    expect((await repo.latestFor({ kind: "order", id: orderId }))!.id).toBe(second.id);
    const due = await repo.toReconcile(new Date(Date.now() - 3600_000), 500);
    expect(due.map((i) => i.id)).toEqual(expect.arrayContaining([first.id, second.id]));

    // Блокировка строки в транзакции и сохранение статуса.
    await db.transaction((tx) =>
      txStorage.run({ tx, events: [], aggregates: new Set() }, async () => {
        const locked = (await repo.lockById(second.id))!;
        expect(locked.apply("paid", "Processed", new Date())).toBe(true);
        await repo.save(locked);
      }),
    );
    const paid = (await repo.findById(second.id))!.snapshot();
    expect(paid).toMatchObject({ status: "paid", providerStatus: "Processed", phone: "77010000000", target: { kind: "order", id: orderId } });
    expect(paid.paidAt).toBeInstanceOf(Date);
    expect((await repo.toReconcile(new Date(Date.now() - 3600_000), 500)).map((i) => i.id)).not.toContain(second.id);
  });

  it("номер операции Kaspi уникален", async () => {
    const dup = PaymentInvoice.issue(repo.nextId(), { provider: "kaspi", target: { kind: "order", id: orderId }, method: "qr", externalId: `${ext}-1`, phone: null, amount: 1, checkoutUrl: null, qrToken: null, expiresAt: null }, new Date());
    await expect(repo.add(dup)).rejects.toThrow();
  });
});
