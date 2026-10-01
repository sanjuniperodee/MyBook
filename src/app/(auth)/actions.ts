"use server";

import { crmAfter, onClientRegistered } from "@/lib/crm/hooks";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { getLocale, getMessages, lredirect } from "@/i18n/server";
import { messagesFor } from "@/i18n/messages";
import { queueEvent, readSource } from "@/lib/track";
import { z } from "zod";
import { db } from "@/lib/db";
import { passwordResets, sessions, users } from "@/lib/db/schema";
import { createSession, destroySession, hashPassword, hashToken, newToken, safeNextPath, verifyPassword } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { env } from "@/lib/env";
import { appLink, emailLayout, escapeHtml, sendMail } from "@/lib/mail";
import { isThemeId } from "@/lib/content/themes";
import { clearTicket, issueTicket, needsSecondFactor, readTicket, verifySecondFactor } from "@/lib/crm/two-factor";

export interface FormState {
  error?: string;
  ok?: boolean;
  message?: string;
}

type AuthErrors = Awaited<ReturnType<typeof getMessages>>["auth"]["errors"];
const emailSchema = (e: AuthErrors) => z.string().trim().toLowerCase().email(e.email).max(200);
const passwordSchema = (e: AuthErrors) => z.string().min(8, e.password).max(200);

function findUserByEmail(email: string) {
  return db.query.users.findFirst({ where: sql`lower(${users.email}) = ${email.toLowerCase()}` });
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
  if (!rateLimit(`register:${await clientIp()}`, 10, 3600_000)) return { error: e.tooMany };

  const { name, email, password } = parsed.data;
  if (await findUserByEmail(email)) return { error: e.exists };
  const [user] = await db
    .insert(users)
    .values({ name, email, locale, passwordHash: await hashPassword(password), source: await readSource() })
    .returning();
  await createSession(user.id);
  await queueEvent("sign_up");
  crmAfter(() => onClientRegistered(user.id));
  const theme = String(form.get("theme") ?? "");
  return lredirect(isThemeId(theme) ? `/books/new?theme=${theme}` : "/books/new");
}

export async function loginAction(_: FormState, form: FormData): Promise<FormState> {
  const [locale, m] = await Promise.all([getLocale(), getMessages()]);
  const e = m.auth.errors;
  const email = emailSchema(e).safeParse(form.get("email"));
  const password = String(form.get("password") ?? "");
  if (!email.success || !password) return { error: e.credentialsMissing };
  const ip = await clientIp();
  if (!rateLimit(`login:${ip}`, 30, 900_000) || !rateLimit(`login:${email.data}`, 10, 900_000)) {
    return { error: e.tooManyLogin };
  }
  const user = await findUserByEmail(email.data);
  if (!user || !(await verifyPassword(password, user.passwordHash))) return { error: e.credentials };
  // Сотрудник с включённой 2FA: сессию создаём только после кода из приложения.
  if (needsSecondFactor(user)) {
    await issueTicket(user.id);
    const next = safeNextPath(form.get("next"));
    return lredirect(`/login/2fa?next=${encodeURIComponent(next)}`);
  }
  await createSession(user.id);
  // Письма приходят на языке, которым человек пользуется сейчас.
  if (user.locale !== locale) await db.update(users).set({ locale }).where(eq(users.id, user.id));
  return lredirect(safeNextPath(form.get("next")));
}

export async function twoFactorAction(_: FormState, form: FormData): Promise<FormState> {
  const [locale, m] = await Promise.all([getLocale(), getMessages()]);
  const e = m.auth.errors;
  const userId = await readTicket();
  if (!userId) return { error: e.twoFactorExpired };
  if (!rateLimit(`2fa:${userId}`, 8, 900_000) || !rateLimit(`2fa-ip:${await clientIp()}`, 30, 900_000)) return { error: e.tooManyLogin };
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user || !needsSecondFactor(user)) return { error: e.twoFactorExpired };
  if (!(await verifySecondFactor(user, String(form.get("code") ?? "")))) return { error: e.twoFactorCode };
  await clearTicket();
  await createSession(user.id);
  if (user.locale !== locale) await db.update(users).set({ locale }).where(eq(users.id, user.id));
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
  if (!rateLimit(`forgot:${await clientIp()}`, 5, 3600_000)) return { error: m.auth.errors.tooManyForgot };
  const user = await findUserByEmail(email.data);
  if (user) {
    const token = newToken();
    await db.insert(passwordResets).values({ id: hashToken(token), userId: user.id, expiresAt: new Date(Date.now() + 3600_000) });
    // Письмо — на языке страницы, с которой запросили восстановление.
    const t = messagesFor(locale).mail;
    await sendMail(
      user.email,
      t.reset.subject,
      emailLayout({
        locale,
        title: t.reset.title,
        paragraphs: [t.hello(escapeHtml(user.name)), t.reset.text],
        button: { label: t.reset.button, url: appLink(`/reset/${token}`, locale) },
        footnote: t.reset.footnote,
      }),
    );
  }
  return { ok: true, message: m.auth.forgot.sent };
}

export async function resetAction(_: FormState, form: FormData): Promise<FormState> {
  const token = String(form.get("token") ?? "");
  const m = await getMessages();
  const password = passwordSchema(m.auth.errors).safeParse(form.get("password"));
  if (!password.success) return { error: password.error.issues[0].message };
  const [reset] = await db
    .select()
    .from(passwordResets)
    .where(and(eq(passwordResets.id, hashToken(token)), gt(passwordResets.expiresAt, new Date()), isNull(passwordResets.usedAt)))
    .limit(1);
  if (!reset) return { error: m.auth.errors.resetExpired };
  const owner = await db.query.users.findFirst({ where: eq(users.id, reset.userId) });
  // Права администратора из ADMIN_EMAILS выдаются только здесь: переход по ссылке из письма подтверждает владение адресом.
  const promote = !!owner && owner.role !== "admin" && env.adminEmails.includes(owner.email.toLowerCase());
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(password.data), ...(promote ? { role: "admin" as const } : {}) })
    .where(eq(users.id, reset.userId));
  await db.update(passwordResets).set({ usedAt: new Date() }).where(eq(passwordResets.id, reset.id));
  await db.delete(sessions).where(eq(sessions.userId, reset.userId));
  // Смена пароля по письму не должна обходить второй фактор сотрудника.
  if (owner && needsSecondFactor(owner)) {
    await issueTicket(owner.id);
    return lredirect("/login/2fa?next=%2Fadmin");
  }
  await createSession(reset.userId);
  return lredirect("/books");
}
