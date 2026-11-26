/**
 * Обработчики веб-кабинета API v1 (ADR 0012, Раздел 1: сессия, регистрация/сброс пароля, полка, книги, приглашения, здоровье).
 * Делегируют тем же сервисам модулей и функциям, что прежние страницы/действия сайта.
 */
import { isLocale, type Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { getLocale, getMessages } from "@/i18n/server";
import { registrationOpen, site } from "@/config/site";
import { createBookSchema, startBookInput } from "@/lib/book/create-book-schema";
import { IdentityError } from "@/modules/identity";
import { apiViewer } from "@/server/api";
import { sessionToken } from "@/server/auth";
import { ensureCatalog } from "@/server/catalog";
import { container } from "@/server/container";
import { actionError } from "@/server/errors";
import { issueTicket } from "@/server/mobile-auth";
import { rateLimit, trustedClientIp } from "@/server/rateLimit";
import { localBooksPageData, localHealth, localInviteData, localSessionUserDto } from "@/server/v1-local-bridge";
import type { Handlers } from "../app";

async function resolveLocale(raw?: string): Promise<Locale> {
  if (isLocale(raw)) return raw;
  const fromReq = await getLocale();
  return isLocale(fromReq) ? fromReq : "ru";
}

export const webCabinetHandlers: Pick<
  Handlers,
  | "meWebSession"
  | "webAuthRegister"
  | "webAuthForgot"
  | "webAuthResetInfo"
  | "webAuthResetComplete"
  | "webShelf"
  | "webBookCreate"
  | "webBookDelete"
  | "webInvite"
  | "webHealth"
> = {
  async meWebSession() {
    const token = await sessionToken();
    if (!token) return Response.json({ user: null }, { headers: { "cache-control": "no-store" } });
    const user = await localSessionUserDto(token);
    return Response.json({ user }, { headers: { "cache-control": "no-store" } });
  },

  async webAuthRegister({ input }) {
    const locale = await resolveLocale(input.body.locale);
    const e = messagesFor(locale).auth.errors;
    await ensureCatalog();
    if (!registrationOpen()) return Response.json({ error: e.registrationClosed, code: "registrationClosed" }, { status: 403 });
    if (!(await rateLimit(`register:${await trustedClientIp()}`, 10, 3600_000))) {
      return Response.json({ error: e.tooMany, code: "tooMany" }, { status: 429 });
    }
    try {
      const { token, expiresAt } = await container().identity.auth.register({
        name: input.body.name,
        email: input.body.email,
        password: input.body.password,
        locale,
        source: input.body.source ?? null,
      });
      return { token, expiresAt: expiresAt.toISOString() };
    } catch (err) {
      const text = await actionError(err, IdentityError);
      if (text === null) throw err;
      const code = IdentityError.is(err) ? err.code : "badData";
      return Response.json({ error: text, code }, { status: code === "exists" ? 409 : 400 });
    }
  },

  async webAuthForgot({ input }) {
    const locale = await resolveLocale(input.body.locale);
    const e = messagesFor(locale).auth.errors;
    if (!(await rateLimit(`forgot:${await trustedClientIp()}`, 5, 3600_000))) {
      return Response.json({ error: e.tooManyForgot, code: "tooManyForgot" }, { status: 429 });
    }
    await container().identity.auth.requestPasswordReset(input.body.email, locale);
    return { ok: true };
  },

  async webAuthResetInfo({ input }) {
    const c = container();
    const [info, digits] = await Promise.all([
      c.identity.auth.linkInfo(input.token),
      c.marketing.service.shopWhatsapp().catch(() => site.contacts.whatsapp.replace(/\D/g, "")),
    ]);
    return {
      valid: Boolean(info?.valid),
      purpose: info?.purpose ?? null,
      shopWhatsappDigits: digits,
    };
  },

  async webAuthResetComplete({ input }) {
    const m = await getMessages();
    const auth = container().identity.auth;
    const access = (await auth.linkInfo(input.body.token))?.purpose === "access";
    try {
      if (access) {
        const session = await auth.redeemAccessLink(input.body.token, input.body.password);
        return {
          kind: "session",
          token: session.token,
          expiresAt: session.expiresAt.toISOString(),
          secondFactorTicket: null,
          access: true,
        };
      }
      const result = await auth.resetPassword(input.body.token, input.body.password);
      if (result.kind === "second_factor") {
        return {
          kind: "second_factor",
          token: null,
          expiresAt: null,
          secondFactorTicket: issueTicket(result.userId),
          access: false,
        };
      }
      return {
        kind: "session",
        token: result.token,
        expiresAt: result.expiresAt.toISOString(),
        secondFactorTicket: null,
        access: false,
      };
    } catch (err) {
      if (access && IdentityError.is(err) && err.code === "resetExpired") {
        return Response.json({ error: m.auth.errors.accessExpired, code: "accessExpired" }, { status: 400 });
      }
      const text = await actionError(err, IdentityError);
      if (text === null) throw err;
      return Response.json({ error: text, code: IdentityError.is(err) ? err.code : "badData" }, { status: 400 });
    }
  },

  async webShelf({ user, input }) {
    const locale = await resolveLocale(input.locale);
    const m = messagesFor(locale);
    return localBooksPageData(user!.id, locale, m);
  },

  async webBookCreate({ user, input }) {
    const m = await getMessages();
    const parsed = createBookSchema(m.books.wizard.errors).safeParse(input.body);
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0].message, code: "badData" }, { status: 400 });
    const book = await container().authoring.books.start(user!.id, startBookInput(parsed.data));
    return { id: book.id };
  },

  async webBookDelete({ req, input }) {
    const { viewer } = await apiViewer(req, input.bookId);
    await container().authoring.books.delete(input.bookId, viewer);
    return { ok: true };
  },

  async webInvite({ user, input }) {
    const locale = await resolveLocale(input.locale);
    return localInviteData(user!.id, locale);
  },

  async webHealth() {
    const status = await localHealth();
    return Response.json({ ...status, time: new Date().toISOString() }, { status: 200, headers: { "cache-control": "no-store" } });
  },
};
