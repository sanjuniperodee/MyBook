import "server-only";
import { and, eq } from "drizzle-orm";
import { executor } from "@/shared/infrastructure/database";
import { crmPinnedChats } from "@/shared/infrastructure/db/schema";

/** Закреплённые чаты сотрудника: у каждого свои, другим не видны. */
export const pinnedChats = {
  async isPinned(userId: string, conversationId: string) {
    const r = await executor().select({ at: crmPinnedChats.pinnedAt }).from(crmPinnedChats).where(and(eq(crmPinnedChats.userId, userId), eq(crmPinnedChats.conversationId, conversationId))).limit(1);
    return r.length > 0;
  },

  /** Закрепить или открепить; возвращает новое состояние. */
  async set(userId: string, conversationId: string, pinned: boolean) {
    if (pinned) await executor().insert(crmPinnedChats).values({ userId, conversationId }).onConflictDoNothing();
    else await executor().delete(crmPinnedChats).where(and(eq(crmPinnedChats.userId, userId), eq(crmPinnedChats.conversationId, conversationId)));
  },
};
