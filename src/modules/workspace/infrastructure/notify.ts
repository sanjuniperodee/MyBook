import "server-only";
import { and, eq, sql } from "drizzle-orm";
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
  await db.insert(crmNotifications).values(ids.map((userId) => ({ userId, kind: n.kind, title: n.title.slice(0, 200), body: (n.body ?? "").slice(0, 500), link: n.link ?? null })));
  // Мгновенно — открытым вкладкам CRM (SSE) и на устройства с push (если push не выключен), не задерживая основное действие.
  const { publish } = await import("@/modules/workspace/infrastructure/realtime");
  await publish({ type: "notify", users: ids });
  if (n.push === false) return;
  const { pushTo } = await import("@/modules/workspace/infrastructure/push");
  void pushTo(ids, { title: n.title, body: n.body, link: n.link, tag: n.kind }).catch((err) => console.error("[push]", err));
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
