import { Controller, Inject, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type { Output, Parsed } from "@mybook/contracts";
import { isLocale, type Locale } from "@/i18n/config";
import { errorMessageFor } from "@/i18n/domain-errors";
import { messagesFor } from "@/i18n/messages";
import { createBookSchema, startBookInput } from "@/lib/book/create-book-schema";
import type { CurrentUser as AuthUser } from "@/modules/identity";
import { IdentityError } from "@/modules/identity/domain";
import { toWebSessionUser } from "@/modules/identity/ui/session";
import type { Clock } from "@/shared/application";
import type { RateLimiter } from "@/shared/application/RateLimiter";
import { issueTicket } from "@/shared/two-factor-ticket";
import { CurrentUser } from "../../core/auth/current-user.decorator";
import { SESSION_USERS, type SessionUsers } from "../../core/auth/session";
import { APP_CONFIG, type AppConfig } from "../../core/config/app-config";
import { clientIp } from "../../core/http/client-ip";
import { Input, RequestLocale, SessionToken } from "../../core/http/decorators";
import { Endpoint } from "../../core/http/endpoint";
import { CLOCK, RATE_LIMITER } from "../../core/kernel/tokens";
import { BookAccessService } from "./book-access.guard";
import { CABINET_WEB_PORTS, IDENTITY_AUTH, type CabinetWebPorts, type IdentityAuthPort } from "./identity.tokens";

const HOUR_MS = 3_600_000;

/** Веб-кабинет API v1: сессия, регистрация, сброс пароля, полка веба, создание/удаление книги, приглашения и здоровье. */
@Controller()
export class WebCabinetController {
  constructor(
    @Inject(IDENTITY_AUTH) private readonly auth: IdentityAuthPort,
    @Inject(SESSION_USERS) private readonly sessions: SessionUsers,
    @Inject(CABINET_WEB_PORTS) private readonly web: CabinetWebPorts,
    @Inject(BookAccessService) private readonly bookAccess: BookAccessService,
    @Inject(RATE_LIMITER) private readonly limiter: RateLimiter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private resolveLocale(raw: string | undefined, reqLocale: Locale): Locale {
    return isLocale(raw) ? raw : isLocale(reqLocale) ? reqLocale : "ru";
  }

  @Endpoint("meWebSession")
  async meWebSession(@SessionToken() token: string | null): Promise<Output<"meWebSession"> | Response> {
    if (!token) return Response.json({ user: null }, { headers: { "cache-control": "no-store" } });
    const user = await this.sessions.user(token);
    return Response.json({ user: user ? toWebSessionUser(user) : null }, { headers: { "cache-control": "no-store" } });
  }

  @Endpoint("webAuthRegister")
  async webAuthRegister(
    @Req() req: FastifyRequest,
    @Input() input: Parsed<"webAuthRegister">,
    @RequestLocale() reqLocale: Locale,
  ): Promise<Output<"webAuthRegister"> | Response> {
    const locale = this.resolveLocale(input.body.locale, reqLocale);
    const e = messagesFor(locale).auth.errors;
    if (!(await this.web.syncRegistrationOpen())) {
      return Response.json({ error: e.registrationClosed, code: "registrationClosed" }, { status: 403 });
    }
    const ip = clientIp(req, this.config.edgeIpSecret);
    if (!(await this.limiter.hit(`register:${ip}`, 10, HOUR_MS))) {
      return Response.json({ error: e.tooMany, code: "tooMany" }, { status: 429 });
    }
    try {
      const { token, expiresAt } = await this.auth.register({
        name: input.body.name,
        email: input.body.email,
        password: input.body.password,
        locale,
        source: input.body.source ?? null,
      });
      return { token, expiresAt: expiresAt.toISOString() };
    } catch (err) {
      const text = errorMessageFor(messagesFor(reqLocale), err, IdentityError);
      if (text === null) throw err;
      const code = IdentityError.is(err) ? err.code : "badData";
      return Response.json({ error: text, code }, { status: code === "exists" ? 409 : 400 });
    }
  }

  @Endpoint("webAuthForgot")
  async webAuthForgot(
    @Req() req: FastifyRequest,
    @Input() input: Parsed<"webAuthForgot">,
    @RequestLocale() reqLocale: Locale,
  ): Promise<Output<"webAuthForgot"> | Response> {
    const locale = this.resolveLocale(input.body.locale, reqLocale);
    const e = messagesFor(locale).auth.errors;
    const ip = clientIp(req, this.config.edgeIpSecret);
    if (!(await this.limiter.hit(`forgot:${ip}`, 5, HOUR_MS))) {
      return Response.json({ error: e.tooManyForgot, code: "tooManyForgot" }, { status: 429 });
    }
    await this.auth.requestPasswordReset(input.body.email, locale);
    return { ok: true };
  }

  @Endpoint("webAuthResetInfo")
  async webAuthResetInfo(@Input() input: Parsed<"webAuthResetInfo">): Promise<Output<"webAuthResetInfo">> {
    const [info, digits] = await Promise.all([this.auth.linkInfo(input.token), this.web.shopWhatsappDigits()]);
    return {
      valid: Boolean(info?.valid),
      purpose: info?.purpose ?? null,
      shopWhatsappDigits: digits,
    };
  }

  @Endpoint("webAuthResetComplete")
  async webAuthResetComplete(
    @Input() input: Parsed<"webAuthResetComplete">,
    @RequestLocale() reqLocale: Locale,
  ): Promise<Output<"webAuthResetComplete"> | Response> {
    const m = messagesFor(reqLocale);
    const access = (await this.auth.linkInfo(input.body.token))?.purpose === "access";
    try {
      if (access) {
        const session = await this.auth.redeemAccessLink(input.body.token, input.body.password);
        return {
          kind: "session",
          token: session.token,
          expiresAt: session.expiresAt.toISOString(),
          secondFactorTicket: null,
          access: true,
        };
      }
      const result = await this.auth.resetPassword(input.body.token, input.body.password);
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
      const text = errorMessageFor(m, err, IdentityError);
      if (text === null) throw err;
      return Response.json({ error: text, code: IdentityError.is(err) ? err.code : "badData" }, { status: 400 });
    }
  }

  @Endpoint("webShelf")
  webShelf(
    @CurrentUser() user: AuthUser,
    @Input() input: Parsed<"webShelf">,
    @RequestLocale() reqLocale: Locale,
  ): Promise<Output<"webShelf">> {
    const locale = this.resolveLocale(input.locale, reqLocale);
    return this.web.webShelf(user.id, locale, messagesFor(locale));
  }

  @Endpoint("webBookCreate")
  async webBookCreate(
    @CurrentUser() user: AuthUser,
    @Input() input: Parsed<"webBookCreate">,
    @RequestLocale() reqLocale: Locale,
  ): Promise<Output<"webBookCreate"> | Response> {
    const m = messagesFor(reqLocale);
    const parsed = createBookSchema(m.books.wizard.errors).safeParse(input.body);
    if (!parsed.success) {
      return Response.json({ error: parsed.error.issues[0].message, code: "badData" }, { status: 400 });
    }
    const book = await this.web.startBook(user.id, startBookInput(parsed.data));
    return { id: book.id };
  }

  @Endpoint("webBookDelete")
  async webBookDelete(
    @Req() req: FastifyRequest,
    @CurrentUser() user: AuthUser,
    @Input() input: Parsed<"webBookDelete">,
  ): Promise<Output<"webBookDelete">> {
    const viewer = await this.bookAccess.viewerFor(user, clientIp(req, this.config.edgeIpSecret), input.bookId);
    await this.web.deleteBook(input.bookId, viewer);
    return { ok: true };
  }

  @Endpoint("webInvite")
  webInvite(
    @CurrentUser() user: AuthUser,
    @Input() input: Parsed<"webInvite">,
    @RequestLocale() reqLocale: Locale,
  ): Promise<Output<"webInvite">> {
    const locale = this.resolveLocale(input.locale, reqLocale);
    return this.web.inviteData(user.id, locale);
  }

  @Endpoint("webHealth")
  async webHealth(): Promise<Output<"webHealth"> | Response> {
    const status = await this.web.healthStatus();
    return Response.json(
      { ...status, time: this.clock.now().toISOString() },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  }
}
