"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { formObject, formText } from "@/server/input";
import { requireUser, sessionToken } from "@/server/auth";
import { container } from "@/server/container";
import { IdentityError } from "@/modules/identity";
import { trustedClientIp, rateLimit } from "@/server/rateLimit";
import { getMessages } from "@/i18n/server";

export interface AccountState {
  error?: string;
  ok?: string;
  /** Поле, к которому относится ошибка: форма ставит сообщение под него, а не над кнопкой. */
  field?: "name" | "phone" | "current" | "next";
}

export async function updateProfileAction(_: AccountState, form: FormData): Promise<AccountState> {
  const user = await requireUser();
  const t = (await getMessages()).orders.account;
  const parsed = z
    .object({
      name: z.string().trim().min(1, t.errors.name).max(100),
      phone: z.union([z.literal(""), z.string().trim().regex(/^[+\d][\d\s()-]{9,20}$/, t.errors.phone)]),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: issue.message, field: issue.path[0] === "phone" ? "phone" : "name" };
  }
  await container().identity.accounts.updateProfile(user.id, parsed.data.name, parsed.data.phone || null);
  revalidatePath("/account");
  return { ok: t.saved };
}

/** Напоминания дописать книгу: клиент сам включает и выключает их (раньше вернуть можно было только через поддержку). */
export async function setRemindersAction(_: AccountState, form: FormData): Promise<AccountState> {
  const user = await requireUser();
  const t = (await getMessages()).orders.account;
  const input = z.object({ on: z.enum(["1", "0"]) }).safeParse(formObject(form));
  if (!input.success) return { error: t.errors.wrong };
  await container().notifications.subscriptions.setReminders(user.id, input.data.on === "1");
  revalidatePath("/account");
  return { ok: input.data.on === "1" ? t.notifications.savedOn : t.notifications.savedOff };
}

export async function changePasswordAction(_: AccountState, form: FormData): Promise<AccountState> {
  const user = await requireUser();
  const t = (await getMessages()).orders.account;
  if (!await rateLimit(`pwd:${user.id}:${await trustedClientIp()}`, 10, 900_000)) return { error: t.errors.tooMany };
  const input = z.object({ current: formText, next: formText }).safeParse(formObject(form));
  if (!input.success) return { error: t.errors.wrong, field: "current" };
  try {
    // Выходим на всех остальных устройствах, текущая сессия остаётся.
    await container().identity.accounts.changePassword(user.id, input.data.current, input.data.next, await sessionToken());
  } catch (err) {
    if (IdentityError.is(err)) return err.code === "password" ? { error: t.errors.short, field: "next" } : { error: t.errors.wrong, field: "current" };
    throw err;
  }
  return { ok: t.changed };
}
