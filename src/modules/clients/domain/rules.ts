import { normalizePhone } from "@/shared/domain/phone";
import { fromZonedTime, storeTimeZone, zonedParts } from "@/shared/domain/time";

export type TaskKind = "task" | "call" | "message" | "meeting";
export type NoteKind = "note" | "call" | "message" | "email" | "system";

/** Задача менеджера по клиенту, заказу или сделке. */
export interface Task {
  id: string;
  title: string;
  kind: TaskKind;
  dueAt: Date | null;
  doneAt: Date | null;
  clientId: string | null;
  orderId: string | null;
  dealId: string | null;
  assigneeId: string | null;
  createdById: string | null;
  /** За сколько минут до срока напомнить; null — не напоминать. */
  remindBeforeMin?: number | null;
}

/** Чужие задачи закрывают и удаляют только с правом «все задачи»; свои, ничьи и поставленные мной — можно. */
export function canManageTask(actor: { userId: string; allTasks: boolean }, t: Pick<Task, "assigneeId" | "createdById">) {
  return actor.allTasks || !t.assigneeId || t.assigneeId === actor.userId || t.createdById === actor.userId;
}

/** Срок без времени — до конца рабочего дня (18:00). */
export function taskDue(raw: string | undefined): Date | null {
  if (!raw) return null;
  return new Date(raw.length === 10 ? `${raw}T18:00:00` : raw);
}

/** Как отложить задачу одной кнопкой («Мой день», «Задачи»). */
export type TaskSnooze = "hour" | "tomorrow";

/**
 * Новый срок отложенной задачи. «+1 ч» — на час позже срока, а если срок уже прошёл (или его нет) — через час от сейчас.
 * «Завтра» — завтрашний день магазина (tz) в то же время, что и срок; без срока — в то же время, что сейчас.
 */
export function snoozedDue(due: Date | null, now: Date, by: TaskSnooze, tz = storeTimeZone()): Date {
  if (by === "hour") return new Date(Math.max(now.getTime(), due?.getTime() ?? 0) + 60 * 60_000);
  const day = zonedParts(now, tz);
  const time = zonedParts(due ?? now, tz).minutes;
  // Местные «завтра, ЧЧ:ММ» — через Date.UTC (сам переносит конец месяца), затем в момент по поясу магазина.
  const wall = new Date(Date.UTC(day.y, day.m - 1, day.d + 1, Math.floor(time / 60), time % 60)).toISOString().slice(0, 16);
  return fromZonedTime(wall, tz);
}

/** Системные записи (звонки, смены этапов) — часть истории, их не удаляют. */
export const isDeletableNote = (kind: NoteKind) => kind !== "system";

/** Дополнительные телефоны клиента: нормализованы, без основного номера и повторов, не больше пяти. */
export function extraPhones(raw: string, mainPhone: string | null) {
  const main = mainPhone ? normalizePhone(mainPhone) : "";
  return [...new Set(raw.split(/[,;\n]/).map((p) => normalizePhone(p)).filter((p) => p.length >= 10 && p !== main))].slice(0, 5);
}

export const normalizeTags = (tags: string[]) => [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 20);
