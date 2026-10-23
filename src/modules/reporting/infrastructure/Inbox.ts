import "server-only";
import { phoneMatch } from "./phoneSearch";
import { and, eq, getTableColumns, gt, ilike, isNotNull, or, sql, type SQL } from "drizzle-orm";
import { crmConversations, crmDeals, crmPinnedChats, crmStages, users } from "@/shared/infrastructure/db/schema";
import { executor } from "@/shared/infrastructure/database";
import { visibleTo, type Viewer } from "./MyDay";

type InboxFilter = "open" | "mine" | "unread" | "waiting" | "closed";

/** Список диалогов единого инбокса по фильтру и поиску (видимость «только свои»). Закреплённые сотрудником — сверху. */
export async function inbox(viewer: Viewer, f: InboxFilter, q: string | undefined) {
  const w: SQL[] = [];
  const scope = visibleTo(viewer, crmConversations.assigneeId);
  if (scope) w.push(scope);
  if (f === "closed") w.push(eq(crmConversations.status, "closed"));
  else w.push(eq(crmConversations.status, "open"));
  if (f === "mine") w.push(eq(crmConversations.assigneeId, viewer.userId));
  if (f === "unread") w.push(gt(crmConversations.unread, 0));
  if (f === "waiting") w.push(isNotNull(crmConversations.awaitingSince));
  if (q) w.push(or(ilike(crmConversations.contactName, `%${q}%`), phoneMatch(crmConversations.chatId, q), ilike(crmConversations.chatId, `%${q}%`), ilike(crmConversations.lastMessageText, `%${q}%`))!);
  return executor()
    .select({ ...getTableColumns(crmConversations), pinnedAt: crmPinnedChats.pinnedAt })
    .from(crmConversations)
    .leftJoin(crmPinnedChats, and(eq(crmPinnedChats.conversationId, crmConversations.id), eq(crmPinnedChats.userId, viewer.userId)))
    .where(and(...w))
    .orderBy(sql`${crmPinnedChats.pinnedAt} desc nulls last`, sql`${crmConversations.lastMessageAt} desc nulls last`)
    .limit(150);
}

/** Сделка и клиент рядом с диалогом. */
export async function conversationContext(conv: { dealId: string | null; clientId: string | null }) {
  const db = executor();
  const [dealRow, client] = await Promise.all([
    conv.dealId
      ? db
          .select({ deal: crmDeals, stage: crmStages })
          .from(crmDeals)
          .innerJoin(crmStages, eq(crmStages.id, crmDeals.stageId))
          .where(eq(crmDeals.id, conv.dealId))
          .then((r) => r[0] ?? null)
      : null,
    conv.clientId ? db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.id, conv.clientId)).then((r) => r[0] ?? null) : null,
  ]);
  return { dealRow, client };
}
