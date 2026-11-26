"use server";

import { ApiClientError } from "@mybook/contracts";
import { getLocale, getMessages, lredirect } from "@/i18n/server";
import { readSource, queueEvent } from "@/server/track";
import { z } from "zod";
import { formObject, formText } from "@/server/input";
import { trustedClientIp, rateLimit } from "@/server/rateLimit";
import { isThemeId } from "@/lib/content/themes";
import {
  clearTwoFactorTicket,
  destroySession,
  issueTwoFactorTicket,
  rawTwoFactorTicket,
  readTwoFactorTicket,
  safeNextPath,
  setTwoFactorTicket,
  startSession,
} from "@/server/auth";
import {
  localCompleteSecondFactor,
  localForgotPassword,
  localLogin,
  localRegister,
  localResetComplete,
} from "@/server/v1-local-bridge";
import { v1WebAction } from "@/server/v1-web-client";

export interface FormState {
  error?: string;
  ok?: boolean;
  message?: string;
  /** Ссылка доступа устарела: форма предлагает написать в WhatsApp (у клиента по телефону нет почты для «Запросить новую»). */
  expired?: boolean;
  /** Поле, к которому относится ошибка: форма ставит сообщение под него. Без поля — общее сообщение над кнопкой. */
  field?: "name" | "email" | "password" | "consent" | "code";
}

/** Поле формы по пути ошибки zod (name, email, password, consent). */
const fieldOf = (path: PropertyKey[]): FormState["field"] => (["name", "email", "password", "consent"] as const).find((f) => f === path[0]);

type AuthErrors = Awaited<ReturnType<typeof getMessages>>["auth"]["errors"];
const emailSchema = (e: AuthErrors) => z.string().trim().toLowerCase().email(e.email).max(200);
const passwordSchema = (e: AuthErrors) => z.string().min(8, e.password).max(200);

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
  if (!parsed.success) return { error: parsed.error.issues[0].message, field: fieldOf(parsed.error.issues[0].path) };
  const source = await readSource();
  const outcome = await v1WebAction({
    section: "cabinet",
    locale,
    viaApi: async (api): Promise<{ ok: true; token: string; expiresAt: Date } | { ok: false; error: string; field?: "email" | "password" }> => {
      try {
        const res = await api.webAuthRegister({
          body: { name: parsed.data.name, email: parsed.data.email, password: parsed.data.password, locale, source },
        });
        return { ok: true, token: res.token, expiresAt: new Date(res.expiresAt) };
      } catch (err) {
        if (err instanceof ApiClientError && [400, 403, 409, 429].includes(err.status)) {
          const field = err.code === "exists" || err.code === "email" ? "email" : err.code === "password" ? "password" : undefined;
          return { ok: false, error: err.message, field };
        }
        throw err;
      }
    },
    local: async () => {
      if (!(await rateLimit(`register:${await trustedClientIp()}`, 10, 3600_000))) return { ok: false as const, error: e.tooMany };
      return localRegister({
        name: parsed.data.name,
        email: parsed.data.email,
        password: parsed.data.password,
        locale,
        source,
        registrationClosedText: e.registrationClosed,
      });
    },
  });
  if (!outcome.ok) return { error: outcome.error, field: outcome.field };
  await startSession(outcome.token, outcome.expiresAt);
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
  if (!login || !password) return { error: e.credentialsMissing, field: login ? "password" : "email" };
  const next = safeNextPath(form.get("next"));
  type LoginOutcome =
    | { kind: "session"; token: string; expiresAt: Date }
    | { kind: "second_factor"; userId: string }
    | { kind: "second_factor_ticket"; ticket: string }
    | { kind: "error"; error: string };
  const outcome = await v1WebAction<LoginOutcome>({
    section: "cabinet",
    locale,
    viaApi: async (api) => {
      try {
        const res = await api.authLogin({ body: { login, password } });
        if (res.secondFactorTicket) return { kind: "second_factor_ticket", ticket: res.secondFactorTicket };
        if (res.session) return { kind: "session", token: res.session.token, expiresAt: new Date(res.session.expiresAt) };
        return { kind: "error", error: e.credentials };
      } catch (err) {
        if (err instanceof ApiClientError && [400, 401, 429].includes(err.status)) return { kind: "error", error: err.message };
        throw err;
      }
    },
    local: async () => {
      if (!(await rateLimit(`login:${await trustedClientIp()}`, 30, 900_000)) || !(await rateLimit(`login:${login.toLowerCase()}`, 10, 900_000))) {
        return { kind: "error" as const, error: e.tooManyLogin };
      }
      return localLogin({ login, password, locale });
    },
  });
  if (outcome.kind === "error") return { error: outcome.error };
  // Сотрудник с включённой 2FA: сессию создаём только после кода из приложения.
  if (outcome.kind === "second_factor_ticket") {
    await setTwoFactorTicket(outcome.ticket);
    return lredirect(`/login/2fa?next=${encodeURIComponent(next)}`);
  }
  if (outcome.kind === "second_factor") {
    await issueTwoFactorTicket(outcome.userId);
    return lredirect(`/login/2fa?next=${encodeURIComponent(next)}`);
  }
  await startSession(outcome.token, outcome.expiresAt);
  return lredirect(next);
}

export async function twoFactorAction(_: FormState, form: FormData): Promise<FormState> {
  const [locale, m] = await Promise.all([getLocale(), getMessages()]);
  const e = m.auth.errors;
  const rawTicket = await rawTwoFactorTicket();
  if (!rawTicket) return { error: e.twoFactorExpired };
  const code = formText.safeParse(form.get("code") ?? undefined);
  if (!code.success) return { error: e.twoFactorCode, field: "code" };
  const outcome = await v1WebAction({
    section: "cabinet",
    locale,
    viaApi: async (api): Promise<{ ok: true; token: string; expiresAt: Date } | { ok: false; error: string; field?: "code" }> => {
      try {
        const res = await api.authSecondFactor({ body: { ticket: rawTicket, code: code.data } });
        return { ok: true, token: res.token, expiresAt: new Date(res.expiresAt) };
      } catch (err) {
        if (err instanceof ApiClientError && [400, 401, 429].includes(err.status)) {
          return { ok: false, error: err.message, field: err.code === "twoFactorCode" ? "code" : undefined };
        }
        throw err;
      }
    },
    local: async () => {
      const userId = await readTwoFactorTicket();
      if (!userId) return { ok: false as const, error: e.twoFactorExpired };
      if (!(await rateLimit(`2fa:${userId}`, 8, 900_000)) || !(await rateLimit(`2fa-ip:${await trustedClientIp()}`, 30, 900_000))) {
        return { ok: false as const, error: e.tooManyLogin };
      }
      return localCompleteSecondFactor({ userId, code: code.data, locale });
    },
  });
  if (!outcome.ok) return { error: outcome.error, field: outcome.field };
  await clearTwoFactorTicket();
  await startSession(outcome.token, outcome.expiresAt);
  return lredirect(safeNextPath(form.get("next")));
}

export async function logoutAction() {
  await destroySession();
  return lredirect("/");
}

export async function forgotAction(_: FormState, form: FormData): Promise<FormState> {
  const [locale, m] = await Promise.all([getLocale(), getMessages()]);
  const email = emailSchema(m.auth.errors).safeParse(form.get("email"));
  if (!email.success) return { error: m.auth.errors.email, field: "email" };
  const outcome = await v1WebAction({
    section: "cabinet",
    locale,
    viaApi: async (api): Promise<{ ok: true } | { ok: false; error: string }> => {
      try {
        await api.webAuthForgot({ body: { email: email.data, locale } });
        return { ok: true };
      } catch (err) {
        if (err instanceof ApiClientError && [400, 429].includes(err.status)) return { ok: false, error: err.message };
        throw err;
      }
    },
    local: async () => {
      if (!(await rateLimit(`forgot:${await trustedClientIp()}`, 5, 3600_000))) return { ok: false as const, error: m.auth.errors.tooManyForgot };
      return localForgotPassword({ email: email.data, locale });
    },
  });
  if (!outcome.ok) return { error: outcome.error };
  return { ok: true, message: m.auth.forgot.sent };
}

/**
 * Новый пароль по ссылке (POST формы /reset/<token>): сброс по почте или доступ в кабинет после оплаты по счёту из чата.
 * Ссылка доступа погашается своим путём — без прав администратора (их даёт только сброс по почте).
 */
export async function resetAction(_: FormState, form: FormData): Promise<FormState> {
  const [locale, m] = await Promise.all([getLocale(), getMessages()]);
  const password = passwordSchema(m.auth.errors).safeParse(form.get("password"));
  if (!password.success) return { error: password.error.issues[0].message, field: "password" };
  const token = z.string().regex(/^[A-Za-z0-9_-]{20,100}$/).safeParse(form.get("token"));
  if (!token.success) return { error: m.auth.errors.resetExpired };
  type ResetOutcome =
    | { kind: "session"; token: string; expiresAt: Date }
    | { kind: "second_factor"; userId: string }
    | { kind: "second_factor_ticket"; ticket: string }
    | { kind: "error"; error: string; expired?: boolean };
  const outcome = await v1WebAction<ResetOutcome>({
    section: "cabinet",
    locale,
    viaApi: async (api) => {
      try {
        const res = await api.webAuthResetComplete({ body: { token: token.data, password: password.data } });
        if (res.kind === "second_factor" && res.secondFactorTicket) return { kind: "second_factor_ticket", ticket: res.secondFactorTicket };
        if (res.kind === "session" && res.token && res.expiresAt) return { kind: "session", token: res.token, expiresAt: new Date(res.expiresAt) };
        return { kind: "error", error: m.auth.errors.resetExpired };
      } catch (err) {
        if (err instanceof ApiClientError && err.status === 400) {
          if (err.code === "accessExpired") return { kind: "error", error: err.message, expired: true };
          return { kind: "error", error: err.message };
        }
        throw err;
      }
    },
    local: () => localResetComplete({ token: token.data, password: password.data, accessExpiredText: m.auth.errors.accessExpired }),
  });
  if (outcome.kind === "error") return outcome.expired ? { error: outcome.error, expired: true } : { error: outcome.error };
  // Смена пароля по письму не обходит второй фактор сотрудника.
  if (outcome.kind === "second_factor_ticket") {
    await setTwoFactorTicket(outcome.ticket);
    return lredirect("/login/2fa?next=%2Fadmin");
  }
  if (outcome.kind === "second_factor") {
    await issueTwoFactorTicket(outcome.userId);
    return lredirect("/login/2fa?next=%2Fadmin");
  }
  await startSession(outcome.token, outcome.expiresAt);
  return lredirect("/books");
}
