import "server-only";
import { and, eq, gt } from "drizzle-orm";
import { sessions, users } from "@/lib/db/schema";
import { rootDb } from "@/shared/infrastructure/database";

/** Read-модель текущего пользователя: строка профиля целиком (её читают и экраны CRM). */
export type CurrentUser = typeof users.$inferSelect;

export class DrizzleIdentityQueries {
  async userBySession(tokenHash: string, now: Date): Promise<CurrentUser | null> {
    const rows = await rootDb
      .select({ user: users })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(and(eq(sessions.id, tokenHash), gt(sessions.expiresAt, now)))
      .limit(1);
    return rows[0]?.user ?? null;
  }

  /** Отметка активности для CRM — вызывающий решает, как часто. */
  async touch(userId: string, at: Date) {
    await rootDb.update(users).set({ lastSeenAt: at }).where(eq(users.id, userId));
  }
}
