import "server-only";
import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
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

const shared = isNull(crmTemplates.ownerId);

/** Общие шаблоны (настройки CRM, видны всем). Личные сотрудников сюда не попадают. */
export const drizzleTemplates: TemplateRepository & { list(): Promise<(typeof crmTemplates.$inferSelect)[]> } = {
  list: () => executor().select().from(crmTemplates).where(shared).orderBy(asc(crmTemplates.position), asc(crmTemplates.createdAt)),
  async add(t) {
    const [{ pos }] = await executor().select({ pos: sql<number>`coalesce(max(${crmTemplates.position}), 0)::int` }).from(crmTemplates).where(shared);
    await executor().insert(crmTemplates).values({ ...t, position: pos + 1 });
  },
  update: async (id, t) => void (await executor().update(crmTemplates).set({ ...t, updatedAt: new Date() }).where(and(eq(crmTemplates.id, id), shared))),
  delete: async (id) => void (await executor().delete(crmTemplates).where(and(eq(crmTemplates.id, id), shared))),
};

/** Личные шаблоны сотрудника: видит и меняет только он сам (чужие и общие не трогаем). */
export const personalTemplates = {
  list: (userId: string) => executor().select().from(crmTemplates).where(eq(crmTemplates.ownerId, userId)).orderBy(asc(crmTemplates.position), asc(crmTemplates.createdAt)),
  async add(userId: string, t: { title: string; text: string }) {
    const [{ pos }] = await executor().select({ pos: sql<number>`coalesce(max(${crmTemplates.position}), 0)::int` }).from(crmTemplates).where(eq(crmTemplates.ownerId, userId));
    const [row] = await executor().insert(crmTemplates).values({ ...t, ownerId: userId, position: pos + 1 }).returning({ id: crmTemplates.id });
    return row.id;
  },
  async update(userId: string, id: string, t: { title: string; text: string }) {
    const r = await executor().update(crmTemplates).set({ ...t, updatedAt: new Date() }).where(and(eq(crmTemplates.id, id), eq(crmTemplates.ownerId, userId))).returning({ id: crmTemplates.id });
    return r.length > 0;
  },
  async remove(userId: string, id: string) {
    const r = await executor().delete(crmTemplates).where(and(eq(crmTemplates.id, id), eq(crmTemplates.ownerId, userId))).returning({ id: crmTemplates.id });
    return r.length > 0;
  },
  /** Новый порядок: id по порядку; чужие id игнорируются. */
  async reorder(userId: string, ids: string[]) {
    await Promise.all(ids.map((id, i) => executor().update(crmTemplates).set({ position: i + 1 }).where(and(eq(crmTemplates.id, id), eq(crmTemplates.ownerId, userId)))));
  },
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
