"use server";

import { z } from "zod";
import { assertStaffShell } from "@/server/access";
import { autoShiftOnVisit } from "@/server/shift";

/**
 * Зашёл в рабочее время — сразу «в сети» (каркас CRM). lastSeenAt — когда сотрудник был в CRM до этого захода, как его
 * увидела страница: сайт без БД отмечает активность раньше, чем сюда дойдёт вызов. Ошибка не мешает открыть страницу.
 */
export async function autoShiftOnVisitAction(lastSeenAt: Date | null): Promise<boolean> {
  const staff = await assertStaffShell();
  const seen = z.date().nullable().parse(lastSeenAt);
  const before = seen && staff.user.lastSeenAt && staff.user.lastSeenAt > seen ? seen : staff.user.lastSeenAt;
  return autoShiftOnVisit({ ...staff, user: { ...staff.user, lastSeenAt: before } });
}
