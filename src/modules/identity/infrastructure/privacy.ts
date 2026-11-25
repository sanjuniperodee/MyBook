import "server-only";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { users } from "@/shared/infrastructure/db/schema";
import { executor } from "@/shared/infrastructure/database";

/** Удалённые аккаунты, которые ещё дочищаются (ждут доставки заказа в работе), и отметка «дочищено». */
export const identityPrivacy = {
  async pendingPurge(limit = 50): Promise<string[]> {
    const rows = await executor()
      .select({ id: users.id })
      .from(users)
      .where(and(isNotNull(users.deletedAt), isNull(users.purgedAt)))
      .limit(limit);
    return rows.map((r) => r.id);
  },

  async markPurged(userId: string) {
    await executor().update(users).set({ purgedAt: new Date() }).where(eq(users.id, userId));
  },
};
