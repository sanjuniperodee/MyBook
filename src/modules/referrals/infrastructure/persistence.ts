import "server-only";
import { desc, eq } from "drizzle-orm";
import { referralRewards, users } from "@/shared/infrastructure/db/schema";
import { executor } from "@/shared/infrastructure/database";
import type { ReferralPeople, RewardLedger } from "../application";

export class DrizzleRewardLedger implements RewardLedger {
  /** Заказ и сделка уникальны: повтор события или второй счёт по той же сделке — без второй награды. */
  async claim(r: Parameters<RewardLedger["claim"]>[0]) {
    const rows = await executor()
      .insert(referralRewards)
      .values({ orderId: r.orderId, dealId: r.dealId, orderNumber: r.orderNumber, referrerId: r.referrerId, friendId: r.friendId, createdAt: r.createdAt })
      .onConflictDoNothing()
      .returning({ id: referralRewards.id });
    return rows[0]?.id ?? null;
  }

  async setCode(rewardId: string, code: string) {
    await executor().update(referralRewards).set({ code }).where(eq(referralRewards.id, rewardId));
  }

  async forReferrer(userId: string) {
    return executor().select().from(referralRewards).where(eq(referralRewards.referrerId, userId)).orderBy(desc(referralRewards.createdAt)).limit(200);
  }
}

/** Клиенты глазами приглашений — антикоррупционный слой над таблицей Identity. */
export const drizzleReferralPeople: ReferralPeople = {
  async get(userId) {
    const [u] = await executor()
      .select({ name: users.name, email: users.email, locale: users.locale, optOut: users.emailOptOut })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return u ?? null;
  },
};
