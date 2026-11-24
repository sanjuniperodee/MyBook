import "server-only";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { pushAllowed, readNotifyPrefs } from "../domain/notifyPrefs";
import { sameThread, threadBody } from "../domain/notifyThread";
import { db } from "@/shared/infrastructure/db";
import { crmNotifications, crmRoles, users } from "@/shared/infrastructure/db/schema";
import type { StaffNotification, StaffNotifier } from "@/shared/application";
import type { Permission } from "@/shared/domain/permissions";

/** Активные сотрудники с правом perm (руководители — всегда). */
export async function staffWith(perm: Permission): Promise<string[]> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .leftJoin(crmRoles, eq(crmRoles.id, users.crmRoleId))
    .where(and(eq(users.role, "admin"), eq(users.staffDisabled, false), sql`(${users.crmRoleId} is null or ${crmRoles.key} = 'owner' or ${perm} = any(${crmRoles.permissions}))`));
  return rows.map((r) => r.id);
}

export async function notify(userIds: (string | null | undefined)[], n: StaffNotification) {
  const ids = [...new Set(userIds.filter((x): x is string => !!x))];
  if (!ids.length) return;
  const next = { kind: n.kind, title: n.title.slice(0, 200), body: (n.body ?? "").slice(0, 500), link: n.link ?? null };
  // Непрочитанное о том же объекте — обновляем (текст, счётчик, наверх списка), а не кладём ещё одно (notifyThread).
  const open = next.link
    ? await db
        .select({ id: crmNotifications.id, userId: crmNotifications.userId, kind: crmNotifications.kind, title: crmNotifications.title, link: crmNotifications.link, count: crmNotifications.count })
        .from(crmNotifications)
        .where(and(inArray(crmNotifications.userId, ids), isNull(crmNotifications.readAt), eq(crmNotifications.kind, next.kind), eq(crmNotifications.link, next.link)))
    : [];
  const fresh: string[] = [];
  const now = new Date();
  for (const userId of ids) {
    const prev = open.find((r) => r.userId === userId && sameThread(r, next));
    if (!prev) {
      fresh.push(userId);
      continue;
    }
    const count = prev.count + 1;
    await db.update(crmNotifications).set({ title: next.title, body: threadBody(next.kind, count, next.body), count, createdAt: now }).where(eq(crmNotifications.id, prev.id));
  }
  if (fresh.length) await db.insert(crmNotifications).values(fresh.map((userId) => ({ userId, ...next })));
  // Мгновенно — открытым вкладкам CRM (SSE) и на устройства с push (если push не выключен), не задерживая основное действие.
  const { publish } = await import("@/modules/workspace/infrastructure/realtime");
  await publish({ type: "notify", users: ids });
  // Push — только о новом: обновлённое непрочитанное телефон второй раз не будит («не звенеть на каждое слово»).
  if (n.push === false || !fresh.length) return;
  // Личные настройки: тихие часы и push о сообщениях клиентов (tasks-19, tasks-22) — колокольчик получают все.
  const prefs = await db.select({ id: users.id, prefs: users.notifyPrefs }).from(users).where(inArray(users.id, fresh));
  const to = prefs.filter((u) => pushAllowed(readNotifyPrefs(u.prefs), n.kind, now)).map((u) => u.id);
  if (!to.length) return;
  const { pushTo } = await import("@/modules/workspace/infrastructure/push");
  // Тег — по объекту (ссылке): новое уведомление о том же чате заменяет прежнее, а не копится стопкой (tasks-d8).
  void pushTo(to, { title: n.title, body: n.body, link: n.link, kind: n.kind, tag: n.link ? `${n.kind}:${n.link}` : n.kind }).catch((err) => console.error("[push]", err));
}

/** Личные настройки уведомлений сотрудника. */
export async function notifyPrefsOf(userId: string) {
  const [u] = await db.select({ prefs: users.notifyPrefs }).from(users).where(eq(users.id, userId)).limit(1);
  return readNotifyPrefs(u?.prefs);
}

export async function saveNotifyPrefs(userId: string, prefs: ReturnType<typeof readNotifyPrefs>) {
  await db.update(users).set({ notifyPrefs: prefs as unknown as Record<string, unknown> }).where(eq(users.id, userId));
}

/** Действующий ли сотрудник (не отключён и не лишён доступа к CRM): поиск по первичному ключу. */
async function activeStaff(userId: string) {
  const [u] = await db.select({ id: users.id }).from(users).where(and(eq(users.id, userId), eq(users.role, "admin"), eq(users.staffDisabled, false))).limit(1);
  return !!u;
}

/**
 * Ответственному, а если его нет — всем, у кого есть право (неразобранное видят все). Ответственный отключён или больше не
 * сотрудник — как без ответственного: задача по нему уже ничья (TasksService.createSystem), и уведомление не должно уйти
 * тому, кто его не увидит.
 */
export async function notifyOwnerOr(assigneeId: string | null | undefined, perm: Permission, n: StaffNotification) {
  await notify(assigneeId && (await activeStaff(assigneeId)) ? [assigneeId] : await staffWith(perm), n);
}

/** Порт уведомлений для других модулей (src/shared/application). */
export const staffNotifier: StaffNotifier<Permission> = {
  notify,
  notifyOwnerOr,
  notifyAllWith: async (perm, n) => notify(await staffWith(perm), n),
};
