import "server-only";
import { and, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "./db";
import { promoCodes, type PromoCode } from "./db/schema";
import { normalizePromoCode } from "./pricing";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type PromoCheck = { ok: true; promo: PromoCode } | { ok: false; error: string };

export async function findValidPromo(rawCode: string): Promise<PromoCheck> {
  const code = normalizePromoCode(rawCode);
  if (!code) return { ok: false, error: "Введите промокод" };
  const promo = await db.query.promoCodes.findFirst({ where: eq(promoCodes.code, code) });
  if (!promo || !promo.active) return { ok: false, error: "Такого промокода нет" };
  if (promo.expiresAt && promo.expiresAt < new Date()) return { ok: false, error: "Срок действия промокода истёк" };
  if (promo.maxUses !== null && promo.usedCount >= promo.maxUses) return { ok: false, error: "Промокод уже использован" };
  return { ok: true, promo };
}

/** Атомарно занимает одно использование промокода. Возвращает null, если код стал недействителен. */
export async function reservePromo(tx: Tx, promoId: string): Promise<PromoCode | null> {
  const [row] = await tx
    .update(promoCodes)
    .set({ usedCount: sql`${promoCodes.usedCount} + 1` })
    .where(
      and(
        eq(promoCodes.id, promoId),
        eq(promoCodes.active, true),
        or(isNull(promoCodes.maxUses), lt(promoCodes.usedCount, promoCodes.maxUses)),
        or(isNull(promoCodes.expiresAt), gt(promoCodes.expiresAt, new Date())),
      ),
    )
    .returning();
  return row ?? null;
}

/** Возвращает использование промокода (при отмене неоплаченного заказа). */
export async function releasePromo(code: string) {
  await db
    .update(promoCodes)
    .set({ usedCount: sql`greatest(${promoCodes.usedCount} - 1, 0)` })
    .where(eq(promoCodes.code, code));
}

export function describePromo(p: Pick<PromoCode, "kind" | "value">, formatMoney: (n: number) => string) {
  return p.kind === "percent" ? `−${p.value}%` : `−${formatMoney(p.value)}`;
}
