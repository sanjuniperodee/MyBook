import { Controller, Inject, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type { Output, Parsed } from "@mybook/contracts";
import type { Locale } from "@/i18n/config";
import type { CurrentUser as AuthUser } from "@/modules/identity";
import { decodeWire, encodeWire } from "@/shared/wire";
import { CurrentUser } from "../../core/auth/current-user.decorator";
import { STAFF_ACCESS, type StaffAccessPort, type StaffMember } from "../../core/auth/staff";
import { APP_CONFIG, type AppConfig } from "../../core/config/app-config";
import { clientIp } from "../../core/http/client-ip";
import { Input, RequestLocale, SessionToken } from "../../core/http/decorators";
import { Endpoint } from "../../core/http/endpoint";
import { CRM_OPS_PORTS, type CrmOpsCallContext, type CrmOpsPorts } from "./crm-ops.tokens";

const digestOf = (err: unknown): string => {
  if (typeof err !== "object" || err === null || !("digest" in err)) return "";
  const digest = Reflect.get(err, "digest");
  return typeof digest === "string" ? digest : "";
};

/**
 * Веб-CRM (`/admin`) в API v1 (3 маршрута, `auth: "user"`): права сотрудника для каркаса (`webCrmStaff`),
 * сборщики страниц (`webCrmRead` → `runCrmOp`) и server actions (`webCrmAct` → `runCrmAction`).
 * Разрешение сотрудника и gate (`ip` / `2fa`) передаются в `runInLegacyRequest`, чтобы `assertStaff` и
 * `assertStaffShell` работали 1-в-1 с сайтом без обращений к `next/headers`.
 */
@Controller()
export class WebCrmController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(STAFF_ACCESS) private readonly staffAccess: StaffAccessPort,
    @Inject(CRM_OPS_PORTS) private readonly ports: CrmOpsPorts,
  ) {}

  private async resolveCallContext(
    req: FastifyRequest,
    user: AuthUser,
    token: string | null,
    locale: Locale,
  ): Promise<CrmOpsCallContext> {
    const ip = clientIp(req, this.config.edgeIpSecret);
    const resolved = await this.staffAccess.resolve(user, ip);
    const staff: StaffMember | null = resolved
      ? {
          user,
          roleName: resolved.context.roleName,
          roleKey: resolved.context.roleKey,
          scope: resolved.context.scope,
          permissions: resolved.context.permissions,
          isOwner: resolved.context.isOwner,
          context: resolved.context,
          gate: resolved.gate,
        }
      : null;
    return { token, user, staff, gate: staff?.gate ?? null, ip, locale };
  }

  @Endpoint("webCrmStaff")
  async staff(@CurrentUser() user: AuthUser, @Req() req: FastifyRequest): Promise<Output<"webCrmStaff">> {
    const ip = clientIp(req, this.config.edgeIpSecret);
    const resolved = await this.staffAccess.resolve(user, ip);
    if (!resolved) return { staff: null, gate: null };
    const { context, gate } = resolved;
    return {
      staff: {
        roleName: context.roleName,
        roleKey: context.roleKey,
        scope: context.scope,
        permissions: [...context.permissions],
        isOwner: context.isOwner,
      },
      gate,
    };
  }

  @Endpoint("webCrmRead")
  async read(
    @CurrentUser() user: AuthUser,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Req() req: FastifyRequest,
    @Input() input: Parsed<"webCrmRead">,
  ): Promise<Output<"webCrmRead">> {
    const call = await this.resolveCallContext(req, user, token, locale);
    const result = await this.ports.runCrmOp(call, input.op, decodeWire(input.body.args));
    return { data: await encodeWire(result) };
  }

  @Endpoint("webCrmAct")
  async act(
    @CurrentUser() user: AuthUser,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Req() req: FastifyRequest,
    @Input() input: Parsed<"webCrmAct">,
  ): Promise<Output<"webCrmAct">> {
    const call = await this.resolveCallContext(req, user, token, locale);
    try {
      const result = await this.ports.runCrmAction(call, input.op, decodeWire(input.body.args));
      return { data: await encodeWire(result) };
    } catch (err) {
      // redirect() и notFound() server actions сайт повторяет у себя.
      const digest = digestOf(err);
      if (digest.startsWith("NEXT_REDIRECT;")) return { data: null, redirect: digest.split(";")[2] };
      if (digest === "NEXT_HTTP_ERROR_FALLBACK;404" || digest === "NEXT_NOT_FOUND") return { data: null, notFound: true };
      throw err;
    }
  }
}
