import "server-only";
import { and, eq, gt, ilike, isNotNull, or, sql, type SQL } from "drizzle-orm";
import { crmConversations, crmDeals, crmStages, users } from "@/shared/infrastructure/db/schema";
import { executor } from "@/shared/infrastructure/database";
import { visibleTo, type Viewer } from "./MyDay";

export type InboxFilter = "open" | "mine" | "unread" | "waiting" | "closed";

/** Список диалогов единого инбокса по фильтру и поиску (видимость «только свои»). */
export async function inbox(viewer: Viewer, f: InboxFilter, q: string | undefined) {
  const w: SQL[] = [];
  const scope = visibleTo(viewer, crmConversations.assigneeId);
  if (scope) w.push(scope);
  if (f === "closed") w.push(eq(crmConversations.status, "closed"));
  else w.push(eq(crmConversations.status, "open"));
  if (f === "mine") w.push(eq(crmConversations.assigneeId, viewer.userId));
  if (f === "unread") w.push(gt(crmConversations.unread, 0));
  if (f === "waiting") w.push(isNotNull(crmConversations.awaitingSince));
  if (q) w.push(or(ilike(crmConversations.contactName, `%${q}%`), ilike(crmConversations.chatId, `%${q.replace(/\D/g, "") || q}%`), ilike(crmConversations.lastMessageText, `%${q}%`))!);
  return executor()
    .select()
    .from(crmConversations)
    .where(and(...w))
    .orderBy(sql`${crmConversations.lastMessageAt} desc nulls last`)
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
