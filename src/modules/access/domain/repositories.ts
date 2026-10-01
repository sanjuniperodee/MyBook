import type { Role } from "./Role";
import type { StaffMember } from "./StaffMember";

export interface RoleRepository {
  nextId(): string;
  findById(id: string): Promise<Role | null>;
  findByKey(key: string): Promise<Role | null>;
  assignedCount(roleId: string): Promise<number>;
  add(role: Role): Promise<void>;
  save(role: Role): Promise<void>;
  remove(roleId: string): Promise<void>;
}

export interface StaffRepository {
  findById(id: string): Promise<StaffMember | null>;
  findByEmail(email: string): Promise<StaffMember | null>;
  /** Сколько активных руководителей останется, если исключить userId. */
  activeOwnersExcept(userId: string, ownerRoleId: string | null): Promise<number>;
  extensionOwner(extension: string, exceptUserId: string): Promise<string | null>;
  save(member: StaffMember): Promise<void>;
}
