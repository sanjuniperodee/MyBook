/**
 * Безопасность (2FA TOTP, резервные коды, правила команды, сброс 2FA сотруднику) и роли с правами доступа.
 * Использует те же server actions и доменные проверки, что страницы /admin/security и /admin/team/roles.
 */
import QRCode from "qrcode";
import { apiStaff } from "@/server/api";
import { can } from "@/server/access";
import { container } from "@/server/container";
import { staffActionError } from "@/server/errors";
import { trustedClientIp } from "@/server/rateLimit";
import { getSetting } from "@/modules/workspace";
import { AccessError } from "@/modules/access";
import { IdentityError } from "@/modules/identity";
import { allPermissions, permissionGroups } from "@/shared/domain/permissions";
import { staffLabel } from "@/shared/domain/staff";
import { formatDate } from "@/lib/dates";
import { deleteRoleAction, saveRoleAction } from "@/server/crm-actions/team";
import { confirmTwoFactorAction, disableTwoFactorAction, newBackupCodesAction, resetStaffTwoFactorAction, saveSecurityAction } from "@/server/crm-actions/security";
import { refused } from "./common";
import type { Handlers } from "../../app";

type SecurityRoutes =
  | "crmRoles"
  | "crmRoleSave"
  | "crmRoleDelete"
  | "crmSecurity"
  | "crmSecurity2faStart"
  | "crmSecurity2faConfirm"
  | "crmSecurity2faBackup"
  | "crmSecurity2faDisable"
  | "crmSecurityRules"
  | "crmSecurityStaffReset";

const done = (message: string | null) => ({ ok: true as const, message });

export const crmSecurityHandlers: Pick<Handlers, SecurityRoutes> = {
  async crmRoles({ req }) {
    const staff = await apiStaff(req, "team.manage");
    const rows = await container().access.queries.rolesWithMembers();
    return {
      roles: rows.map(({ role, members }) => ({
        id: role.id,
        name: role.name,
        scope: role.scope,
        permissions: role.key === "owner" ? [...allPermissions] : [...role.permissions],
        system: !!role.key,
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
  },

  async crmRoleSave({ req, input }) {
    await apiStaff(req, "team.manage");
    const form = new FormData();
    if (input.body.id) form.set("id", input.body.id);
    form.set("name", input.body.name);
    form.set("scope", input.body.scope);
    for (const p of input.body.permissions) form.append("permissions", p);
    const r = await saveRoleAction({}, form);
    if (r.error) return refused(r.error);
    return done(r.ok ?? "Роль сохранена");
  },

  async crmRoleDelete({ req, input }) {
    await apiStaff(req, "team.manage");
    try {
      await deleteRoleAction(input.roleId);
    } catch (err) {
      const msg = staffActionError(err, AccessError);
      if (msg !== null) return refused(msg);
      throw err;
    }
    return done("Роль удалена");
  },

  async crmSecurity({ req }) {
    const staff = await apiStaff(req);
    const canManage = can(staff, "settings.manage", "team.manage");
    const [require2fa, allowlist, currentIp, team] = await Promise.all([
      getSetting("security.require2fa"),
      getSetting("security.ipAllowlist"),
      trustedClientIp(),
      canManage ? container().access.queries.twoFactorStatus() : Promise.resolve([]),
    ]);
    return {
      enabled: !!staff.user.totpEnabledAt,
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
            enabled: !!u.totpEnabledAt,
            since: u.totpEnabledAt ? formatDate(u.totpEnabledAt) : null,
            disabled: u.staffDisabled,
            canReset: !!u.totpEnabledAt && u.id !== staff.user.id,
          }))
        : [],
    };
  },

  async crmSecurity2faStart({ req }) {
    const staff = await apiStaff(req);
    try {
      const { secret, otpauthUrl } = await container().identity.accounts.beginTwoFactor(staff.user.id);
      const qrDataUrl = await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 220 });
      return { secret, otpauthUrl, qrDataUrl };
    } catch (err) {
      const msg = staffActionError(err, IdentityError, AccessError);
      if (msg !== null) return refused(msg);
      throw err;
    }
  },

  async crmSecurity2faConfirm({ req, input }) {
    await apiStaff(req);
    const r = await confirmTwoFactorAction(input.body.code);
    if (!r.ok) return refused(r.message);
    return { codes: r.codes };
  },

  async crmSecurity2faBackup({ req, input }) {
    await apiStaff(req);
    const r = await newBackupCodesAction(input.body.code);
    if (!r.ok) return refused(r.message);
    return { codes: r.codes };
  },

  async crmSecurity2faDisable({ req, input }) {
    await apiStaff(req);
    const r = await disableTwoFactorAction(input.body.code);
    if (!r.ok) return refused(r.message);
    return done("2FA отключена");
  },

  async crmSecurityRules({ req, input }) {
    await apiStaff(req, "settings.manage", "team.manage");
    const [curRequire, curAllowlist] = await Promise.all([getSetting("security.require2fa"), getSetting("security.ipAllowlist")]);
    const nextRequire = input.body.require2fa ?? curRequire === "on";
    const nextAllowlist = input.body.ipAllowlist ?? curAllowlist;
    const form = new FormData();
    form.set("ipAllowlist", nextAllowlist);
    if (nextRequire) form.set("require2fa", "on");
    const r = await saveSecurityAction({}, form);
    if (r.error) return refused(r.error);
    return done(r.ok ?? "Сохранено");
  },

  async crmSecurityStaffReset({ req, input }) {
    await apiStaff(req, "team.manage");
    const r = await resetStaffTwoFactorAction(input.userId);
    if (!r.ok) return refused(r.message);
    return done("2FA сброшена");
  },
};
