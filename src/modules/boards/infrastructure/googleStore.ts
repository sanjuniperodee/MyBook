import "server-only";
import { and, eq, isNotNull, isNull, or, sql } from "drizzle-orm";
import { crmGoogleAccounts, crmGoogleEvents, crmTasks } from "@/shared/infrastructure/db/schema";
import { executor } from "@/shared/infrastructure/database";
import { crmTasksId } from "@/shared/infrastructure/db/refs";
import { decryptSecret, encryptSecret } from "@/shared/crypto";
import type { GoogleAccount, GoogleStore, SyncTask } from "../application/GoogleSync";

type Row = typeof crmGoogleAccounts.$inferSelect;
const fromRow = (r: Row): GoogleAccount => ({
  userId: r.userId,
  email: r.email,
  refreshToken: decryptSecret(r.refreshToken) ?? "",
  accessToken: r.accessToken ? decryptSecret(r.accessToken) : null,
  accessExpiresAt: r.accessExpiresAt,
  calendarId: r.calendarId,
  syncToken: r.syncToken,
  channelId: r.channelId,
  channelToken: r.channelToken,
  resourceId: r.resourceId,
  channelExpiresAt: r.channelExpiresAt,
  pullRequestedAt: r.pullRequestedAt,
  lastPushAt: r.lastPushAt,
  lastPullAt: r.lastPullAt,
  error: r.error,
});

/** Токены Google хранятся зашифрованными (APP_SECRET), как секреты «Интеграций». */
function toRow(p: Partial<Omit<GoogleAccount, "userId">>) {
  const out: Record<string, unknown> = { ...p, updatedAt: new Date() };
  if (p.refreshToken !== undefined) out.refreshToken = encryptSecret(p.refreshToken);
  if (p.accessToken !== undefined) out.accessToken = p.accessToken ? encryptSecret(p.accessToken) : null;
  return out as Partial<typeof crmGoogleAccounts.$inferInsert>;
}

const taskCols = { id: crmTasks.id, title: crmTasks.title, kind: crmTasks.kind, dueAt: crmTasks.dueAt, startAt: crmTasks.startAt, doneAt: crmTasks.doneAt, updatedAt: crmTasks.updatedAt, remindBeforeMin: crmTasks.remindBeforeMin, meet: crmTasks.meet };

export const drizzleGoogle: GoogleStore = {
  async account(userId) {
    const [r] = await executor().select().from(crmGoogleAccounts).where(eq(crmGoogleAccounts.userId, userId)).limit(1);
    return r ? fromRow(r) : null;
  },
  async accounts() {
    return (await executor().select().from(crmGoogleAccounts)).map(fromRow);
  },
  async saveAccount(a) {
    const row = { ...(toRow(a) as typeof crmGoogleAccounts.$inferInsert), userId: a.userId, refreshToken: encryptSecret(a.refreshToken) };
    await executor().insert(crmGoogleAccounts).values(row).onConflictDoUpdate({ target: crmGoogleAccounts.userId, set: row });
  },
  updateAccount: async (userId, patch) => void (await executor().update(crmGoogleAccounts).set(toRow(patch)).where(eq(crmGoogleAccounts.userId, userId))),
  deleteAccount: async (userId) => void (await executor().delete(crmGoogleAccounts).where(eq(crmGoogleAccounts.userId, userId))),
  async byChannel(channelId) {
    const [r] = await executor().select({ userId: crmGoogleAccounts.userId, channelToken: crmGoogleAccounts.channelToken }).from(crmGoogleAccounts).where(eq(crmGoogleAccounts.channelId, channelId)).limit(1);
    return r ?? null;
  },
  async tasksFor(userId, from, to) {
    const rows = await executor()
      .select(taskCols)
      .from(crmTasks)
      .where(
        and(
          isNull(crmTasks.archivedAt),
          or(isNotNull(crmTasks.dueAt), isNotNull(crmTasks.startAt)),
          sql`coalesce(${crmTasks.dueAt}, ${crmTasks.startAt}) between ${from} and ${to}`,
          or(eq(crmTasks.assigneeId, userId), sql`exists (select 1 from crm_task_members m where m.task_id = ${crmTasksId} and m.user_id = ${userId} and m.role = 'assignee')`),
        ),
      )
      .limit(2000);
    return rows as SyncTask[];
  },
  async task(taskId) {
    const [r] = await executor().select(taskCols).from(crmTasks).where(eq(crmTasks.id, taskId)).limit(1);
    return (r as SyncTask | undefined) ?? null;
  },
  links: (userId) => executor().select({ taskId: crmGoogleEvents.taskId, eventId: crmGoogleEvents.eventId, etag: crmGoogleEvents.etag, taskVersion: crmGoogleEvents.taskVersion }).from(crmGoogleEvents).where(eq(crmGoogleEvents.userId, userId)),
  async setLink(l) {
    const v = { taskId: l.taskId, userId: l.userId, eventId: l.eventId, etag: l.etag, taskVersion: l.taskVersion, meetUrl: l.meetUrl, syncedAt: new Date() };
    // Событие с тем же id у другой карточки (пересоздание) — освобождаем id.
    await executor().delete(crmGoogleEvents).where(and(eq(crmGoogleEvents.userId, l.userId), eq(crmGoogleEvents.eventId, l.eventId), sql`${crmGoogleEvents.taskId} <> ${l.taskId}`));
    await executor()
      .insert(crmGoogleEvents)
      .values(v)
      .onConflictDoUpdate({ target: [crmGoogleEvents.taskId, crmGoogleEvents.userId], set: v });
  },
  deleteLink: async (taskId, userId) => void (await executor().delete(crmGoogleEvents).where(and(eq(crmGoogleEvents.taskId, taskId), eq(crmGoogleEvents.userId, userId)))),
};
