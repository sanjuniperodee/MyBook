import { Controller, Inject, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type { Output, Parsed } from "@mybook/contracts";
import { ACCOUNT_LIMITS } from "@mybook/contracts/limits";
import { isLocale, localizePath, type Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import type { CurrentUser as AuthUser } from "@/modules/identity";
import { IdentityError } from "@/modules/identity/domain";
import { buildAccountView, deletionLabels, type AccountDto, type AccountNotice } from "@/modules/identity/ui/accountView";
import type { RateLimiter } from "@/shared/application/RateLimiter";
import { CurrentUser } from "../../core/auth/current-user.decorator";
import type { StaffMember } from "../../core/auth/staff";
import { CurrentStaff } from "../../core/auth/staff.decorators";
import { APP_CONFIG, type AppConfig } from "../../core/config/app-config";
import { ApiError } from "../../core/errors/api-error";
import { clientIp } from "../../core/http/client-ip";
import { Input, RequestLocale, SessionToken } from "../../core/http/decorators";
import { Endpoint } from "../../core/http/endpoint";
import { RATE_LIMITER } from "../../core/kernel/tokens";
import { IDENTITY_ACCOUNTS, MOBILE_DEVICES, type IdentityAccountsPort, type MobileDevicesPort } from "./identity.tokens";

const SENSITIVE_WINDOW_MS = 900_000;

/** Профиль, смена пароля, напоминания, язык, push-устройства клиента и CRM, настройки приложения и удаление аккаунта. */
@Controller()
export class MeController {
  constructor(
    @Inject(IDENTITY_ACCOUNTS) private readonly accounts: IdentityAccountsPort,
    @Inject(MOBILE_DEVICES) private readonly devices: MobileDevicesPort,
    @Inject(RATE_LIMITER) private readonly limiter: RateLimiter,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private resolveLocale(raw: string | undefined, reqLocale: Locale): Locale {
    return isLocale(raw) ? raw : isLocale(reqLocale) ? reqLocale : "ru";
  }

  /** Свежий пользователь сессии (после правки профиля/напоминаний/языка возвращаем актуальное состояние из БД). */
  private async freshUser(token: string | null): Promise<AuthUser> {
    const user = token ? await this.accounts.freshUserBySession(token) : null;
    if (!user) throw new ApiError(401, "unauthorized");
    return user;
  }

  private async accountView(token: string | null, reqLocale: Locale, notice: AccountNotice = null, raw?: string): Promise<AccountDto> {
    const u = await this.freshUser(token);
    const locale = isLocale(raw) ? raw : isLocale(u.locale) ? u.locale : this.resolveLocale(undefined, reqLocale);
    return buildAccountView(u, locale, notice);
  }

  private async accountTexts(token: string | null, reqLocale: Locale) {
    const u = await this.freshUser(token);
    const locale = isLocale(u.locale) ? u.locale : this.resolveLocale(undefined, reqLocale);
    return { user: u, t: messagesFor(locale).orders.account };
  }

  @Endpoint("meAccount")
  meAccount(
    @Input() input: Parsed<"meAccount">,
    @SessionToken() token: string | null,
    @RequestLocale() reqLocale: Locale,
  ): Promise<Output<"meAccount">> {
    return this.accountView(token, reqLocale, null, input.locale);
  }

  @Endpoint("meProfileUpdate")
  async meProfileUpdate(
    @Input() input: Parsed<"meProfileUpdate">,
    @SessionToken() token: string | null,
    @RequestLocale() reqLocale: Locale,
  ): Promise<Output<"meProfileUpdate">> {
    const { user, t } = await this.accountTexts(token, reqLocale);
    const name = input.body.name.trim();
    const phone = input.body.phone.trim();
    if (!name || name.length > ACCOUNT_LIMITS.name) {
      return this.accountView(token, reqLocale, { ok: false, text: t.errors.name, field: "name" });
    }
    if (phone && !ACCOUNT_LIMITS.phone.test(phone)) {
      return this.accountView(token, reqLocale, { ok: false, text: t.errors.phone, field: "phone" });
    }
    await this.accounts.updateProfile(user.id, name, phone || null);
    return this.accountView(token, reqLocale, { ok: true, text: t.saved, field: null });
  }

  @Endpoint("mePasswordChange")
  async mePasswordChange(
    @Req() req: FastifyRequest,
    @Input() input: Parsed<"mePasswordChange">,
    @SessionToken() token: string | null,
    @RequestLocale() reqLocale: Locale,
  ): Promise<Output<"mePasswordChange">> {
    const { user, t } = await this.accountTexts(token, reqLocale);
    const ip = clientIp(req, this.config.edgeIpSecret);
    if (!(await this.limiter.hit(`pwd:${user.id}:${ip}`, 10, SENSITIVE_WINDOW_MS))) {
      return this.accountView(token, reqLocale, { ok: false, text: t.errors.tooMany, field: null });
    }
    try {
      await this.accounts.changePassword(user.id, input.body.current, input.body.next, token);
    } catch (err) {
      if (IdentityError.is(err)) {
        return this.accountView(
          token,
          reqLocale,
          err.code === "password"
            ? { ok: false, text: t.errors.short, field: "next" }
            : { ok: false, text: t.errors.wrong, field: "current" },
        );
      }
      throw err;
    }
    return this.accountView(token, reqLocale, { ok: true, text: t.changed, field: null });
  }

  @Endpoint("meRemindersSet")
  async meRemindersSet(
    @Input() input: Parsed<"meRemindersSet">,
    @SessionToken() token: string | null,
    @RequestLocale() reqLocale: Locale,
  ): Promise<Output<"meRemindersSet">> {
    const { user, t } = await this.accountTexts(token, reqLocale);
    await this.accounts.setReminders(user.id, input.body.on);
    return this.accountView(token, reqLocale, {
      ok: true,
      text: input.body.on ? t.notifications.savedOn : t.notifications.savedOff,
      field: null,
    });
  }

  @Endpoint("meLocaleSet")
  async meLocaleSet(
    @Input() input: Parsed<"meLocaleSet">,
    @SessionToken() token: string | null,
    @RequestLocale() reqLocale: Locale,
  ): Promise<Output<"meLocaleSet">> {
    const { user } = await this.accountTexts(token, reqLocale);
    if (user.locale !== input.body.locale) {
      await this.accounts.setLocale(user.id, input.body.locale);
    }
    return this.accountView(token, reqLocale, null, input.body.locale);
  }

  @Endpoint("meDevicePut")
  async meDevicePut(@CurrentUser() user: AuthUser, @Input() input: Parsed<"meDevicePut">): Promise<Output<"meDevicePut">> {
    await this.devices.register(user.id, { ...input.body, app: "client" });
    return { ok: true, serverReady: this.devices.pushReady(input.body.platform) };
  }

  @Endpoint("meDeviceDelete")
  async meDeviceDelete(@CurrentUser() user: AuthUser, @Input() input: Parsed<"meDeviceDelete">): Promise<Output<"meDeviceDelete">> {
    await this.devices.forget(user.id, input.body.token);
    return { ok: true };
  }

  @Endpoint("crmPushConfig")
  async crmPushConfig(): Promise<Output<"crmPushConfig">> {
    return {
      ios: this.devices.pushReady("ios"),
      android: this.devices.androidClientOptions(),
    };
  }

  @Endpoint("crmDevicePut")
  async crmDevicePut(@CurrentStaff() staff: StaffMember, @Input() input: Parsed<"crmDevicePut">): Promise<Output<"crmDevicePut">> {
    await this.devices.register(staff.user.id, { ...input.body, app: "crm" });
    return { ok: true, serverReady: this.devices.pushReady(input.body.platform) };
  }

  @Endpoint("crmDeviceDelete")
  async crmDeviceDelete(@CurrentStaff() staff: StaffMember, @Input() input: Parsed<"crmDeviceDelete">): Promise<Output<"crmDeviceDelete">> {
    await this.devices.forget(staff.user.id, input.body.token);
    return { ok: true };
  }

  @Endpoint("appConfig")
  async appConfig(@Input() input: Parsed<"appConfig">, @RequestLocale() reqLocale: Locale): Promise<Output<"appConfig">> {
    const locale = this.resolveLocale(input.locale, reqLocale);
    const legal = messagesFor(locale).legal;
    return {
      privacyUrl: `${this.config.appUrl}${localizePath("/privacy", locale)}`,
      termsUrl: `${this.config.appUrl}${localizePath("/offer", locale)}`,
      labels: { privacy: legal.privacy.title, terms: legal.offer.title },
    };
  }

  @Endpoint("meDeletionInfo")
  async meDeletionInfo(
    @CurrentUser() user: AuthUser,
    @Input() input: Parsed<"meDeletionInfo">,
    @RequestLocale() reqLocale: Locale,
  ): Promise<Output<"meDeletionInfo">> {
    const locale = this.resolveLocale(input.locale, reqLocale);
    return {
      ...(await this.accounts.deletionPreview(user.id, locale)),
      labels: deletionLabels(locale),
    };
  }

  /** Сотрудник себя не удаляет (его отключает руководитель); неверный пароль — 400, чтобы приложение не сочло это выходом. */
  @Endpoint("meDelete")
  async meDelete(
    @Req() req: FastifyRequest,
    @CurrentUser() user: AuthUser,
    @Input() input: Parsed<"meDelete">,
    @RequestLocale() reqLocale: Locale,
  ): Promise<Output<"meDelete"> | Response> {
    if (user.role !== "user") throw new ApiError(403, "staffAccount");
    const locale = this.resolveLocale(input.locale, reqLocale);
    const ip = clientIp(req, this.config.edgeIpSecret);
    if (!(await this.limiter.hit(`del:${user.id}:${ip}`, 10, SENSITIVE_WINDOW_MS))) {
      return Response.json({ error: messagesFor(locale).orders.account.errors.tooMany, code: "tooMany" }, { status: 429 });
    }
    try {
      return {
        ok: true,
        ...(await this.accounts.deleteClientAccount(user.id, input.body.password, locale)),
        labels: deletionLabels(locale),
      };
    } catch (err) {
      if (IdentityError.is(err)) throw new ApiError(400, "wrongPassword");
      throw err;
    }
  }
}
