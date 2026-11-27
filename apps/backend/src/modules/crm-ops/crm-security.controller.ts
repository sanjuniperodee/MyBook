import { Controller, Inject, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import QRCode from "qrcode";
import type { Output, Parsed } from "@mybook/contracts";
import type { Locale } from "@/i18n/config";
import { staffErrorMessageFor } from "@/i18n/domain-errors";
import { formatDate } from "@/lib/dates";
import { AccessError } from "@/modules/access/domain";
import { IdentityError } from "@/modules/identity/domain";
import { allPermissions, permissionGroups } from "@/shared/domain/permissions";
import { staffLabel } from "@/shared/domain/staff";
import type { StaffMember } from "../../core/auth/staff";
import { AllowUnconfigured2fa, CurrentStaff, Permissions } from "../../core/auth/staff.decorators";
import { APP_CONFIG, type AppConfig } from "../../core/config/app-config";
import { clientIp } from "../../core/http/client-ip";
import { Input, RequestLocale, SessionToken } from "../../core/http/decorators";
import { Endpoint } from "../../core/http/endpoint";
import { CRM_OPS_PORTS, crmOpsCall, refused, type CrmOpsPorts } from "./crm-ops.tokens";

const done = (message: string | null) => ({ ok: true as const, message });

/**
 * Роли с правами доступа (3 маршрута) и безопасность / 2FA (7 маршрутов) в API v1 CRM.
 * Маршруты просмотра статуса и первичной настройки 2FA (`crmSecurity`, `crmSecurity2faStart`, `crmSecurity2faConfirm`)
 * помечены `@AllowUnconfigured2fa()`, чтобы сотрудник при включённой обязательной 2FA (`gate === "2fa"`) мог её настроить;
 * вход с чужого IP по-прежнему блокируется StaffGuard.
 */
@Controller()
export class CrmSecurityController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(CRM_OPS_PORTS) private readonly ports: CrmOpsPorts,
  ) {}

  @Endpoint("crmRoles")
  @Permissions("team.manage")
  async roles(@CurrentStaff() staff: StaffMember): Promise<Output<"crmRoles">> {
    const rows = await this.ports.rolesWithMembers();
    return {
      roles: rows.map(({ role, members }) => ({
        id: role.id,
        name: role.name,
        scope: role.scope,
        permissions: role.key === "owner" ? [...allPermissions] : [...role.permissions],
        system: Boolean(role.key),
        locked: role.key === "owner",
        members,
        isOwnRole: staff.user.crmRoleId === role.id,
      })),
      groups: permissionGroups.map((g) => ({
        label: g.label,
        items: g.items.map(([key, label]) => ({ key, label })),
      })),
      totalPermissions: allPermissions.length,
    };
  }

  @Endpoint("crmRoleSave")
  @Permissions("team.manage")
  async roleSave(
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Req() req: FastifyRequest,
    @Input() input: Parsed<"crmRoleSave">,
  ): Promise<Output<"crmRoleSave"> | Response> {
    const form = new FormData();
    if (input.body.id) form.set("id", input.body.id);
    form.set("name", input.body.name);
    form.set("scope", input.body.scope);
    for (const p of input.body.permissions) form.append("permissions", p);
    const call = crmOpsCall(req, this.config, { staff, token, locale });
    const r = await this.ports.saveRole(call, form);
    if (r.error) return refused(r.error);
    return done(r.ok ?? "Роль сохранена");
  }

  @Endpoint("crmRoleDelete")
  @Permissions("team.manage")
  async roleDelete(
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Req() req: FastifyRequest,
    @Input() input: Parsed<"crmRoleDelete">,
  ): Promise<Output<"crmRoleDelete"> | Response> {
    const call = crmOpsCall(req, this.config, { staff, token, locale });
    try {
      await this.ports.deleteRole(call, input.roleId);
    } catch (err) {
      const msg = staffErrorMessageFor(err, AccessError);
      if (msg !== null) return refused(msg);
      throw err;
    }
    return done("Роль удалена");
  }

  @Endpoint("crmSecurity")
  @AllowUnconfigured2fa()
  async security(@CurrentStaff() staff: StaffMember, @Req() req: FastifyRequest): Promise<Output<"crmSecurity">> {
    const canManage = staff.context.can("settings.manage", "team.manage");
    const currentIp = clientIp(req, this.config.edgeIpSecret);
    const [require2fa, allowlist, team] = await Promise.all([
      this.ports.getSetting("security.require2fa"),
      this.ports.getSetting("security.ipAllowlist"),
      canManage ? this.ports.twoFactorStatus() : Promise.resolve([]),
    ]);
    return {
      enabled: Boolean(staff.user.totpEnabledAt),
      since: staff.user.totpEnabledAt ? formatDate(staff.user.totpEnabledAt) : null,
      backupLeft: staff.user.totpBackup.length,
      canDisable: require2fa !== "on" || staff.isOwner,
      currentIp,
      canManage,
      require2fa: require2fa === "on",
      ipAllowlist: canManage ? allowlist : "",
      team: canManage
        ? team.map((u) => ({
            id: u.id,
            name: staffLabel({ name: u.name, email: u.email }),
            email: u.email,
            enabled: Boolean(u.totpEnabledAt),
            since: u.totpEnabledAt ? formatDate(u.totpEnabledAt) : null,
            disabled: u.staffDisabled,
            canReset: Boolean(u.totpEnabledAt) && u.id !== staff.user.id,
          }))
        : [],
    };
  }

  @Endpoint("crmSecurity2faStart")
  @AllowUnconfigured2fa()
  async startTwoFactor(@CurrentStaff() staff: StaffMember): Promise<Output<"crmSecurity2faStart"> | Response> {
    try {
      const { secret, otpauthUrl } = await this.ports.beginTwoFactor(staff.user.id);
      const qrDataUrl = await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 220 });
      return { secret, otpauthUrl, qrDataUrl };
    } catch (err) {
      const msg = staffErrorMessageFor(err, IdentityError, AccessError);
      if (msg !== null) return refused(msg);
      throw err;
    }
  }

  @Endpoint("crmSecurity2faConfirm")
  @AllowUnconfigured2fa()
  async confirmTwoFactor(
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Req() req: FastifyRequest,
    @Input() input: Parsed<"crmSecurity2faConfirm">,
  ): Promise<Output<"crmSecurity2faConfirm"> | Response> {
    const call = crmOpsCall(req, this.config, { staff, token, locale });
    const r = await this.ports.confirmTwoFactor(call, input.body.code);
    if (!r.ok) return refused(r.message);
    return { codes: r.codes };
  }

  @Endpoint("crmSecurity2faBackup")
  async backupCodes(
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Req() req: FastifyRequest,
    @Input() input: Parsed<"crmSecurity2faBackup">,
  ): Promise<Output<"crmSecurity2faBackup"> | Response> {
    const call = crmOpsCall(req, this.config, { staff, token, locale });
    const r = await this.ports.newBackupCodes(call, input.body.code);
    if (!r.ok) return refused(r.message);
    return { codes: r.codes };
  }

  @Endpoint("crmSecurity2faDisable")
  async disableTwoFactor(
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Req() req: FastifyRequest,
    @Input() input: Parsed<"crmSecurity2faDisable">,
  ): Promise<Output<"crmSecurity2faDisable"> | Response> {
    const call = crmOpsCall(req, this.config, { staff, token, locale });
    const r = await this.ports.disableTwoFactor(call, input.body.code);
    if (!r.ok) return refused(r.message);
    return done("2FA отключена");
  }

  @Endpoint("crmSecurityRules")
  @Permissions("settings.manage", "team.manage")
  async saveRules(
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Req() req: FastifyRequest,
    @Input() input: Parsed<"crmSecurityRules">,
  ): Promise<Output<"crmSecurityRules"> | Response> {
    const [curRequire, curAllowlist] = await Promise.all([
      this.ports.getSetting("security.require2fa"),
      this.ports.getSetting("security.ipAllowlist"),
    ]);
    const nextRequire = input.body.require2fa ?? curRequire === "on";
    const nextAllowlist = input.body.ipAllowlist ?? curAllowlist;
    const form = new FormData();
    form.set("ipAllowlist", nextAllowlist);
    if (nextRequire) form.set("require2fa", "on");
    const call = crmOpsCall(req, this.config, { staff, token, locale });
    const r = await this.ports.saveSecurity(call, form);
    if (r.error) return refused(r.error);
    return done(r.ok ?? "Сохранено");
  }

  @Endpoint("crmSecurityStaffReset")
  @Permissions("team.manage")
  async resetStaffTwoFactor(
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Req() req: FastifyRequest,
    @Input() input: Parsed<"crmSecurityStaffReset">,
  ): Promise<Output<"crmSecurityStaffReset"> | Response> {
    const call = crmOpsCall(req, this.config, { staff, token, locale });
    const r = await this.ports.resetStaffTwoFactor(call, input.userId);
    if (!r.ok) return refused(r.message);
    return done("2FA сброшена");
  }
}
