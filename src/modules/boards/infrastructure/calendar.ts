import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import { crmCalendarFeeds, users } from "@/shared/infrastructure/db/schema";
import { executor } from "@/shared/infrastructure/database";
import type { CalendarFeeds } from "../application/CalendarService";

export const drizzleFeeds: CalendarFeeds = {
  async active(userId) {
    const [f] = await executor()
      .select({ id: crmCalendarFeeds.id, createdAt: crmCalendarFeeds.createdAt, lastUsedAt: crmCalendarFeeds.lastUsedAt })
      .from(crmCalendarFeeds)
      .where(and(eq(crmCalendarFeeds.userId, userId), isNull(crmCalendarFeeds.revokedAt)))
      .orderBy(desc(crmCalendarFeeds.createdAt))
      .limit(1);
    return f ?? null;
  },
  create: async (userId, tokenHash) => void (await executor().insert(crmCalendarFeeds).values({ userId, tokenHash })),
  revokeAll: async (userId, at) => void (await executor().update(crmCalendarFeeds).set({ revokedAt: at }).where(and(eq(crmCalendarFeeds.userId, userId), isNull(crmCalendarFeeds.revokedAt)))),
  async use(tokenHash, at) {
    const [f] = await executor()
      .update(crmCalendarFeeds)
      .set({ lastUsedAt: at })
      .where(and(eq(crmCalendarFeeds.tokenHash, tokenHash), isNull(crmCalendarFeeds.revokedAt)))
      .returning({ userId: crmCalendarFeeds.userId });
    if (!f) return null;
    const [u] = await executor().select({ id: users.id }).from(users).where(and(eq(users.id, f.userId), eq(users.role, "admin"), eq(users.staffDisabled, false))).limit(1);
    return u ? { userId: u.id } : null;
  },
};

/** Учётная запись сотрудника для прав (ленте iCal права — как сейчас в CRM). */
export async function staffAccount(userId: string) {
  const [u] = await executor().select({ id: users.id, name: users.name, role: users.role, staffDisabled: users.staffDisabled, crmRoleId: users.crmRoleId }).from(users).where(eq(users.id, userId)).limit(1);
  return u ?? null;
}
