import { Controller, Module } from "@nestjs/common";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Output, Parsed } from "@mybook/contracts";
import { StaffResolver } from "@/modules/access/application/services";
import { Role, type RoleRepository } from "@/modules/access/domain";
import { isPhoneEmail } from "@/modules/identity";
import { CLIENT_IP_HEADER, CLIENT_IP_SIG_HEADER, signClientIp } from "@/shared/clientIp";
import { Endpoint } from "../src/core/http/endpoint";
import { Input as InputRole } from "../src/core/http/decorators";
import { STAFF_ACCESS, type StaffAccessPort, type StaffMember } from "../src/core/auth/staff";
import { AllowUnconfigured2fa, CurrentStaff, Permissions } from "../src/core/auth/staff.decorators";
import { bootTestApp, sessionOf, testUser } from "./app";

const EDGE_SECRET = "edge-ip-test-secret-0123456789";
const ROLE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const VALID_ROLE_PARAM = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const OWNER = testUser("11111111-1111-4111-8111-111111111111", { role: "admin", totpEnabledAt: new Date("2026-11-01T00:00:00Z"), totpSecret: "SECRET" });
const MANAGER = testUser("22222222-2222-4222-8222-222222222222", { role: "admin", crmRoleId: ROLE_ID, totpEnabledAt: new Date("2026-11-01T00:00:00Z"), totpSecret: "SECRET" });
const MANAGER_NO_2FA = testUser("33333333-3333-4333-8333-333333333333", { role: "admin", crmRoleId: ROLE_ID });
const DISABLED_STAFF = testUser("44444444-4444-4444-8444-444444444444", { role: "admin", staffDisabled: true });
const REGULAR_USER = testUser("55555555-5555-4555-8555-555555555555", { role: "user" });

@Controller()
class ProbeStaffController {
  @Endpoint("crmSecurity")
  security(@CurrentStaff() staff: StaffMember): Output<"crmSecurity"> {
    return {
      enabled: !!staff.user.totpEnabledAt,
      since: null,
      backupLeft: 0,
      canDisable: true,
      currentIp: staff.roleName,
      canManage: staff.context.can("settings.manage", "team.manage"),
      require2fa: false,
      ipAllowlist: "",
      team: [],
    };
  }

  @Endpoint("crmRoleDelete")
  @Permissions("team.manage")
  deleteRole(@InputRole() params: Parsed<"crmRoleDelete">): Output<"crmRoleDelete"> {
    void params;
    return { ok: true, message: null };
  }

  @Endpoint("crmSecurity2faConfirm")
  @AllowUnconfigured2fa()
  confirm2fa(@CurrentStaff() staff: StaffMember): Output<"crmSecurity2faConfirm"> {
    return { codes: [staff.user.id] };
  }
}

@Module({ controllers: [ProbeStaffController] })
class ProbeStaffModule {}

let allowlist = "";
let require2fa = false;

const salesRole = Role.restore(ROLE_ID, {
  name: "Менеджер",
  scope: "own",
  permissions: ["deals.view"],
  key: null,
});

const roleRepo: RoleRepository = {
  nextId: () => ROLE_ID,
  findById: async (id) => (id === ROLE_ID ? salesRole : null),
  findByKey: async () => null,
  assignedCount: async () => 0,
  add: async () => {},
  save: async () => {},
  remove: async () => {},
};

const resolver = new StaffResolver(
  roleRepo,
  {
    load: async () => ({ allowlist, require2fa }),
    save: async () => {},
  },
  { isPhoneEmail },
);

const realStaffAccess: StaffAccessPort = {
  async resolve(user, ip) {
    const account = {
      id: user.id,
      role: user.role,
      staffDisabled: user.staffDisabled,
      crmRoleId: user.crmRoleId,
      twoFactorEnabled: !!user.totpEnabledAt && !!user.totpSecret,
    };
    const context = await resolver.resolve(account);
    if (!context) return null;
    const gate = await resolver.gate(account, ip);
    return { context, gate };
  },
};

let app: NestFastifyApplication;
const authOf = (u: typeof OWNER) => ({ cookie: `mb_session=${sessionOf(u)}` });
const signedIp = (ip: string) => ({ [CLIENT_IP_HEADER]: ip, [CLIENT_IP_SIG_HEADER]: signClientIp(ip, EDGE_SECRET) });

beforeAll(async () => {
  ({ app } = await bootTestApp({
    users: [OWNER, MANAGER, MANAGER_NO_2FA, DISABLED_STAFF, REGULAR_USER],
    env: { NODE_ENV: "test", EDGE_IP_SECRET: EDGE_SECRET },
    extraModules: [ProbeStaffModule],
    overrides: [[STAFF_ACCESS, realStaffAccess]],
  }));
});

afterAll(() => app.close());

beforeEach(() => {
  allowlist = "";
  require2fa = false;
});

describe("бэкенд на Nest: StaffGuard, @Permissions и @CurrentStaff", () => {
  it("без входа — 401, чужой Origin на мутации — 403", async () => {
    const noAuth = await app.inject({ method: "GET", url: "/api/v1/crm/security" });
    expect(noAuth.statusCode).toBe(401);
    expect(noAuth.json().code).toBe("unauthorized");

    const badOrigin = await app.inject({
      method: "DELETE",
      url: `/api/v1/crm/roles/${VALID_ROLE_PARAM}`,
      headers: { ...authOf(OWNER), origin: "https://evil.example" },
    });
    expect(badOrigin.statusCode).toBe(403);
    expect(badOrigin.json().code).toBe("forbidden");
  });

  it("обычный пользователь и отключённый сотрудник — 403 forbidden", async () => {
    for (const u of [REGULAR_USER, DISABLED_STAFF]) {
      const res = await app.inject({ method: "GET", url: "/api/v1/crm/security", headers: authOf(u) });
      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe("forbidden");
    }
  });

  it("руководитель (без crmRoleId) получает все права и @CurrentStaff; менеджер — только по роли", async () => {
    const ownerRes = await app.inject({ method: "GET", url: "/api/v1/crm/security", headers: authOf(OWNER) });
    expect(ownerRes.statusCode).toBe(200);
    expect(ownerRes.json()).toMatchObject({ currentIp: "Руководитель", canManage: true, enabled: true });

    const mgrRes = await app.inject({ method: "GET", url: "/api/v1/crm/security", headers: authOf(MANAGER) });
    expect(mgrRes.statusCode).toBe(200);
    expect(mgrRes.json()).toMatchObject({ currentIp: "Менеджер", canManage: false, enabled: true });
  });

  it("порядок проверок как у mybook-api: не-сотрудник с кривым uuid → 403; сотрудник с кривым uuid без права → 400; с валидным uuid без права → 403; руководитель → 200", async () => {
    const userBadId = await app.inject({ method: "DELETE", url: "/api/v1/crm/roles/not-a-uuid", headers: authOf(REGULAR_USER) });
    expect(userBadId.statusCode).toBe(403);
    expect(userBadId.json().code).toBe("forbidden");

    const mgrBadId = await app.inject({ method: "DELETE", url: "/api/v1/crm/roles/not-a-uuid", headers: authOf(MANAGER) });
    expect(mgrBadId.statusCode).toBe(400);
    expect(mgrBadId.json().code).toBe("badData");

    const mgrNoPerm = await app.inject({ method: "DELETE", url: `/api/v1/crm/roles/${VALID_ROLE_PARAM}`, headers: authOf(MANAGER) });
    expect(mgrNoPerm.statusCode).toBe(403);
    expect(mgrNoPerm.json().code).toBe("forbidden");

    const ownerOk = await app.inject({ method: "DELETE", url: `/api/v1/crm/roles/${VALID_ROLE_PARAM}`, headers: authOf(OWNER) });
    expect(ownerOk.statusCode).toBe(200);
    expect(ownerOk.json()).toEqual({ ok: true, message: null });
  });

  it("IP-allowlist и подписанный EDGE_IP_SECRET: чужой IP → 403, разрешённый с верной подписью → 200", async () => {
    allowlist = "198.51.100.0/24";
    const blocked = await app.inject({
      method: "GET",
      url: "/api/v1/crm/security",
      headers: { ...authOf(OWNER), ...signedIp("203.0.113.9") },
    });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().code).toBe("forbidden");

    // Без подписи клиентский X-Real-IP игнорируется (подмена не проходит).
    const spoofed = await app.inject({
      method: "GET",
      url: "/api/v1/crm/security",
      headers: { ...authOf(OWNER), [CLIENT_IP_HEADER]: "198.51.100.7" },
    });
    expect(spoofed.statusCode).toBe(403);

    const allowed = await app.inject({
      method: "GET",
      url: "/api/v1/crm/security",
      headers: { ...authOf(OWNER), ...signedIp("198.51.100.7") },
    });
    expect(allowed.statusCode).toBe(200);
  });

  it("обязательная 2FA: без настроенной 2FA обычный маршрут → 403, но @AllowUnconfigured2fa → 200 (и всё равно 403 при чужом IP)", async () => {
    require2fa = true;

    const blockedMain = await app.inject({ method: "GET", url: "/api/v1/crm/security", headers: authOf(MANAGER_NO_2FA) });
    expect(blockedMain.statusCode).toBe(403);
    expect(blockedMain.json().code).toBe("forbidden");

    const allowedSetup = await app.inject({
      method: "POST",
      url: "/api/v1/crm/security/2fa/confirm",
      headers: authOf(MANAGER_NO_2FA),
      payload: { code: "123456" },
    });
    expect(allowedSetup.statusCode).toBe(200);
    expect(allowedSetup.json()).toEqual({ codes: [MANAGER_NO_2FA.id] });

    allowlist = "198.51.100.0/24";
    const blockedIpOn2faSetup = await app.inject({
      method: "POST",
      url: "/api/v1/crm/security/2fa/confirm",
      headers: { ...authOf(MANAGER_NO_2FA), ...signedIp("203.0.113.9") },
      payload: { code: "123456" },
    });
    expect(blockedIpOn2faSetup.statusCode).toBe(403);
  });
});
