"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ApiClientError } from "@mybook/contracts";
import { ACCOUNT_LIMITS } from "@mybook/contracts/limits";
import { formObject, formText } from "@/server/input";
import { destroySession, requireUser, sessionToken } from "@/server/auth";
import { trustedClientIp, rateLimit } from "@/server/rateLimit";
import { getLocale, getMessages, lredirect } from "@/i18n/server";
import { accountDeletionFor } from "@/i18n/messages/account-deletion";
import { localChangePassword, localDeleteAccount, localSetReminders, localUpdateProfile } from "@/server/v1-local-bridge";
import { v1WebAction } from "@/server/v1-web-client";

export interface AccountState {
  error?: string;
  ok?: string;
  /** Поле, к которому относится ошибка: форма ставит сообщение под него, а не над кнопкой. */
  field?: "name" | "phone" | "current" | "next";
}

export async function updateProfileAction(_: AccountState, form: FormData): Promise<AccountState> {
  const user = await requireUser();
  const [locale, m] = await Promise.all([getLocale(), getMessages()]);
  const t = m.orders.account;
  const parsed = z
    .object({
      name: z.string().trim().min(1, t.errors.name).max(ACCOUNT_LIMITS.name),
      phone: z.union([z.literal(""), z.string().trim().regex(ACCOUNT_LIMITS.phone, t.errors.phone)]),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: issue.message, field: issue.path[0] === "phone" ? "phone" : "name" };
  }
  const res = await v1WebAction({
    section: "cabinet",
    locale,
    viaApi: async (api): Promise<AccountState> => {
      const view = await api.meProfileUpdate({ body: { name: parsed.data.name, phone: parsed.data.phone } });
      if (view.notice && !view.notice.ok) return { error: view.notice.text, field: view.notice.field ?? undefined };
      return { ok: t.saved };
    },
    local: async (): Promise<AccountState> => {
      await localUpdateProfile(user.id, parsed.data.name, parsed.data.phone || null);
      return { ok: t.saved };
    },
  });
  if (res.ok) revalidatePath("/account");
  return res;
}

/** Напоминания дописать книгу: клиент сам включает и выключает их (раньше вернуть можно было только через поддержку). */
export async function setRemindersAction(_: AccountState, form: FormData): Promise<AccountState> {
  const user = await requireUser();
  const [locale, m] = await Promise.all([getLocale(), getMessages()]);
  const t = m.orders.account;
  const input = z.object({ on: z.enum(["1", "0"]) }).safeParse(formObject(form));
  if (!input.success) return { error: t.errors.wrong };
  const on = input.data.on === "1";
  await v1WebAction({
    section: "cabinet",
    locale,
    viaApi: async (api) => {
      await api.meRemindersSet({ body: { on } });
    },
    local: () => localSetReminders(user.id, on),
  });
  revalidatePath("/account");
  return { ok: on ? t.notifications.savedOn : t.notifications.savedOff };
}

export async function changePasswordAction(_: AccountState, form: FormData): Promise<AccountState> {
  const user = await requireUser();
  const [locale, m] = await Promise.all([getLocale(), getMessages()]);
  const t = m.orders.account;
  const input = z.object({ current: formText, next: formText }).safeParse(formObject(form));
  if (!input.success) return { error: t.errors.wrong, field: "current" };
  const token = await sessionToken();
  const outcome = await v1WebAction({
    section: "cabinet",
    locale,
    sessionCookie: token,
    viaApi: async (api): Promise<{ ok: true } | { ok: false; error: string; field?: "current" | "next" }> => {
      const view = await api.mePasswordChange({ body: { current: input.data.current, next: input.data.next } });
      if (view.notice && !view.notice.ok) {
        if (view.notice.field === "next") return { ok: false, error: t.errors.short, field: "next" };
        if (view.notice.field === "current") return { ok: false, error: t.errors.wrong, field: "current" };
        return { ok: false, error: t.errors.tooMany };
      }
      return { ok: true };
    },
    local: async () => {
      if (!(await rateLimit(`pwd:${user.id}:${await trustedClientIp()}`, 10, 900_000))) return { ok: false as const, error: t.errors.tooMany };
      return localChangePassword({
        userId: user.id,
        current: input.data.current,
        next: input.data.next,
        sessionToken: token,
        errors: { short: t.errors.short, wrong: t.errors.wrong },
      });
    },
  });
  if (!outcome.ok) return { error: outcome.error, field: outcome.field };
  return { ok: t.changed };
}

/** Удаление аккаунта (тот же сценарий, что meDelete в API v1): пароль, затем выход и главная. */
export async function deleteAccountAction(_: AccountState, form: FormData): Promise<AccountState> {
  const user = await requireUser();
  const [locale, m] = await Promise.all([getLocale(), getMessages()]);
  const [t, d] = [m.orders.account, accountDeletionFor(locale)];
  if (user.role !== "user") return { error: d.staff };
  const input = z.object({ password: formText }).safeParse(formObject(form));
  if (!input.success) return { error: t.errors.wrong, field: "current" };
  const outcome = await v1WebAction({
    section: "cabinet",
    locale,
    viaApi: async (api): Promise<{ ok: true } | { ok: false; error: string; field?: "current" }> => {
      try {
        await api.meDelete({ locale, body: { password: input.data.password } });
        return { ok: true };
      } catch (err) {
        if (err instanceof ApiClientError) {
          if (err.status === 429) return { ok: false, error: t.errors.tooMany };
          if (err.status === 403 && err.code === "staffAccount") return { ok: false, error: d.staff };
          if (err.status === 400) return { ok: false, error: t.errors.wrong, field: "current" };
        }
        throw err;
      }
    },
    local: async () => {
      if (!(await rateLimit(`del:${user.id}:${await trustedClientIp()}`, 10, 900_000))) return { ok: false as const, error: t.errors.tooMany };
      return localDeleteAccount({
        userId: user.id,
        password: input.data.password,
        locale,
        errors: { wrong: t.errors.wrong },
      });
    },
  });
  if (!outcome.ok) return { error: outcome.error, field: outcome.field };
  await destroySession();
  return lredirect("/");
}
