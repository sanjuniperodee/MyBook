import "server-only";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/shared/infrastructure/db";
import { executor } from "@/shared/infrastructure/database";
import { designAiCredits, designAiPurchases, designAiRequests } from "@/shared/infrastructure/db/schema";
import type { DesignTarget } from "@/lib/book/design-ai";

/**
 * Учёт просьб к ИИ-дизайнеру: бесплатные на клиента за всё время и купленные запросы сверх них. Резерв берётся под
 * блокировкой клиента — две вкладки не потратят один последний запрос дважды; если модель не ответила, резерв
 * возвращается (бесплатный — не считается, купленный — возвращается на баланс).
 *
 * Лимит бесплатных — настройка рабочего пространства: его передаёт вызывающий (src/server/designAiStore.ts), модуль
 * не импортирует соседний workspace.
 */

export interface DesignAiAllowance {
  limit: number;
  /** Бесплатных осталось. */
  remaining: number;
  /** Купленных запросов на балансе. */
  credits: number;
}

export type DesignAiPurchase = typeof designAiPurchases.$inferSelect;

/** Пакет запросов по каталогу на момент покупки. */
export interface DesignAiPack {
  id: string;
  price: number;
  requests: number;
}

const LOCK = 7_301_224;

async function usedFree(tx: Pick<typeof db, "select">, userId: string) {
  const [r] = await tx
    .select({ n: count() })
    .from(designAiRequests)
    .where(and(eq(designAiRequests.userId, userId), eq(designAiRequests.source, "free"), inArray(designAiRequests.status, ["pending", "ok"])));
  return r?.n ?? 0;
}

async function creditsOf(tx: Pick<typeof db, "select">, userId: string) {
  const [r] = await tx.select({ balance: designAiCredits.balance }).from(designAiCredits).where(eq(designAiCredits.userId, userId));
  return r?.balance ?? 0;
}

export class DrizzleDesignAiStore {
  async allowance(userId: string, limit: number): Promise<DesignAiAllowance> {
    const [used, credits] = await Promise.all([usedFree(db, userId), creditsOf(db, userId)]);
    return { limit, remaining: Math.max(0, limit - used), credits };
  }

  /** Взять запрос: бесплатный, если остались, иначе купленный. Нет ни того ни другого — null. */
  async reserve(input: { userId: string; bookId: string; target: DesignTarget; prompt: string; mode?: string }, limit: number, now = new Date()): Promise<{ id: string; source: "free" | "credit" } | null> {
    return db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${LOCK}, hashtext(${input.userId}))`);
      let source: "free" | "credit" | null = null;
      if ((await usedFree(tx, input.userId)) < limit) source = "free";
      else {
        const taken = await tx
          .update(designAiCredits)
          .set({ balance: sql`${designAiCredits.balance} - 1`, updatedAt: now })
          .where(and(eq(designAiCredits.userId, input.userId), sql`${designAiCredits.balance} > 0`))
          .returning({ balance: designAiCredits.balance });
        if (taken.length) source = "credit";
      }
      if (!source) return null;
      const [row] = await tx.insert(designAiRequests).values({ userId: input.userId, bookId: input.bookId, target: input.target, prompt: input.prompt, source, mode: input.mode ?? null }).returning({ id: designAiRequests.id });
      return { id: row.id, source };
    });
  }

  /** Модель ответила: запрос в журнал (и в лимит). */
  async complete(id: string, result: { reply: string; ops: unknown[]; errors: string[]; usage: Record<string, number>; model?: string; costUsd?: number | null; ms?: number; polish?: "ok" | "fixed" | null }) {
    await db
      .update(designAiRequests)
      .set({ status: "ok", reply: result.reply.slice(0, 2000), ops: result.ops, errors: result.errors, usage: result.usage, model: result.model ?? null, costUsd: result.costUsd ?? null, ms: result.ms ?? null, polish: result.polish ?? null })
      .where(eq(designAiRequests.id, id));
  }

  /** Модель не ответила: попытка не считается, купленный запрос возвращается на баланс. */
  async fail(id: string, error: string) {
    await db.transaction(async (tx) => {
      const [row] = await tx.update(designAiRequests).set({ status: "failed", errors: [error.slice(0, 500)] }).where(and(eq(designAiRequests.id, id), eq(designAiRequests.status, "pending"))).returning({ userId: designAiRequests.userId, source: designAiRequests.source });
      if (row?.source === "credit") await tx.update(designAiCredits).set({ balance: sql`${designAiCredits.balance} + 1`, updatedAt: new Date() }).where(eq(designAiCredits.userId, row.userId));
    });
  }

  /** Начислить купленные запросы (оплата пакета, ручное начисление в админке). */
  async addCredits(userId: string, n: number, tx: Pick<typeof db, "insert"> = db) {
    await tx
      .insert(designAiCredits)
      .values({ userId, balance: n })
      .onConflictDoUpdate({ target: designAiCredits.userId, set: { balance: sql`${designAiCredits.balance} + ${n}`, updatedAt: new Date() } });
  }

  /** Покупка пакета: сумма и число запросов фиксируются по каталогу сейчас; оплатить — Kaspi (цель ai_pack). */
  async createPurchase(userId: string, pack: DesignAiPack): Promise<DesignAiPurchase> {
    // Незаоплаченная покупка того же пакета по той же цене — та же (повторный клик, возврат на страницу).
    const [open] = await db
      .select()
      .from(designAiPurchases)
      .where(and(eq(designAiPurchases.userId, userId), eq(designAiPurchases.packId, pack.id), eq(designAiPurchases.status, "pending_payment"), eq(designAiPurchases.amount, pack.price), eq(designAiPurchases.requests, pack.requests)))
      .orderBy(desc(designAiPurchases.createdAt))
      .limit(1);
    if (open) return open;
    const [row] = await db.insert(designAiPurchases).values({ userId, packId: pack.id, requests: pack.requests, amount: pack.price }).returning();
    return row;
  }

  async findPurchase(id: string): Promise<DesignAiPurchase | null> {
    const [row] = await executor().select().from(designAiPurchases).where(eq(designAiPurchases.id, id));
    return row ?? null;
  }

  /**
   * Оплата пакета пришла: отметка «оплачено» и начисление запросов — одной записью в текущей транзакции (Unit of Work
   * платежа, если он открыт). Повтор ничего не делает: false — покупка уже оплачена или отменена.
   */
  async confirmPurchase(id: string, paymentId: string): Promise<boolean> {
    const run = async (tx: ReturnType<typeof executor>) => {
      const [row] = await tx
        .update(designAiPurchases)
        .set({ status: "paid", paymentId, paidAt: new Date() })
        .where(and(eq(designAiPurchases.id, id), eq(designAiPurchases.status, "pending_payment")))
        .returning({ userId: designAiPurchases.userId, requests: designAiPurchases.requests });
      if (!row) return false;
      await this.addCredits(row.userId, row.requests, tx);
      return true;
    };
    const tx = executor();
    return tx === db ? db.transaction((t) => run(t)) : run(tx);
  }
}
