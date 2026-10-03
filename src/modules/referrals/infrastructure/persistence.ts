import "server-only";
import { desc, eq } from "drizzle-orm";
import { referralRewards, users } from "@/shared/infrastructure/db/schema";
import { executor } from "@/shared/infrastructure/database";
import type { ReferralPeople, RewardLedger } from "../application";

export class DrizzleRewardLedger implements RewardLedger {
  async claim(r: Parameters<RewardLedger["claim"]>[0]) {
    const rows = await executor()
      .insert(referralRewards)
      .values({ orderId: r.orderId, orderNumber: r.orderNumber, referrerId: r.referrerId, friendId: r.friendId, createdAt: r.createdAt })
      .onConflictDoNothing()
      .returning({ orderId: referralRewards.orderId });
    return rows.length > 0;
  }

  async setCode(orderId: string, code: string) {
    await executor().update(referralRewards).set({ code }).where(eq(referralRewards.orderId, orderId));
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
