import { Controller, Inject, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { admin } from "@/i18n/admin";
import type { Locale } from "@/i18n/config";
import type { StaffMember } from "../../core/auth/staff";
import { CurrentStaff, Permissions } from "../../core/auth/staff.decorators";
import { APP_CONFIG, type AppConfig } from "../../core/config/app-config";
import { ApiError } from "../../core/errors/api-error";
import { RequestLocale, SessionToken } from "../../core/http/decorators";
import { SiteRoute } from "../../core/http/site-route";
import {
  looksLikeApk,
  MOBILE_APK_MAX_BYTES,
  MOBILE_APK_NAME,
  readApkMultipart,
  readUdidRawBody,
  searchParamsOf,
  siteCallContext,
} from "./crm-mobile-site.helpers";
import { CRM_MOBILE_SITE_PORTS, type CrmMobileSitePorts } from "./crm-mobile-site.tokens";

const MAX_UDID_BODY_BYTES = 64 * 1024;

/**
 * Раздача и регистрация мобильных приложений CRM (6 маршрутов сайта, 7 HTTP-обработчиков):
 * Android APK (`/api/admin/mobile-apk`) и iPhone Ad Hoc (`/api/admin/ios-app/*`, `/api/ios-app/*`).
 */
@Controller()
export class MobileAppDistSiteController {
  constructor(
    @Inject(CRM_MOBILE_SITE_PORTS) private readonly ports: CrmMobileSitePorts,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Скачать APK продажника — любому сотруднику. */
  @SiteRoute("GET", "/api/admin/mobile-apk", { auth: "staff" })
  async downloadApk(): Promise<Response> {
    if (!(await this.ports.hasMobileApk())) throw new ApiError(404, "notFound");
    const data = await this.ports.readMobileApk();
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": "application/vnd.android.package-archive",
        "Content-Disposition": `attachment; filename="${MOBILE_APK_NAME}"`,
        "Content-Length": String(data.length),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  /** Загрузить новый APK (поле `apk`, multipart) — только с правом `settings.manage`. */
  @SiteRoute("POST", "/api/admin/mobile-apk", { auth: "staff" })
  @Permissions("settings.manage")
  async uploadApk(
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
  ): Promise<Response> {
    const file = await readApkMultipart(req);
    if (!file.found || (!file.tooLarge && file.data.length === 0)) {
      return Response.json({ error: "Выберите APK-файл" }, { status: 400 });
    }
    if (!file.name.toLowerCase().endsWith(".apk")) {
      return Response.json({ error: "Нужен файл с расширением .apk" }, { status: 400 });
    }
    if (file.tooLarge || file.data.length > MOBILE_APK_MAX_BYTES) {
      return Response.json({ error: "Файл больше 150 МБ" }, { status: 400 });
    }
    if (!looksLikeApk(file.data)) {
      return Response.json({ error: "Это не APK: файл повреждён или не тот" }, { status: 400 });
    }
    const ctx = siteCallContext(req, this.config, staff, token, locale);
    await this.ports.saveMobileApk(ctx, file.data, file.name);
    return Response.json({ ok: true, size: file.data.length });
  }

  /** Профиль регистрации iPhone (`.mobileconfig`, 24 часа на установку). */
  @SiteRoute("GET", "/api/admin/ios-app/enroll", { auth: "staff" })
  iosEnroll(@CurrentStaff() staff: StaffMember): Response {
    const profile = this.ports.iosEnrollProfile(staff.user.id);
    return new Response(profile, {
      headers: {
        "Content-Type": "application/x-apple-aspen-config",
        "Content-Disposition": 'attachment; filename="crm-iphone.mobileconfig"',
        "Cache-Control": "private, no-store",
      },
    });
  }

  /** Телефоны сотрудника и готовность Ad Hoc сборки для них. */
  @SiteRoute("GET", "/api/admin/ios-app/status", { auth: "staff" })
  async iosStatus(@CurrentStaff() staff: StaffMember): Promise<Response> {
    return Response.json(await this.ports.iosStatus(staff.user.id), {
      headers: { "Cache-Control": "no-store" },
    });
  }

  /** Файл iPhone-версии (`.ipa`) для установщика iOS по подписанной ссылке `t`. */
  @SiteRoute("GET", "/api/ios-app/ipa", { auth: "none" })
  async iosIpa(@Req() req: FastifyRequest): Promise<Response> {
    if (!this.ports.readIosToken(searchParamsOf(req).get("t"), "install")) {
      return new Response(admin.iosLinkExpired, { status: 403 });
    }
    if (!(await this.ports.iosBuild())) {
      return new Response(admin.iosNoBuild, { status: 404 });
    }
    const data = await this.ports.readIosIpa();
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(data.length),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  /** Манифест установки iPhone-версии (`itms-services`, XML plist) по подписанной ссылке `t`. */
  @SiteRoute("GET", "/api/ios-app/manifest", { auth: "none" })
  async iosManifest(@Req() req: FastifyRequest): Promise<Response> {
    const token = searchParamsOf(req).get("t");
    if (!this.ports.readIosToken(token, "install")) {
      return new Response(admin.iosLinkExpired, { status: 403 });
    }
    const build = await this.ports.iosBuild();
    if (!build) {
      return new Response(admin.iosNoBuild, { status: 404 });
    }
    const ipa = `${this.config.appUrl.replace(/\/+$/, "")}/api/ios-app/ipa?t=${encodeURIComponent(token ?? "")}`;
    return new Response(this.ports.installManifest(ipa, build), {
      headers: { "Content-Type": "text/xml; charset=utf-8", "Cache-Control": "private, no-store" },
    });
  }

  /**
   * Ответ iPhone после установки профиля регистрации: подписанный PKCS#7 plist с UDID.
   * Фоновая переподпись запускается без `next/server` `after()`; iOS получает редирект 301.
   */
  @SiteRoute("POST", "/api/ios-app/udid", { auth: "none" })
  async iosUdid(@Req() req: FastifyRequest): Promise<Response> {
    const back = `${this.config.appUrl.replace(/\/+$/, "")}/admin/app`;
    const userId = this.ports.readIosToken(searchParamsOf(req).get("t"), "enroll");
    if (!userId) return Response.redirect(`${back}?ios=expired`, 301);
    const body = await readUdidRawBody(req, MAX_UDID_BODY_BYTES);
    const device = body ? this.ports.parseIosDevice(body) : null;
    if (!device) return Response.redirect(`${back}?ios=failed`, 301);
    await this.ports.saveIosDevice(userId, device);
    this.ports.scheduleIosResign();
    return Response.redirect(`${back}?ios=registered`, 301);
  }
}
