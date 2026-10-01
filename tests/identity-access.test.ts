import { describe, expect, it } from "vitest";
import type { Clock, UnitOfWork } from "@/shared/application";
import type { AggregateRoot, DomainEvent } from "@/shared/domain";
import { User, totp, type PasswordResetRepository, type SessionRepository, type UserRepository } from "@/modules/identity/domain";
import { AuthService } from "@/modules/identity/application/AuthService";
import { AccountService } from "@/modules/identity/application/AccountService";
import { Role, SecurityPolicy, StaffContext, StaffMember, allPermissions, type RoleRepository, type StaffRepository } from "@/modules/access/domain";
import { RoleService, StaffResolver, TeamService } from "@/modules/access/application/services";

// ─── двойники ──────────────────────────────────────────────────────────────

class Uow implements UnitOfWork {
  events: DomainEvent[] = [];
  private t = new Set<AggregateRoot<object, string | number>>();
  async run<T>(w: () => Promise<T>) {
    const v = await w();
    for (const a of this.t) this.events.push(...a.pullEvents());
    this.t.clear();
    return v;
  }
  track(...a: AggregateRoot<object, string | number>[]) {
    a.forEach((x) => this.t.add(x));
  }
}

const fixedClock = (ms = Date.UTC(2026, 9, 1, 10)): Clock & { tick(sec: number): void } => {
  let now = ms;
  return { now: () => new Date(now), tick: (s) => (now += s * 1000) };
};

class MemUsers implements UserRepository {
  rows = new Map<string, User>();
  nextId = () => crypto.randomUUID();
  async findById(id: string) {
    const u = this.rows.get(id);
    return u ? User.restore(u.id, (({ id: _i, ...p }) => (void _i, p))(u.snapshot())) : null;
  }
  async findByEmail(e: string) {
    const u = [...this.rows.values()].find((x) => x.email === e.toLowerCase());
    return u ? this.findById(u.id) : null;
  }
  async add(u: User) {
    this.rows.set(u.id, u);
  }
  async save(u: User) {
    this.rows.set(u.id, u);
  }
}

class MemSessions implements SessionRepository {
  rows = new Map<string, { userId: string; exp: Date }>();
  async create(userId: string, h: string, exp: Date) {
    this.rows.set(h, { userId, exp });
  }
  async findUserId(h: string, now: Date) {
    const r = this.rows.get(h);
    return r && r.exp > now ? r.userId : null;
  }
  async revoke(h: string) {
    this.rows.delete(h);
  }
  async revokeAll(userId: string, except?: string | null) {
    for (const [k, v] of this.rows) if (v.userId === userId && k !== except) this.rows.delete(k);
  }
  async purgeExpired() {}
}

class MemResets implements PasswordResetRepository {
  rows = new Map<string, { userId: string; exp: Date; used: boolean }>();
  async create(h: string, userId: string, exp: Date) {
    this.rows.set(h, { userId, exp, used: false });
  }
  async findValid(h: string, now: Date) {
    const r = this.rows.get(h);
    return r && !r.used && r.exp > now ? { id: h, userId: r.userId } : null;
  }
  async markUsed(id: string) {
    this.rows.get(id)!.used = true;
  }
}

function identity(adminEmails: string[] = []) {
  const users = new MemUsers();
  const sessions = new MemSessions();
  const resets = new MemResets();
  const clock = fixedClock();
  const uow = new Uow();
  const mails: { email: string; token: string }[] = [];
  let n = 0;
  const auth = new AuthService(
    users,
    sessions,
    resets,
    { hash: async (p) => `h:${p}`, verify: async (p, h) => h === `h:${p}` },
    { newToken: () => `tok${++n}`, hash: (t) => `#${t}` },
    { encrypt: (s) => `enc:${s}`, decrypt: (s) => (s.startsWith("enc:") ? s.slice(4) : null) },
    { send: async (m) => void mails.push(m) },
    { isAdminEmail: (e) => adminEmails.includes(e) },
    uow,
    clock,
  );
  const accounts = new AccountService(users, auth, { hash: async (p) => `h:${p}`, verify: async (p, h) => h === `h:${p}` }, { encrypt: (s) => `enc:${s}`, decrypt: (s) => (s.startsWith("enc:") ? s.slice(4) : null) }, uow, clock);
  return { users, sessions, resets, clock, uow, auth, accounts, mails };
}

// ─── Identity ──────────────────────────────────────────────────────────────

describe("Identity: регистрация и вход", () => {
  it("регистрация: нормализация почты, пароль, событие, сессия", async () => {
    const { auth, uow, sessions } = identity();
    const r = await auth.register({ email: " Aliya@Mail.KZ ", name: "Алия", password: "secret123", locale: "kk", source: { source: "instagram" } });
    expect(r.user.email).toBe("aliya@mail.kz");
    expect(uow.events.map((e) => e.type)).toEqual(["identity.user_registered"]);
    expect(await sessions.findUserId(`#${r.token}`, new Date())).toBe(r.user.id);
    await expect(auth.register({ email: "aliya@mail.kz", name: "x", password: "secret123", locale: "ru", source: null })).rejects.toMatchObject({ code: "exists" });
    await expect(auth.register({ email: "bad", name: "x", password: "secret123", locale: "ru", source: null })).rejects.toMatchObject({ code: "email" });
    await expect(auth.register({ email: "a@b.kz", name: "x", password: "short", locale: "ru", source: null })).rejects.toMatchObject({ code: "password" });
  });

  it("неверный пароль и незнакомый адрес — одна и та же ошибка", async () => {
    const { auth } = identity();
    await auth.register({ email: "a@b.kz", name: "А", password: "secret123", locale: "ru", source: null });
    await expect(auth.login({ email: "a@b.kz", password: "wrong", locale: "ru" })).rejects.toMatchObject({ code: "credentials" });
    await expect(auth.login({ email: "x@b.kz", password: "secret123", locale: "ru" })).rejects.toMatchObject({ code: "credentials" });
  });

  it("вход запоминает язык", async () => {
    const { auth, users } = identity();
    const { user } = await auth.register({ email: "a@b.kz", name: "А", password: "secret123", locale: "ru", source: null });
    await auth.login({ email: "a@b.kz", password: "secret123", locale: "kk" });
    expect((await users.findById(user.id))!.locale).toBe("kk");
  });
});

describe("Identity: двухфакторный вход сотрудника", () => {
  async function staffWith2fa() {
    const ctx = identity();
    const { user } = await ctx.auth.register({ email: "boss@b.kz", name: "Босс", password: "secret123", locale: "ru", source: null });
    const u = (await ctx.users.findById(user.id))!;
    u.promoteToAdmin();
    await ctx.users.save(u);
    const { secret } = await ctx.accounts.beginTwoFactor(user.id);
    await expect(ctx.accounts.confirmTwoFactor(user.id, "000000")).rejects.toMatchObject({ code: "twoFactorCode" });
    const codes = await ctx.accounts.confirmTwoFactor(user.id, totp(secret, ctx.clock.now().getTime()));
    return { ...ctx, userId: user.id, secret, codes };
  }

  it("после пароля нужен код; тот же код повторно не проходит", async () => {
    const { auth, userId, secret, clock } = await staffWith2fa();
    const r = await auth.login({ email: "boss@b.kz", password: "secret123", locale: "ru" });
    expect(r).toEqual({ kind: "second_factor", userId });
    clock.tick(30);
    const code = totp(secret, clock.now().getTime());
    const s = await auth.completeSecondFactor(userId, code, "ru");
    expect(s.token).toBeTruthy();
    await expect(auth.completeSecondFactor(userId, code, "ru")).rejects.toMatchObject({ code: "twoFactorCode" });
  });

  it("резервный код срабатывает один раз", async () => {
    const { auth, userId, codes, users } = await staffWith2fa();
    expect(codes).toHaveLength(10);
    await auth.completeSecondFactor(userId, codes[0], "ru");
    await expect(auth.completeSecondFactor(userId, codes[0], "ru")).rejects.toMatchObject({ code: "twoFactorCode" });
    expect((await users.findById(userId))!.twoFactor.backupHashes).toHaveLength(9);
  });

  it("сброс пароля по письму не обходит второй фактор и закрывает все сессии", async () => {
    const { auth, mails, sessions, userId } = await staffWith2fa();
    await auth.requestPasswordReset("boss@b.kz", "ru");
    await auth.requestPasswordReset("nobody@b.kz", "ru");
    expect(mails).toHaveLength(1);
    const r = await auth.resetPassword(mails[0].token, "newsecret1");
    expect(r).toEqual({ kind: "second_factor", userId });
    expect([...sessions.rows.values()].filter((s) => s.userId === userId)).toHaveLength(0);
    await expect(auth.resetPassword(mails[0].token, "newsecret2")).rejects.toMatchObject({ code: "resetExpired" });
  });

  it("ADMIN_EMAILS получают права только после подтверждения почты", async () => {
    const { auth, mails, users } = identity(["owner@b.kz"]);
    const { user } = await auth.register({ email: "owner@b.kz", name: "Владелец", password: "secret123", locale: "ru", source: null });
    expect((await users.findById(user.id))!.role).toBe("user");
    await auth.requestPasswordReset("owner@b.kz", "ru");
    await auth.resetPassword(mails[0].token, "newsecret1");
    expect((await users.findById(user.id))!.role).toBe("admin");
  });

  it("смена пароля из профиля: остальные устройства выходят, текущее остаётся", async () => {
    const { auth, accounts, sessions } = identity();
    const a = await auth.register({ email: "a@b.kz", name: "А", password: "secret123", locale: "ru", source: null });
    const b = await auth.login({ email: "a@b.kz", password: "secret123", locale: "ru" });
    await expect(accounts.changePassword(a.user.id, "wrong", "newsecret1", a.token)).rejects.toMatchObject({ code: "credentials" });
    await accounts.changePassword(a.user.id, "secret123", "newsecret1", a.token);
    expect(await sessions.findUserId(`#${a.token}`, new Date())).toBe(a.user.id);
    expect(await sessions.findUserId(`#${(b as { token: string }).token}`, new Date())).toBeNull();
  });
});

// ─── Access ────────────────────────────────────────────────────────────────

class MemRoles implements RoleRepository {
  rows = new Map<string, Role>();
  assigned = new Map<string, number>();
  nextId = () => crypto.randomUUID();
  async findById(id: string) {
    return this.rows.get(id) ?? null;
  }
  async findByKey(k: string) {
    return [...this.rows.values()].find((r) => r.key === k) ?? null;
  }
  async assignedCount(id: string) {
    return this.assigned.get(id) ?? 0;
  }
  async add(r: Role) {
    this.rows.set(r.id, r);
  }
  async save(r: Role) {
    this.rows.set(r.id, r);
  }
  async remove(id: string) {
    this.rows.delete(id);
  }
}

class MemStaff implements StaffRepository {
  rows = new Map<string, StaffMember>();
  async findById(id: string) {
    return this.rows.get(id) ?? null;
  }
  async findByEmail(e: string) {
    return [...this.rows.values()].find((m) => m.email === e) ?? null;
  }
  async activeOwnersExcept(userId: string, ownerRoleId: string | null) {
    return [...this.rows.values()].filter((m) => m.id !== userId && m.isActive && (!m.roleId || m.roleId === ownerRoleId)).length;
  }
  async extensionOwner(ext: string, except: string) {
    return [...this.rows.values()].find((m) => m.id !== except && m.snapshot().extension === ext)?.email ?? null;
  }
  async save(m: StaffMember) {
    this.rows.set(m.id, m);
  }
}

function access() {
  const roles = new MemRoles();
  const staff = new MemStaff();
  const owner = Role.restore("r-owner", { name: "Руководитель", scope: "all", permissions: [], key: "owner" });
  const manager = Role.restore("r-manager", { name: "Менеджер", scope: "own", permissions: ["deals.view", "chats.view"], key: "manager" });
  roles.rows.set(owner.id, owner);
  roles.rows.set(manager.id, manager);
  const member = (id: string, roleId: string | null, email = `${id}@b.kz`) => staff.rows.set(id, StaffMember.restore(id, { email, name: "", accountRole: "admin", roleId, extension: null, disabled: false }));
  member("boss", "r-owner");
  member("anna", "r-manager");
  const audit: string[] = [];
  const created: string[] = [];
  const team = new TeamService(
    staff,
    roles,
    {
      create: async ({ email }) => {
        const id = `new-${created.length}`;
        created.push(email);
        staff.rows.set(id, StaffMember.restore(id, { email, name: "", accountRole: "user", roleId: null, extension: null, disabled: false }));
        return id;
      },
      setPassword: async () => {},
      revokeSessions: async () => {},
      resetTwoFactor: async () => {},
    },
    { generate: () => "GENERATED" },
    { record: async (e) => void audit.push(e.action) },
  );
  const ctx = (userId: string, isOwner: boolean) => new StaffContext(userId, "", isOwner ? "owner" : "manager", isOwner ? "all" : "own", new Set(isOwner ? allPermissions : ["team.manage"] as const), isOwner);
  return { roles, staff, team, audit, ctx };
}

describe("Access: роли и команда", () => {
  it("руководитель всегда со всеми правами; свою роль нельзя лишить team.manage", () => {
    const owner = Role.restore("o", { name: "Руководитель", scope: "own", permissions: [], key: "owner" });
    expect(owner.permissions).toEqual(allPermissions);
    expect(owner.scope).toBe("all");
    expect(() => owner.update({ name: "X", scope: "all", permissions: [] }, null)).toThrow(/всегда все права/);
    const custom = Role.create("c", "Стажёр", "own", ["deals.view", "bogus"]);
    expect(custom.permissions).toEqual(["deals.view"]);
    expect(() => custom.update({ name: "Стажёр", scope: "own", permissions: ["deals.view"] }, "c")).toThrow(/управлять командой/);
    expect(() => custom.assertDeletable(2)).toThrow(/назначена сотрудникам \(2\)/);
    expect(() => Role.restore("m", { name: "M", scope: "own", permissions: [], key: "manager" }).assertDeletable(0)).toThrow(/Системную/);
  });

  it("нельзя остаться без руководителя", async () => {
    const { team, ctx, staff } = access();
    staff.rows.set("boss2", StaffMember.restore("boss2", { email: "b2@b.kz", name: "", accountRole: "admin", roleId: "r-owner", extension: null, disabled: false }));
    await team.setDisabled(ctx("boss2", true), "boss", true);
    await expect(team.revoke(ctx("anna", true), "boss2")).rejects.toThrow(/хотя бы один руководитель/);
  });

  it("свои доступы меняет другой; руководителя меняет только руководитель", async () => {
    const { team, ctx } = access();
    await expect(team.setDisabled(ctx("boss", true), "boss", true)).rejects.toMatchObject({ code: "selfChange" });
    await expect(team.changeRole(ctx("anna", false), "boss", "r-manager")).rejects.toMatchObject({ code: "ownerOnly" });
    await expect(team.add(ctx("anna", false), { email: "x@b.kz", name: "", password: "", roleId: "r-owner", extension: null })).rejects.toMatchObject({ code: "ownerOnly" });
  });

  it("новый сотрудник получает сгенерированный пароль один раз; внутренний номер уникален", async () => {
    const { team, ctx, audit, staff } = access();
    const msg = await team.add(ctx("boss", true), { email: "new@b.kz", name: "", password: "", roleId: "r-manager", extension: "101" });
    expect(msg).toContain("Пароль: GENERATED");
    expect(staff.rows.get("new-0")!.isActive).toBe(true);
    await expect(team.setExtension(ctx("boss", true), "anna", "101")).rejects.toThrow(/уже у new@b\.kz/);
    await expect(team.setExtension(ctx("boss", true), "anna", "1a")).rejects.toThrow(/только цифры/);
    expect(audit).toContain("staff.create");
  });

  it("RoleService: удаление назначенной роли запрещено", async () => {
    const { roles, ctx } = access();
    const svc = new RoleService(roles, { record: async () => {} });
    const r = await svc.save(ctx("boss", true), null, { name: "Стажёр", scope: "own", permissions: ["deals.view"] });
    roles.assigned.set(r.id, 1);
    await expect(svc.delete(ctx("boss", true), r.id)).rejects.toMatchObject({ code: "roleInUse" });
  });

  it("StaffResolver: роль «только свои», маскирование контактов, владелец без роли", async () => {
    const { roles } = access();
    const resolver = new StaffResolver(roles, { load: async () => ({ allowlist: "", require2fa: false }), save: async () => {} });
    const anna = (await resolver.resolve({ id: "anna", role: "admin", staffDisabled: false, crmRoleId: "r-manager", twoFactorEnabled: false }))!;
    expect(anna.can("deals.view")).toBe(true);
    expect(anna.can("orders.view")).toBe(false);
    expect(anna.canSee("anna") && anna.canSee(null) && !anna.canSee("boss")).toBe(true);
    expect(anna.contacts({ phone: "+77011234567", email: "aliya@mail.kz" })).toEqual({ phone: "+7 701 ••• •• 67", email: "al•••@mail.kz", masked: true });
    const legacy = (await resolver.resolve({ id: "old", role: "admin", staffDisabled: false, crmRoleId: null, twoFactorEnabled: false }))!;
    expect(legacy.isOwner && legacy.can("team.manage")).toBe(true);
    expect(await resolver.resolve({ id: "c", role: "user", staffDisabled: false, crmRoleId: null, twoFactorEnabled: false })).toBeNull();
    expect(await resolver.resolve({ id: "d", role: "admin", staffDisabled: true, crmRoleId: null, twoFactorEnabled: false })).toBeNull();
  });
});

describe("Access: политика безопасности", () => {
  it("защита от самоблокировки и обязательная 2FA", () => {
    expect(() => SecurityPolicy.define({ allowlist: "10.0.0.1", require2fa: false, editorIp: "10.9.9.9", editorHasTwoFactor: true })).toThrow(/10\.9\.9\.9 не входит/);
    expect(() => SecurityPolicy.define({ allowlist: "abc", require2fa: false, editorIp: "1.1.1.1", editorHasTwoFactor: true })).toThrow(/Не похоже/);
    expect(() => SecurityPolicy.define({ allowlist: "", require2fa: true, editorIp: "1.1.1.1", editorHasTwoFactor: false })).toThrow(/Сначала включите 2FA/);
    const p = SecurityPolicy.define({ allowlist: "10.1.2.0/24 # офис", require2fa: true, editorIp: "10.1.2.5", editorHasTwoFactor: true });
    expect(p.allowlistText).toBe("10.1.2.0/24");
    expect(p.gate("10.9.9.9", true)).toBe("ip");
    expect(p.gate("10.1.2.7", false)).toBe("2fa");
    expect(p.gate("10.1.2.7", true)).toBeNull();
  });
});
