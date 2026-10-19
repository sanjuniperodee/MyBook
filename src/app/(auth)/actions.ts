"use server";

import { getLocale, getMessages, lredirect } from "@/i18n/server";
import { readSource, queueEvent } from "@/server/track";
import { z } from "zod";
import { formObject, formText } from "@/server/input";
import { trustedClientIp, rateLimit } from "@/server/rateLimit";
import { isThemeId } from "@/lib/content/themes";
import { IdentityError } from "@/modules/identity";
import { container } from "@/server/container";
import { actionError } from "@/server/errors";
import { ensureCatalog } from "@/server/catalog";
import { registrationOpen } from "@/config/site";
import { clearTwoFactorTicket, destroySession, issueTwoFactorTicket, readTwoFactorTicket, safeNextPath, startSession } from "@/server/auth";

export interface FormState {
  error?: string;
  ok?: boolean;
  message?: string;
  /** Ссылка доступа устарела: форма предлагает написать в WhatsApp (у клиента по телефону нет почты для «Запросить новую»). */
  expired?: boolean;
}

type AuthErrors = Awaited<ReturnType<typeof getMessages>>["auth"]["errors"];
const emailSchema = (e: AuthErrors) => z.string().trim().toLowerCase().email(e.email).max(200);
const passwordSchema = (e: AuthErrors) => z.string().min(8, e.password).max(200);

export async function registerAction(_: FormState, form: FormData): Promise<FormState> {
  const [locale, m] = await Promise.all([getLocale(), getMessages()]);
  const e = m.auth.errors;
  // Регистрация закрыта в админке: форму могли открыть заранее — аккаунт не создаём.
  await ensureCatalog();
  if (!registrationOpen()) return { error: e.registrationClosed };
  const parsed = z
    .object({
      name: z.string().trim().min(1, e.name).max(100),
      email: emailSchema(e),
      password: passwordSchema(e),
      consent: z.literal("on", { message: e.consent }),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (!await rateLimit(`register:${await trustedClientIp()}`, 10, 3600_000)) return { error: e.tooMany };
  try {
    const { token, expiresAt } = await container().identity.auth.register({ ...parsed.data, locale, source: await readSource() });
    await startSession(token, expiresAt);
  } catch (err) {
    const error = await actionError(err, IdentityError);
    if (error === null) throw err;
    return { error };
  }
  await queueEvent("sign_up");
  const theme = String(form.get("theme") ?? "");
  return lredirect(isThemeId(theme) ? `/books/new?theme=${theme}` : "/books/new");
}

export async function loginAction(_: FormState, form: FormData): Promise<FormState> {
  const [locale, m] = await Promise.all([getLocale(), getMessages()]);
  const e = m.auth.errors;
  // Поле называется email, но принимает и телефон: клиент, которого завёл менеджер, может не иметь почты.
  const input = z.object({ email: formText, password: formText }).safeParse(formObject(form));
  if (!input.success) return { error: e.credentialsMissing };
  const login = input.data.email.trim().slice(0, 200);
  const password = input.data.password;
  if (!login || !password) return { error: e.credentialsMissing };
  if (!await rateLimit(`login:${await trustedClientIp()}`, 30, 900_000) || !await rateLimit(`login:${login.toLowerCase()}`, 10, 900_000)) return { error: e.tooManyLogin };
  const next = safeNextPath(form.get("next"));
  try {
    const result = await container().identity.auth.login({ login, password, locale });
    // Сотрудник с включённой 2FA: сессию создаём только после кода из приложения.
    if (result.kind === "second_factor") {
      await issueTwoFactorTicket(result.userId);
      return lredirect(`/login/2fa?next=${encodeURIComponent(next)}`);
    }
    await startSession(result.token, result.expiresAt);
  } catch (err) {
    const error = await actionError(err, IdentityError);
    if (error === null) throw err;
    return { error };
  }
  return lredirect(next);
}

export async function twoFactorAction(_: FormState, form: FormData): Promise<FormState> {
  const [locale, m] = await Promise.all([getLocale(), getMessages()]);
  const e = m.auth.errors;
  const userId = await readTwoFactorTicket();
  if (!userId) return { error: e.twoFactorExpired };
  if (!await rateLimit(`2fa:${userId}`, 8, 900_000) || !await rateLimit(`2fa-ip:${await trustedClientIp()}`, 30, 900_000)) return { error: e.tooManyLogin };
  const code = formText.safeParse(form.get("code") ?? undefined);
  if (!code.success) return { error: e.twoFactorCode };
  try {
    const { token, expiresAt } = await container().identity.auth.completeSecondFactor(userId, code.data, locale);
    await clearTwoFactorTicket();
    await startSession(token, expiresAt);
  } catch (err) {
    const error = await actionError(err, IdentityError);
    if (error === null) throw err;
    return { error };
  }
  return lredirect(safeNextPath(form.get("next")));
}

export async function logoutAction() {
  await destroySession();
  return lredirect("/");
}

export async function forgotAction(_: FormState, form: FormData): Promise<FormState> {
  const [locale, m] = await Promise.all([getLocale(), getMessages()]);
  const email = emailSchema(m.auth.errors).safeParse(form.get("email"));
  if (!email.success) return { error: m.auth.errors.email };
  if (!await rateLimit(`forgot:${await trustedClientIp()}`, 5, 3600_000)) return { error: m.auth.errors.tooManyForgot };
  await container().identity.auth.requestPasswordReset(email.data, locale);
  return { ok: true, message: m.auth.forgot.sent };
}

/**
 * Новый пароль по ссылке (POST формы /reset/<token>): сброс по почте или доступ в кабинет после оплаты по счёту из чата.
 * Ссылка доступа погашается своим путём — без прав администратора (их даёт только сброс по почте).
 */
export async function resetAction(_: FormState, form: FormData): Promise<FormState> {
  const m = await getMessages();
  const password = passwordSchema(m.auth.errors).safeParse(form.get("password"));
  if (!password.success) return { error: password.error.issues[0].message };
  const token = z.string().regex(/^[A-Za-z0-9_-]{20,100}$/).safeParse(form.get("token"));
  if (!token.success) return { error: m.auth.errors.resetExpired };
  const auth = container().identity.auth;
  const access = (await auth.linkInfo(token.data))?.purpose === "access";
  try {
    if (access) {
      const session = await auth.redeemAccessLink(token.data, password.data);
      await startSession(session.token, session.expiresAt);
    } else {
      const result = await auth.resetPassword(token.data, password.data);
      // Смена пароля по письму не обходит второй фактор сотрудника.
      if (result.kind === "second_factor") {
        await issueTwoFactorTicket(result.userId);
        return lredirect("/login/2fa?next=%2Fadmin");
      }
      await startSession(result.token, result.expiresAt);
    }
  } catch (err) {
    if (access && IdentityError.is(err) && err.code === "resetExpired") return { error: m.auth.errors.accessExpired, expired: true };
    const error = await actionError(err, IdentityError);
    if (error === null) throw err;
    return { error };
  }
  return lredirect("/books");
}
