import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { crmNotifications, crmRoles, users } from "../db/schema";
import type { Permission } from "./permissions";

export interface NotificationInput {
  kind: "message" | "call" | "task" | "deal" | "sla" | "system";
  title: string;
  body?: string;
  link?: string | null;
}

/** Активные сотрудники с правом perm (руководители — всегда). */
export async function staffWith(perm: Permission): Promise<string[]> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .leftJoin(crmRoles, eq(crmRoles.id, users.crmRoleId))
    .where(and(eq(users.role, "admin"), eq(users.staffDisabled, false), sql`(${users.crmRoleId} is null or ${crmRoles.key} = 'owner' or ${perm} = any(${crmRoles.permissions}))`));
  return rows.map((r) => r.id);
}

export async function notify(userIds: (string | null | undefined)[], n: NotificationInput) {
  const ids = [...new Set(userIds.filter((x): x is string => !!x))];
  if (!ids.length) return;
  await db.insert(crmNotifications).values(ids.map((userId) => ({ userId, kind: n.kind, title: n.title.slice(0, 200), body: (n.body ?? "").slice(0, 500), link: n.link ?? null })));
}

/** Ответственному, а если его нет — всем, у кого есть право (неразобранное видят все). */
export async function notifyOwnerOr(assigneeId: string | null | undefined, perm: Permission, n: NotificationInput) {
  await notify(assigneeId ? [assigneeId] : await staffWith(perm), n);
}
