import { afterAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, pool } from "@/shared/infrastructure/db";
import { GiftCard } from "@/modules/ordering/domain";
import { DrizzleGiftCardRepository } from "@/modules/ordering/infrastructure/persistence/DrizzleGiftCardRepository";

/**
 * Чек ручного подтверждения сертификата (analytics-d8) на PostgreSQL: сохраняется в gift_cards и читается обратно.
 * Запуск: INTEGRATION=1 npx vitest run tests/gift-receipt.integration.test.ts (база из DATABASE_URL с миграциями).
 */
const run = process.env.INTEGRATION === "1" ? describe : describe.skip;
const tag = `gfr${Date.now()}`;

run("ordering: чек сертификата (PostgreSQL)", () => {
  afterAll(async () => {
    await db.execute(sql`delete from gift_cards where buyer_email = ${`${tag}@test.kz`}`);
    await db.execute(sql`delete from promo_codes where note = ${tag}`);
    await pool.end();
  });

  it("без чека — null, после «Оплачен» — ключ, имя, тип и размер", async () => {
    const repo = new DrizzleGiftCardRepository();
    const { id, number } = await repo.nextIdentity();
    const now = new Date();
    const gift = GiftCard.purchase(id, { number, token: `${tag}${"t".repeat(20)}`, plan: "hardcover", amount: 20_000, currency: "KZT", paymentProvider: "manual", buyerUserId: null, buyerName: tag, buyerEmail: `${tag}@test.kz`, buyerPhone: "", recipientName: "Б", recipientEmail: null, message: "", locale: "ru", buyerLocale: "ru", sendAt: null, today: "2026-10-01" }, now);
    await repo.add(gift);
    expect((await repo.findById(id))!.snapshot().receipt).toBeNull();
    const receipt = { storageKey: `gifts/${id}/receipt-x.png`, fileName: "перевод.png", mime: "image/png", size: 11 };
    const [{ id: promoId }] = (await db.execute<{ id: string }>(sql`insert into promo_codes (code, kind, value, note) values (${tag.toUpperCase()}, 'fixed', 20000, ${tag}) returning id`)).rows;
    gift.markPaid(promoId, null, "admin:test", now, receipt);
    await repo.save(gift);
    expect((await repo.findById(id))!.snapshot()).toMatchObject({ status: "paid", receipt });
  });
});
