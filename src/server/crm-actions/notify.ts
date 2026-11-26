"use server";

import { z } from "zod";
import { assertStaff } from "@/server/access";
import { isValidPrefTime, notifyPrefsOf, saveNotifyPrefs, type NotifyPrefs } from "@/modules/workspace";

/** Мои настройки push: тихие часы и push о сообщениях клиентов (tasks-19, tasks-22). */
export async function myNotifyPrefsAction(): Promise<NotifyPrefs> {
  const staff = await assertStaff();
  return notifyPrefsOf(staff.user.id);
}

const schema = z.object({
  quiet: z.boolean(),
  quietFrom: z.string().refine(isValidPrefTime, "Время — ЧЧ:ММ"),
  quietTo: z.string().refine(isValidPrefTime, "Время — ЧЧ:ММ"),
  pushMessages: z.boolean(),
});

export async function saveMyNotifyPrefsAction(input: NotifyPrefs): Promise<{ ok: true } | { ok: false; error: string }> {
  const staff = await assertStaff();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  await saveNotifyPrefs(staff.user.id, parsed.data);
  return { ok: true };
}
