import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import { promoCodes } from "@/shared/infrastructure/db/schema";
import { executor } from "@/shared/infrastructure/database";
import { PromoCode, normalizePromoCode, type PromoCodeRepository } from "../../domain";

type Row = typeof promoCodes.$inferSelect;

const toDomain = (r: Row) =>
  PromoCode.restore(r.id, { code: r.code, kind: r.kind, value: r.value, maxUses: r.maxUses, usedCount: r.usedCount, expiresAt: r.expiresAt, active: r.active, note: r.note, createdAt: r.createdAt });

export class DrizzlePromoCodeRepository implements PromoCodeRepository {
  nextId() {
    return randomUUID();
  }

  async findByCode(code: string) {
    const c = normalizePromoCode(code);
    if (!c) return null;
    const [row] = await executor().select().from(promoCodes).where(eq(promoCodes.code, c)).limit(1);
    return row ? toDomain(row) : null;
  }

  async findById(id: string) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const [row] = await executor().select().from(promoCodes).where(eq(promoCodes.id, id)).limit(1);
    return row ? toDomain(row) : null;
  }

  async tryReserve(id: string, now: Date) {
    const rows = await executor()
      .update(promoCodes)
      .set({ usedCount: sql`${promoCodes.usedCount} + 1` })
      .where(
        and(
          eq(promoCodes.id, id),
          eq(promoCodes.active, true),
          or(isNull(promoCodes.maxUses), lt(promoCodes.usedCount, promoCodes.maxUses)),
          or(isNull(promoCodes.expiresAt), gt(promoCodes.expiresAt, now)),
        ),
      )
      .returning({ id: promoCodes.id });
    return rows.length > 0;
  }

  async release(code: string) {
    await executor()
      .update(promoCodes)
      .set({ usedCount: sql`greatest(${promoCodes.usedCount} - 1, 0)` })
      .where(eq(promoCodes.code, code));
  }

  async add(promo: PromoCode) {
    const s = promo.snapshot();
    const rows = await executor()
      .insert(promoCodes)
      .values({ id: promo.id, code: s.code, kind: s.kind, value: s.value, maxUses: s.maxUses, usedCount: s.usedCount, expiresAt: s.expiresAt, active: s.active, note: s.note, createdAt: s.createdAt })
      .onConflictDoNothing()
      .returning({ id: promoCodes.id });
    return rows.length > 0;
  }

  async save(promo: PromoCode) {
    const s = promo.snapshot();
    await executor().update(promoCodes).set({ active: s.active, note: s.note, maxUses: s.maxUses, expiresAt: s.expiresAt }).where(eq(promoCodes.id, promo.id));
  }
}
