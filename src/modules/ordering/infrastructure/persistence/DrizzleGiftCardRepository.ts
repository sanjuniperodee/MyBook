import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { giftCards } from "@/lib/db/schema";
import { executor } from "@/shared/infrastructure/database";
import type { PlanId } from "@/config/site";
import { GiftCard, type GiftCardRepository } from "../../domain";

type Row = typeof giftCards.$inferSelect;

const toDomain = (r: Row) =>
  GiftCard.restore(r.id, {
    number: r.number,
    token: r.token,
    plan: r.plan as PlanId,
    amount: r.amount,
    currency: r.currency,
    status: r.status,
    paymentProvider: r.paymentProvider,
    paymentId: r.paymentId,
    paymentClaimedAt: r.paymentClaimedAt,
    paidAt: r.paidAt,
    buyerUserId: r.buyerUserId,
    buyerName: r.buyerName,
    buyerEmail: r.buyerEmail,
    buyerPhone: r.buyerPhone,
    recipientName: r.recipientName,
    recipientEmail: r.recipientEmail,
    message: r.message,
    locale: r.locale,
    buyerLocale: r.buyerLocale,
    sendAt: r.sendAt,
    sentAt: r.sentAt,
    promoCodeId: r.promoCodeId,
    createdAt: r.createdAt,
  });

function toRow(g: GiftCard) {
  const { id: _id, number: _n, createdAt: _c, ...rest } = g.snapshot();
  void _id;
  void _n;
  void _c;
  return rest;
}

export class DrizzleGiftCardRepository implements GiftCardRepository {
  async nextIdentity() {
    const res = await executor().execute<{ n: number }>(sql`select nextval(pg_get_serial_sequence('gift_cards', 'number'))::int as n`);
    return { id: randomUUID(), number: res.rows[0].n };
  }

  private async one(where: ReturnType<typeof eq>, lock = false) {
    const q = executor().select().from(giftCards).where(where).limit(1);
    const [row] = lock ? await q.for("update") : await q;
    return row ? toDomain(row) : null;
  }

  findById(id: string) {
    return /^[0-9a-f-]{36}$/i.test(id) ? this.one(eq(giftCards.id, id)) : Promise.resolve(null);
  }
  findByNumber(number: number) {
    return Number.isInteger(number) ? this.one(eq(giftCards.number, number)) : Promise.resolve(null);
  }
  findByToken(token: string) {
    return /^[A-Za-z0-9_-]{20,40}$/.test(token) ? this.one(eq(giftCards.token, token)) : Promise.resolve(null);
  }
  findByPromoId(promoId: string) {
    return this.one(eq(giftCards.promoCodeId, promoId));
  }
  lockById(id: string) {
    return this.one(eq(giftCards.id, id), true);
  }

  async findDueForDelivery(today: string, limit: number) {
    const rows = await executor()
      .select()
      .from(giftCards)
      .where(and(eq(giftCards.status, "paid"), isNotNull(giftCards.recipientEmail), isNull(giftCards.sentAt), or(isNull(giftCards.sendAt), lte(giftCards.sendAt, today))))
      .limit(limit);
    return rows.map(toDomain);
  }

  async add(gift: GiftCard) {
    const s = gift.snapshot();
    await executor().insert(giftCards).values({ id: gift.id, number: s.number, createdAt: s.createdAt, ...toRow(gift) });
  }

  async save(gift: GiftCard) {
    await executor().update(giftCards).set({ ...toRow(gift), updatedAt: new Date() }).where(eq(giftCards.id, gift.id));
  }
}
