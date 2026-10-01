import { AggregateRoot } from "@/shared/domain";
import { AccessError } from "./errors";

export interface StaffMemberProps {
  email: string;
  name: string;
  /** admin — сотрудник CRM; user — обычный клиентский аккаунт. */
  accountRole: "user" | "admin";
  roleId: string | null;
  extension: string | null;
  disabled: boolean;
}

/**
 * Сотрудник в контексте Access. Аккаунт без роли CRM (roleId = null) у сотрудника — владелец
 * (так работали аккаунты, созданные до появления ролей).
 */
export class StaffMember extends AggregateRoot<StaffMemberProps> {
  static restore(id: string, props: StaffMemberProps) {
    return new StaffMember(id, props);
  }

  static readonly EXTENSION = /^\d{0,10}$/;

  get email() {
    return this.props.email;
  }
  get label() {
    return this.props.name || this.props.email;
  }
  get roleId() {
    return this.props.roleId;
  }
  get isStaff() {
    return this.props.accountRole === "admin";
  }
  get isActive() {
    return this.isStaff && !this.props.disabled;
  }

  /** Выдать доступ к CRM (новому или существующему аккаунту). */
  grant(roleId: string, extension: string | null) {
    this.props = { ...this.props, accountRole: "admin", roleId, extension: StaffMember.cleanExtension(extension), disabled: false };
  }

  changeRole(roleId: string) {
    this.props.roleId = roleId;
  }

  setExtension(extension: string | null) {
    this.props.extension = StaffMember.cleanExtension(extension);
  }

  setDisabled(disabled: boolean) {
    this.props.disabled = disabled;
  }

  /** Забрать доступ: аккаунт становится обычным клиентским. */
  revoke() {
    this.props = { ...this.props, accountRole: "user", roleId: null, extension: null, disabled: false };
  }

  static cleanExtension(ext: string | null) {
    const v = ext?.trim() ?? "";
    if (!StaffMember.EXTENSION.test(v)) throw new AccessError("extensionTaken", "Внутренний номер — только цифры");
    return v || null;
  }
}
