import { Controller, Inject, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type { Output, Parsed } from "@mybook/contracts";
import type { Locale } from "@/i18n/config";
import { errorMessageFor } from "@/i18n/domain-errors";
import { messagesFor } from "@/i18n/messages";
import type { CurrentUser as AuthUser } from "@/modules/identity";
import { IdentityError } from "@/modules/identity/domain";
import { sessionRowToUserView, toSessionDto, toUserDto } from "@/modules/identity/ui/session";
import type { RateLimiter } from "@/shared/application/RateLimiter";
import { issueTicket, readTicket } from "@/shared/two-factor-ticket";
import { CurrentUser } from "../../core/auth/current-user.decorator";
import { APP_CONFIG, type AppConfig } from "../../core/config/app-config";
import { clientIp } from "../../core/http/client-ip";
import { Input, RequestLocale, SessionToken } from "../../core/http/decorators";
import { Endpoint } from "../../core/http/endpoint";
import { RATE_LIMITER } from "../../core/kernel/tokens";
import { IDENTITY_AUTH, type IdentityAuthPort } from "./identity.tokens";

/** Срок сессии встроенного браузера: на день работы, потом приложение попросит новую (как у /api/mobile/web-session). */
const WEB_SESSION_TTL_MS = 12 * 60 * 60_000;
const LOGIN_WINDOW_MS = 900_000;

/** Вход по API v1: пароль, второй фактор сотрудника, выход, сессия встроенного браузера и профиль текущей сессии. */
@Controller()
export class AuthController {
  constructor(
    @Inject(IDENTITY_AUTH) private readonly auth: IdentityAuthPort,
    @Inject(RATE_LIMITER) private readonly limiter: RateLimiter,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private loginFailure(err: unknown, locale: Locale): Response {
    const text = errorMessageFor(messagesFor(locale), err, IdentityError);
    if (text === null) throw err;
    return Response.json({ error: text, code: IdentityError.is(err) ? err.code : undefined }, { status: 401 });
  }

  private async tooMany(keys: [string, number][], locale: Locale): Promise<Response | null> {
    for (const [key, max] of keys) {
      if (!(await this.limiter.hit(key, max, LOGIN_WINDOW_MS))) {
        return Response.json({ error: messagesFor(locale).auth.errors.tooManyLogin, code: "tooManyLogins" }, { status: 429 });
      }
    }
    return null;
  }

  @Endpoint("authLogin")
  async login(
    @Req() req: FastifyRequest,
    @Input() input: Parsed<"authLogin">,
    @RequestLocale() locale: Locale,
  ): Promise<Output<"authLogin"> | Response> {
    const { login, password } = input.body;
    const ip = clientIp(req, this.config.edgeIpSecret);
    const limited = await this.tooMany(
      [
        [`login:${ip}`, 30],
        [`login:${login.toLowerCase()}`, 10],
      ],
      locale,
    );
    if (limited) return limited;
    try {
      const result = await this.auth.login({ login, password, locale });
      if (result.kind === "second_factor") return { session: null, secondFactorTicket: issueTicket(result.userId) };
      return { session: toSessionDto(result), secondFactorTicket: null };
    } catch (err) {
      return this.loginFailure(err, locale);
    }
  }

  @Endpoint("authSecondFactor")
  async secondFactor(
    @Req() req: FastifyRequest,
    @Input() input: Parsed<"authSecondFactor">,
    @RequestLocale() locale: Locale,
  ): Promise<Output<"authSecondFactor"> | Response> {
    const userId = readTicket(input.body.ticket);
    if (!userId) {
      return Response.json({ error: messagesFor(locale).auth.errors.twoFactorExpired, code: "twoFactorExpired" }, { status: 401 });
    }
    const ip = clientIp(req, this.config.edgeIpSecret);
    const limited = await this.tooMany(
      [
        [`2fa:${userId}`, 8],
        [`2fa-ip:${ip}`, 30],
      ],
      locale,
    );
    if (limited) return limited;
    try {
      return toSessionDto(await this.auth.completeSecondFactor(userId, input.body.code, locale));
    } catch (err) {
      return this.loginFailure(err, locale);
    }
  }

  @Endpoint("authLogout")
  async logout(@SessionToken() token: string | null): Promise<Output<"authLogout">> {
    await this.auth.logout(token ?? undefined);
    return { ok: true };
  }

  @Endpoint("authWebSession")
  async webSession(@CurrentUser() user: AuthUser): Promise<Output<"authWebSession">> {
    const { token, expiresAt } = await this.auth.openCompanionSession(user.id, WEB_SESSION_TTL_MS);
    return { cookie: "mb_session", token, expiresAt: expiresAt.toISOString(), baseUrl: this.config.appUrl };
  }

  @Endpoint("me")
  async me(@CurrentUser() user: AuthUser): Promise<Output<"me">> {
    return toUserDto(sessionRowToUserView(user));
  }
}
