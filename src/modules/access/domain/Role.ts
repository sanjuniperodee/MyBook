import { AggregateRoot } from "@/shared/domain";
import { AccessError } from "./errors";
import { allPermissions, isPermission, type Permission, type RoleScope } from "./permissions";

export interface RoleProps {
  name: string;
  scope: RoleScope;
  permissions: Permission[];
  /** Ключ системной роли (owner, manager…); у своих ролей — null. */
  key: string | null;
}

/** Роль сотрудника: набор прав и видимость данных («все» или «только свои»). */
export class Role extends AggregateRoot<RoleProps> {
  static restore(id: string, props: RoleProps) {
    return new Role(id, props);
  }

  static create(id: string, name: string, scope: RoleScope, permissions: string[]) {
    return new Role(id, { name: Role.cleanName(name), scope, permissions: permissions.filter(isPermission), key: null });
  }

  private static cleanName(name: string) {
    const n = name.trim();
    if (n.length < 2 || n.length > 60) throw new AccessError("roleNotFound", "Название роли — от 2 до 60 символов");
    return n;
  }

  get name() {
    return this.props.name;
  }
  get key() {
    return this.props.key;
  }
  get isOwner() {
    return this.props.key === "owner";
  }
  get isSystem() {
    return this.props.key !== null;
  }
  get scope(): RoleScope {
    return this.isOwner ? "all" : this.props.scope;
  }
  /** У руководителя всегда все права — даже если в базе записано иначе. */
  get permissions(): readonly Permission[] {
    return this.isOwner ? allPermissions : this.props.permissions;
  }

  /** editorRoleId — роль того, кто редактирует: нельзя лишить себя управления командой. */
  update(input: { name: string; scope: RoleScope; permissions: string[] }, editorRoleId: string | null) {
    if (this.isOwner) throw new AccessError("ownerRoleImmutable", "У руководителя всегда все права");
    const permissions = input.permissions.filter(isPermission);
    if (editorRoleId === this.id && !permissions.includes("team.manage")) throw new AccessError("keepTeamManage", "Нельзя убрать у своей роли право управлять командой");
    this.props = { ...this.props, name: Role.cleanName(input.name), scope: input.scope, permissions };
  }

  assertDeletable(assignedCount: number) {
    if (this.isSystem) throw new AccessError("systemRole", "Системную роль удалить нельзя");
    if (assignedCount > 0) throw new AccessError("roleInUse", `Роль назначена сотрудникам (${assignedCount}). Сначала смените им роль.`);
  }
}
