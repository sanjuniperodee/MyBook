import "server-only";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { crmFields, crmNotifications, crmPushSubscriptions, crmTemplates } from "@/shared/infrastructure/db/schema";
import { executor } from "@/shared/infrastructure/database";
import type { FieldRepository, StaffInbox, TemplateRepository } from "../application";

export const drizzleFields: FieldRepository = {
  keys: async (entity) => (await executor().select({ key: crmFields.key }).from(crmFields).where(eq(crmFields.entity, entity))).map((r) => r.key),
  async add(f) {
    const [{ pos }] = await executor().select({ pos: sql<number>`coalesce(max(${crmFields.position}), 0)::int` }).from(crmFields).where(eq(crmFields.entity, f.entity));
    await executor().insert(crmFields).values({ ...f, position: pos + 1 });
  },
  update: async (id, patch) => void (await executor().update(crmFields).set({ ...patch, updatedAt: new Date() }).where(eq(crmFields.id, id))),
  async delete(id) {
    const [f] = await executor().delete(crmFields).where(eq(crmFields.id, id)).returning({ label: crmFields.label });
    return f ?? null;
  },
};

export const drizzleTemplates: TemplateRepository & { list(): Promise<(typeof crmTemplates.$inferSelect)[]> } = {
  list: () => executor().select().from(crmTemplates).orderBy(asc(crmTemplates.position), asc(crmTemplates.createdAt)),
  async add(t) {
    const [{ pos }] = await executor().select({ pos: sql<number>`coalesce(max(${crmTemplates.position}), 0)::int` }).from(crmTemplates);
    await executor().insert(crmTemplates).values({ ...t, position: pos + 1 });
  },
  update: async (id, t) => void (await executor().update(crmTemplates).set({ ...t, updatedAt: new Date() }).where(eq(crmTemplates.id, id))),
  delete: async (id) => void (await executor().delete(crmTemplates).where(eq(crmTemplates.id, id))),
};

export const drizzleInbox: StaffInbox = {
  async markRead(userId, notificationId) {
    const mine = and(eq(crmNotifications.userId, userId), isNull(crmNotifications.readAt));
    await executor()
      .update(crmNotifications)
      .set({ readAt: new Date() })
      .where(notificationId ? and(mine, eq(crmNotifications.id, notificationId)) : mine);
  },
  async subscribe(userId, s) {
    await executor()
      .insert(crmPushSubscriptions)
      .values({ userId, ...s })
      .onConflictDoUpdate({ target: crmPushSubscriptions.endpoint, set: { userId, p256dh: s.p256dh, auth: s.auth } });
  },
  async unsubscribe(userId, endpoint) {
    await executor().delete(crmPushSubscriptions).where(and(eq(crmPushSubscriptions.userId, userId), eq(crmPushSubscriptions.endpoint, endpoint)));
  },
};
