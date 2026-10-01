"use server";

import { getLocale, getMessages, lredirect } from "@/i18n/server";
import { readSource, queueEvent } from "@/lib/track";
import { z } from "zod";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { isThemeId } from "@/lib/content/themes";
import { IdentityError } from "@/modules/identity";
import { container } from "@/server/container";
import { clearTwoFactorTicket, destroySession, issueTwoFactorTicket, readTwoFactorTicket, safeNextPath, startSession } from "@/server/auth";

export interface FormState {
  error?: string;
  ok?: boolean;
  message?: string;
}

type AuthErrors = Awaited<ReturnType<typeof getMessages>>["auth"]["errors"];
const emailSchema = (e: AuthErrors) => z.string().trim().toLowerCase().email(e.email).max(200);
const passwordSchema = (e: AuthErrors) => z.string().min(8, e.password).max(200);

/** Код ошибки домена → текст словаря auth.errors. */
function identityText(err: IdentityError, e: AuthErrors): string {
  const map: Partial<Record<IdentityError["code"], string>> = {
    email: e.email,
    password: e.password,
    exists: e.exists,
    credentials: e.credentials,
    resetExpired: e.resetExpired,
    twoFactorCode: e.twoFactorCode,
    twoFactorExpired: e.twoFactorExpired,
  };
  return map[err.code] ?? e.credentials;
}

export async function registerAction(_: FormState, form: FormData): Promise<FormState> {
  const [locale, m] = await Promise.all([getLocale(), getMessages()]);
  const e = m.auth.errors;
  const parsed = z
    .object({
      name: z.string().trim().min(1, e.name).max(100),
      email: emailSchema(e),
      password: passwordSchema(e),
      consent: z.literal("on", { message: e.consent }),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (!await rateLimit(`register:${await clientIp()}`, 10, 3600_000)) return { error: e.tooMany };
  try {
    const { token, expiresAt } = await container().identity.auth.register({ ...parsed.data, locale, source: await readSource() });
    await startSession(token, expiresAt);
  } catch (err) {
    if (IdentityError.is(err)) return { error: identityText(err, e) };
    throw err;
  }
  await queueEvent("sign_up");
  const theme = String(form.get("theme") ?? "");
  return lredirect(isThemeId(theme) ? `/books/new?theme=${theme}` : "/books/new");
}

export async function loginAction(_: FormState, form: FormData): Promise<FormState> {
  const [locale, m] = await Promise.all([getLocale(), getMessages()]);
  const e = m.auth.errors;
  const email = emailSchema(e).safeParse(form.get("email"));
  const password = String(form.get("password") ?? "");
  if (!email.success || !password) return { error: e.credentialsMissing };
  if (!await rateLimit(`login:${await clientIp()}`, 30, 900_000) || !await rateLimit(`login:${email.data}`, 10, 900_000)) return { error: e.tooManyLogin };
  const next = safeNextPath(form.get("next"));
  try {
    const result = await container().identity.auth.login({ email: email.data, password, locale });
    // Сотрудник с включённой 2FA: сессию создаём только после кода из приложения.
    if (result.kind === "second_factor") {
      await issueTwoFactorTicket(result.userId);
      return lredirect(`/login/2fa?next=${encodeURIComponent(next)}`);
    }
    await startSession(result.token, result.expiresAt);
  } catch (err) {
    if (IdentityError.is(err)) return { error: identityText(err, e) };
    throw err;
  }
  return lredirect(next);
}

export async function twoFactorAction(_: FormState, form: FormData): Promise<FormState> {
  const [locale, m] = await Promise.all([getLocale(), getMessages()]);
  const e = m.auth.errors;
  const userId = await readTwoFactorTicket();
  if (!userId) return { error: e.twoFactorExpired };
  if (!await rateLimit(`2fa:${userId}`, 8, 900_000) || !await rateLimit(`2fa-ip:${await clientIp()}`, 30, 900_000)) return { error: e.tooManyLogin };
  try {
    const { token, expiresAt } = await container().identity.auth.completeSecondFactor(userId, String(form.get("code") ?? ""), locale);
    await clearTwoFactorTicket();
    await startSession(token, expiresAt);
  } catch (err) {
    if (IdentityError.is(err)) return { error: identityText(err, e) };
    throw err;
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
  if (!await rateLimit(`forgot:${await clientIp()}`, 5, 3600_000)) return { error: m.auth.errors.tooManyForgot };
  await container().identity.auth.requestPasswordReset(email.data, locale);
  return { ok: true, message: m.auth.forgot.sent };
}

export async function resetAction(_: FormState, form: FormData): Promise<FormState> {
  const m = await getMessages();
  const password = passwordSchema(m.auth.errors).safeParse(form.get("password"));
  if (!password.success) return { error: password.error.issues[0].message };
  try {
    const result = await container().identity.auth.resetPassword(String(form.get("token") ?? ""), password.data);
    // Смена пароля по письму не обходит второй фактор сотрудника.
    if (result.kind === "second_factor") {
      await issueTwoFactorTicket(result.userId);
      return lredirect("/login/2fa?next=%2Fadmin");
    }
    await startSession(result.token, result.expiresAt);
  } catch (err) {
    if (IdentityError.is(err)) return { error: identityText(err, m.auth.errors) };
    throw err;
  }
  return lredirect("/books");
}
