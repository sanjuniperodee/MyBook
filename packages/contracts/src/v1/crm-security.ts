/**
 * API v1 — безопасность (2FA TOTP, резервные коды, правила команды, сброс 2FA сотруднику) и роли с правами доступа.
 * Те же проверки и действия, что на страницах /admin/security и /admin/team/roles.
 */
import { z } from "zod";
import { route, schemas, uuid, type RouteDef } from "./core";
import { Done } from "./crm";

// ─── Роли и права ─────────────────────────────────────────────────────────────────────────────────────────────────

export const CrmPermissionItem = z
  .object({
    key: z.string(),
    label: z.string(),
  })
  .register(schemas, { id: "CrmPermissionItem" });

export const CrmPermissionGroup = z
  .object({
    label: z.string(),
    items: z.array(CrmPermissionItem),
  })
  .register(schemas, { id: "CrmPermissionGroup" });

export const CrmRole = z
  .object({
    id: uuid,
    name: z.string(),
    scope: z.enum(["all", "own"]),
    permissions: z.array(z.string()),
    /** Системная роль — нельзя удалить. */
    system: z.boolean(),
    /** Роль руководителя — всегда все права, менять нельзя. */
    locked: z.boolean(),
    members: z.number().int(),
    isOwnRole: z.boolean(),
  })
  .register(schemas, { id: "CrmRole" });

export const CrmRoles = z
  .object({
    roles: z.array(CrmRole),
    groups: z.array(CrmPermissionGroup),
    totalPermissions: z.number().int(),
  })
  .register(schemas, { id: "CrmRoles" });

export const CrmRoleSaveBody = z
  .object({
    id: uuid.nullable().optional(),
    name: z.string().trim().min(2).max(60),
    scope: z.enum(["all", "own"]),
    permissions: z.array(z.string().max(60)),
  })
  .strict()
  .register(schemas, { id: "CrmRoleSaveBody" });

// ─── Безопасность и 2FA ───────────────────────────────────────────────────────────────────────────────────────────

export const CrmSecurityTeamMember = z
  .object({
    id: uuid,
    name: z.string(),
    email: z.string(),
    enabled: z.boolean(),
    since: z.string().nullable(),
    disabled: z.boolean(),
    canReset: z.boolean(),
  })
  .register(schemas, { id: "CrmSecurityTeamMember" });

export const CrmSecurity = z
  .object({
    /** Включена ли 2FA у текущего сотрудника. */
    enabled: z.boolean(),
    /** Дата включения 2FA (текстом, как на сайте). */
    since: z.string().nullable(),
    /** Сколько резервных кодов осталось. */
    backupLeft: z.number().int(),
    /** Можно ли отключить свою 2FA (нельзя, если руководитель сделал 2FA обязательной и сотрудник не владелец). */
    canDisable: z.boolean(),
    /** Текущий IP-адрес запроса. */
    currentIp: z.string(),
    /** Может ли управлять правилами команды (settings.manage + team.manage). */
    canManage: z.boolean(),
    /** Обязательная 2FA для всех сотрудников. */
    require2fa: z.boolean(),
    /** Список разрешённых IP/подсетей (только при canManage). */
    ipAllowlist: z.string(),
    /** Статус 2FA у сотрудников (только при canManage). */
    team: z.array(CrmSecurityTeamMember),
  })
  .register(schemas, { id: "CrmSecurity" });

export const CrmTwoFactorStart = z
  .object({
    /** Ключ для ручного ввода в приложение-аутентификатор. */
    secret: z.string(),
    /** Ссылка otpauth://totp/... для открытия в аутентификаторе. */
    otpauthUrl: z.string(),
    /** QR-код в формате data:image/png;base64,... */
    qrDataUrl: z.string(),
  })
  .register(schemas, { id: "CrmTwoFactorStart" });

export const CrmTwoFactorCodeBody = z
  .object({
    code: z.string().trim().min(1).max(12),
  })
  .strict()
  .register(schemas, { id: "CrmTwoFactorCodeBody" });

export const CrmTwoFactorCodes = z
  .object({
    /** Резервные коды — показываются один раз. */
    codes: z.array(z.string()),
  })
  .register(schemas, { id: "CrmTwoFactorCodes" });

export const CrmSecurityRulesBody = z
  .object({
    require2fa: z.boolean().optional(),
    ipAllowlist: z.string().max(4000).optional(),
  })
  .strict()
  .register(schemas, { id: "CrmSecurityRulesBody" });

const RoleParams = z.object({ roleId: uuid });
const UserParams = z.object({ userId: uuid });

export const crmSecurityRoutes = {
  crmRoles: route({
    method: "GET",
    path: "/api/v1/crm/roles",
    auth: "staff",
    tag: "crm",
    summary: "Роли и матрица прав CRM (право team.manage)",
    response: CrmRoles,
  }),
  crmRoleSave: route({
    method: "POST",
    path: "/api/v1/crm/roles",
    auth: "staff",
    tag: "crm",
    summary: "Создать или изменить роль и её права (право team.manage)",
    body: CrmRoleSaveBody,
    response: Done,
  }),
  crmRoleDelete: route({
    method: "DELETE",
    path: "/api/v1/crm/roles/{roleId}",
    auth: "staff",
    tag: "crm",
    summary: "Удалить пользовательскую роль (право team.manage)",
    params: RoleParams,
    response: Done,
  }),
  crmSecurity: route({
    method: "GET",
    path: "/api/v1/crm/security",
    auth: "staff",
    tag: "crm",
    summary: "Безопасность: статус 2FA сотрудника, правила команды и 2FA сотрудников",
    response: CrmSecurity,
  }),
  crmSecurity2faStart: route({
    method: "POST",
    path: "/api/v1/crm/security/2fa/start",
    auth: "staff",
    tag: "crm",
    summary: "Начать настройку 2FA: выпустить секрет, otpauth URI и QR-код",
    response: CrmTwoFactorStart,
  }),
  crmSecurity2faConfirm: route({
    method: "POST",
    path: "/api/v1/crm/security/2fa/confirm",
    auth: "staff",
    tag: "crm",
    summary: "Подтвердить включение 2FA по 6-значному коду и получить резервные коды",
    body: CrmTwoFactorCodeBody,
    response: CrmTwoFactorCodes,
  }),
  crmSecurity2faBackup: route({
    method: "POST",
    path: "/api/v1/crm/security/2fa/backup",
    auth: "staff",
    tag: "crm",
    summary: "Выпустить новые резервные коды 2FA (с проверкой текущего кода)",
    body: CrmTwoFactorCodeBody,
    response: CrmTwoFactorCodes,
  }),
  crmSecurity2faDisable: route({
    method: "POST",
    path: "/api/v1/crm/security/2fa/disable",
    auth: "staff",
    tag: "crm",
    summary: "Отключить свою 2FA (с проверкой текущего кода или резервного кода)",
    body: CrmTwoFactorCodeBody,
    response: Done,
  }),
  crmSecurityRules: route({
    method: "PATCH",
    path: "/api/v1/crm/security/rules",
    auth: "staff",
    tag: "crm",
    summary: "Правила безопасности команды: обязательная 2FA и разрешённые IP (settings.manage + team.manage)",
    body: CrmSecurityRulesBody,
    response: Done,
  }),
  crmSecurityStaffReset: route({
    method: "POST",
    path: "/api/v1/crm/security/staff/{userId}/reset-2fa",
    auth: "staff",
    tag: "crm",
    summary: "Сбросить 2FA другому сотруднику (право team.manage)",
    params: UserParams,
    response: Done,
  }),
} satisfies Record<string, RouteDef>;
