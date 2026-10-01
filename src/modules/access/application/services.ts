import { AccessError, Role, SecurityPolicy, StaffContext, allPermissions, type RoleRepository, type RoleScope, type StaffGate, type StaffMember, type StaffRepository } from "../domain";
import type { AccountGateway, AuditLog, PasswordGenerator, SecuritySettingsStore } from "./ports";

/** Аккаунт, для которого собираем контекст сотрудника. */
export interface StaffAccount {
  id: string;
  role: "user" | "admin";
  staffDisabled: boolean;
  crmRoleId: string | null;
  twoFactorEnabled: boolean;
}

/** Собирает контекст прав сотрудника и проверяет правила безопасности. */
export class StaffResolver {
  constructor(
    private readonly roles: RoleRepository,
    private readonly security: SecuritySettingsStore,
  ) {}

  async resolve(account: StaffAccount): Promise<StaffContext | null> {
    if (account.role !== "admin" || account.staffDisabled) return null;
    const role = account.crmRoleId ? await this.roles.findById(account.crmRoleId) : null;
    // Сотрудник без роли — владелец (аккаунты, созданные до появления ролей).
    if (!role) return new StaffContext(account.id, "Руководитель", "owner", "all", new Set(allPermissions), true);
    return new StaffContext(account.id, role.name, role.key, role.scope, new Set(role.permissions), role.isOwner);
  }

  async policy(): Promise<SecurityPolicy> {
    const s = await this.security.load();
    return SecurityPolicy.fromSettings(s.allowlist, s.require2fa);
  }

  async gate(account: StaffAccount, ip: string): Promise<StaffGate> {
    return (await this.policy()).gate(ip, account.twoFactorEnabled);
  }
}

/** Команда: доступы сотрудников. Правило «должен остаться хотя бы один руководитель» — здесь. */
export class TeamService {
  constructor(
    private readonly staff: StaffRepository,
    private readonly roles: RoleRepository,
    private readonly accounts: AccountGateway,
    private readonly passwords: PasswordGenerator,
    private readonly audit: AuditLog,
  ) {}

  private async ownerRoleId() {
    return (await this.roles.findByKey("owner"))?.id ?? null;
  }

  private async isOwner(m: StaffMember) {
    return !m.roleId || m.roleId === (await this.ownerRoleId());
  }

  private async assertNotLastOwner(m: StaffMember) {
    if ((await this.isOwner(m)) && (await this.staff.activeOwnersExcept(m.id, await this.ownerRoleId())) === 0) throw new AccessError("lastOwner", "Должен остаться хотя бы один руководитель");
  }

  /** Менять доступы можно чужие; руководителя меняет только руководитель. */
  private async loadMember(actor: StaffContext, userId: string) {
    const m = await this.staff.findById(userId);
    if (!m?.isStaff) throw new AccessError("staffNotFound", "Сотрудник не найден");
    if (m.id === actor.userId) throw new AccessError("selfChange", "Свои доступы меняет другой руководитель");
    if ((await this.isOwner(m)) && !actor.isOwner) throw new AccessError("ownerOnly", "Менять доступы руководителя может только руководитель");
    return m;
  }

  private async loadRole(actor: StaffContext, roleId: string) {
    const role = await this.roles.findById(roleId);
    if (!role) throw new AccessError("roleNotFound", "Роль не найдена");
    if (role.isOwner && !actor.isOwner) throw new AccessError("ownerOnly", "Назначить руководителя может только руководитель");
    return role;
  }

  /** Новый сотрудник или доступ существующему аккаунту. Пароль показываем один раз. */
  async add(actor: StaffContext, input: { email: string; name: string; password: string; roleId: string; extension: string | null }): Promise<string> {
    const role = await this.loadRole(actor, input.roleId);
    if (input.password && input.password.length < 8) throw new AccessError("forbidden", "Пароль — минимум 8 символов");
    const existing = await this.staff.findByEmail(input.email);
    if (existing) {
      if (existing.id === actor.userId) throw new AccessError("selfChange", "Свою роль меняет другой руководитель");
      existing.grant(role.id, input.extension);
      await this.staff.save(existing);
      if (input.password) {
        await this.accounts.setPassword(existing.id, input.password);
        await this.accounts.revokeSessions(existing.id);
      }
      await this.audit.record({ actorId: actor.userId, action: "staff.grant", entity: "user", entityId: existing.id, details: { role: role.name } });
      return `${input.email} теперь в команде: ${role.name}${input.password ? `. Новый пароль: ${input.password}` : ""}`;
    }
    const password = input.password || this.passwords.generate();
    const id = await this.accounts.create({ email: input.email, name: input.name || input.email.split("@")[0], password });
    const member = await this.staff.findById(id);
    member!.grant(role.id, input.extension);
    await this.staff.save(member!);
    await this.audit.record({ actorId: actor.userId, action: "staff.create", entity: "user", entityId: id, details: { role: role.name } });
    return `Сотрудник добавлен. Логин: ${input.email} · Пароль: ${password} (показан один раз)`;
  }

  async changeRole(actor: StaffContext, userId: string, roleId: string) {
    const m = await this.loadMember(actor, userId);
    const role = await this.loadRole(actor, roleId);
    if (!role.isOwner) await this.assertNotLastOwner(m);
    m.changeRole(role.id);
    await this.staff.save(m);
    await this.audit.record({ actorId: actor.userId, action: "staff.role", entity: "user", entityId: m.id, details: { role: role.name } });
  }

  async setExtension(actor: StaffContext, userId: string, extension: string | null) {
    const m = await this.staff.findById(userId);
    if (!m?.isStaff) throw new AccessError("staffNotFound", "Сотрудник не найден");
    m.setExtension(extension);
    const ext = m.snapshot().extension;
    if (ext) {
      const taken = await this.staff.extensionOwner(ext, m.id);
      if (taken) throw new AccessError("extensionTaken", `Номер ${ext} уже у ${taken}`);
    }
    await this.staff.save(m);
    await this.audit.record({ actorId: actor.userId, action: "staff.extension", entity: "user", entityId: m.id, details: { extension: ext } });
  }

  async setDisabled(actor: StaffContext, userId: string, disabled: boolean) {
    const m = await this.loadMember(actor, userId);
    if (disabled) await this.assertNotLastOwner(m);
    m.setDisabled(disabled);
    await this.staff.save(m);
    // Отключённого сразу выкидываем из всех сессий.
    if (disabled) await this.accounts.revokeSessions(m.id);
    await this.audit.record({ actorId: actor.userId, action: disabled ? "staff.disable" : "staff.enable", entity: "user", entityId: m.id });
  }

  async revoke(actor: StaffContext, userId: string) {
    const m = await this.loadMember(actor, userId);
    await this.assertNotLastOwner(m);
    m.revoke();
    await this.staff.save(m);
    await this.accounts.revokeSessions(m.id);
    await this.audit.record({ actorId: actor.userId, action: "staff.revoke", entity: "user", entityId: m.id });
  }

  async resetPassword(actor: StaffContext, userId: string): Promise<string> {
    const m = await this.loadMember(actor, userId);
    const password = this.passwords.generate();
    await this.accounts.setPassword(m.id, password);
    await this.accounts.revokeSessions(m.id);
    await this.audit.record({ actorId: actor.userId, action: "password.reset", entity: "user", entityId: m.id });
    return `Новый пароль для ${m.email}: ${password}`;
  }

  async resetTwoFactor(actor: StaffContext, userId: string) {
    if (userId === actor.userId) throw new AccessError("selfChange", "Свою 2FA отключайте в блоке выше");
    const m = await this.staff.findById(userId);
    if (!m?.isStaff) throw new AccessError("staffNotFound", "Сотрудник не найден");
    await this.accounts.resetTwoFactor(m.id);
    await this.audit.record({ actorId: actor.userId, action: "security.2fa_reset", entity: "user", entityId: m.id });
  }
}

export class RoleService {
  constructor(
    private readonly roles: RoleRepository,
    private readonly audit: AuditLog,
  ) {}

  async save(actor: StaffContext, actorRoleId: string | null, input: { id?: string; name: string; scope: RoleScope; permissions: string[] }) {
    if (input.id) {
      const role = await this.roles.findById(input.id);
      if (!role) throw new AccessError("roleNotFound", "Роль не найдена");
      role.update(input, actorRoleId);
      await this.roles.save(role);
      await this.audit.record({ actorId: actor.userId, action: "role.update", entity: "role", entityId: role.id, details: { name: role.name, scope: role.scope, permissions: role.permissions } });
      return role;
    }
    const role = Role.create(this.roles.nextId(), input.name, input.scope, input.permissions);
    await this.roles.add(role);
    await this.audit.record({ actorId: actor.userId, action: "role.create", entity: "role", entityId: role.id, details: { name: role.name, scope: role.scope, permissions: role.permissions } });
    return role;
  }

  async delete(actor: StaffContext, roleId: string) {
    const role = await this.roles.findById(roleId);
    if (!role) return;
    role.assertDeletable(await this.roles.assignedCount(role.id));
    await this.roles.remove(role.id);
    await this.audit.record({ actorId: actor.userId, action: "role.delete", entity: "role", entityId: role.id, details: { name: role.name } });
  }
}

export class SecurityService {
  constructor(
    private readonly store: SecuritySettingsStore,
    private readonly audit: AuditLog,
  ) {}

  async save(actor: StaffContext, input: { allowlist: string; require2fa: boolean; editorIp: string; editorHasTwoFactor: boolean }) {
    const policy = SecurityPolicy.define(input);
    await this.store.save({ allowlist: policy.allowlistText, require2fa: policy.require2fa }, actor.userId);
    await this.audit.record({ actorId: actor.userId, action: "settings.update", entity: "settings", entityId: "security", details: { require2fa: policy.require2fa, ipRules: policy.allowlistText ? policy.allowlistText.split("\n").length : 0 } });
  }

  async load() {
    return this.store.load();
  }
}
