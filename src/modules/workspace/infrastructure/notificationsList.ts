import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/shared/infrastructure/db";
import { crmNotifications } from "@/shared/infrastructure/db/schema";

/** Лента уведомлений сотрудника (колокольчик и экран «Уведомления» в приложении): последние, свежие сверху. */
export async function staffNotifications(userId: string, limit = 60) {
  const rows = await db.select().from(crmNotifications).where(eq(crmNotifications.userId, userId)).orderBy(desc(crmNotifications.createdAt)).limit(Math.min(Math.max(limit, 1), 200));
  return rows.map((n) => ({ id: n.id, kind: n.kind, title: n.title, body: n.body, link: n.link, read: !!n.readAt, at: n.createdAt.toISOString() }));
}
