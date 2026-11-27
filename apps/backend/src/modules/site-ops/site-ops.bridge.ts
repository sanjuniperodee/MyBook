import { Inject, Injectable } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { SESSION_USERS, sessionToken, type SessionUsers } from "../../core/auth/session";
import { STAFF_ACCESS, type StaffAccessPort, type StaffMember } from "../../core/auth/staff";
import { APP_CONFIG, type AppConfig } from "../../core/config/app-config";
import { clientIp } from "../../core/http/client-ip";
import { requestLocale } from "../../core/http/request";
import { buildWebRequest } from "../../core/http/web-request";
import { SITE_OPS_PORTS, type SiteOpsPorts, type SiteOpsRoute } from "./site-ops.tokens";

/**
 * Мост маршрутов 7B к обработчикам сайта. Маршруты объявлены без входа (auth: none): вебхуки и ссылки открываются без
 * сессии, а вход, права, CSRF и подписи проверяет сам обработчик — как в mybook-api. Мост лишь определяет, кто пришёл
 * (сессия → пользователь → сотрудник с правилами IP и 2FA, без отказа), и передаёт запрос с телом как пришло.
 */
@Injectable()
export class SiteOpsBridge {
  constructor(
    @Inject(SITE_OPS_PORTS) private readonly ports: SiteOpsPorts,
    @Inject(SESSION_USERS) private readonly sessions: SessionUsers,
    @Inject(STAFF_ACCESS) private readonly staffAccess: StaffAccessPort,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async run(req: FastifyRequest, route: SiteOpsRoute): Promise<Response> {
    const ip = clientIp(req, this.config.edgeIpSecret);
    const token = sessionToken(req);
    const user = token ? await this.sessions.user(token) : null;
    let staff: StaffMember | null = null;
    if (user) {
      const resolved = await this.staffAccess.resolve(user, ip);
      if (resolved) {
        const { context, gate } = resolved;
        staff = { user, roleName: context.roleName, roleKey: context.roleKey, scope: context.scope, permissions: context.permissions, isOwner: context.isOwner, context, gate };
      }
    }
    const web = await buildWebRequest(req, req.rawBody ?? Buffer.alloc(0), this.config.appUrl);
    const params = Object.fromEntries(Object.entries((req.params ?? {}) as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === "string"));
    return this.ports.handle({ user, staff, token, ip, locale: requestLocale(req) }, route, web, params);
  }
}
