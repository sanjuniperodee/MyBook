import { AggregateRoot } from "@/shared/domain";
import type { Locale } from "@/i18n/config";
import type { Email } from "./Email";
import { IdentityError } from "./errors";
import { IdentityEvents } from "./events";

export type UserRole = "user" | "admin";

/** Второй фактор: секрет хранится зашифрованным (шифрует инфраструктура), резервные коды — хэшами. */
export interface TwoFactorState {
  encryptedSecret: string | null;
  enabledAt: Date | null;
  backupHashes: string[];
}

export interface UserProps {
  email: string;
  name: string;
  phone: string | null;
  passwordHash: string;
  role: UserRole;
  locale: Locale;
  staffDisabled: boolean;
  source: Record<string, string> | null;
  twoFactor: TwoFactorState;
  createdAt: Date;
}

export const MIN_PASSWORD_LENGTH = 8;

/**
 * Учётная запись (контекст Identity): вход, пароль, профиль и второй фактор.
 * Роли и права сотрудников — контекст Access, клиентские данные CRM — контекст CRM.
 */
export class User extends AggregateRoot<UserProps> {
  static restore(id: string, props: UserProps) {
    return new User(id, props);
  }

  static register(id: string, input: { email: Email; name: string; passwordHash: string; locale: Locale; source: Record<string, string> | null }, now: Date) {
    const user = new User(id, {
      email: input.email.value,
      name: input.name.trim().slice(0, 100),
      phone: null,
      passwordHash: input.passwordHash,
      role: "user",
      locale: input.locale,
      staffDisabled: false,
      source: input.source,
      twoFactor: { encryptedSecret: null, enabledAt: null, backupHashes: [] },
      createdAt: now,
    });
    user.record(IdentityEvents.registered({ userId: id, email: user.props.email, name: user.props.name }));
    return user;
  }

  /** Аккаунт, заведённый руководителем для сотрудника: без события регистрации клиента. */
  static provision(id: string, input: { email: Email; name: string; passwordHash: string }, now: Date) {
    return new User(id, {
      email: input.email.value,
      name: input.name.trim().slice(0, 100),
      phone: null,
      passwordHash: input.passwordHash,
      role: "user",
      locale: "ru",
      staffDisabled: false,
      source: null,
      twoFactor: { encryptedSecret: null, enabledAt: null, backupHashes: [] },
      createdAt: now,
    });
  }

  static assertPasswordPolicy(password: string) {
    if (password.length < MIN_PASSWORD_LENGTH || password.length > 200) throw new IdentityError("password");
  }

  get email() {
    return this.props.email;
  }
  get name() {
    return this.props.name;
  }
  get phone() {
    return this.props.phone;
  }
  get locale() {
    return this.props.locale;
  }
  get role() {
    return this.props.role;
  }
  get passwordHash() {
    return this.props.passwordHash;
  }
  get isStaff() {
    return this.props.role === "admin" && !this.props.staffDisabled;
  }
  get twoFactor(): Readonly<TwoFactorState> {
    return this.props.twoFactor;
  }
  get twoFactorEnabled() {
    return !!this.props.twoFactor.enabledAt && !!this.props.twoFactor.encryptedSecret;
  }
  /** Сотруднику с включённой 2FA нужен код после пароля. Клиентам второй фактор не нужен. */
  get needsSecondFactor() {
    return this.props.role === "admin" && this.twoFactorEnabled;
  }

  updateProfile(name: string, phone: string | null) {
    this.props.name = name.trim().slice(0, 100);
    this.props.phone = phone?.trim() || null;
  }

  rememberPhone(phone: string) {
    if (!this.props.phone) this.props.phone = phone;
  }

  /** Письма приходят на языке, которым человек пользуется сейчас. */
  useLocale(locale: Locale) {
    this.props.locale = locale;
  }

  changePassword(newHash: string, viaReset: boolean) {
    this.props.passwordHash = newHash;
    this.record(IdentityEvents.passwordChanged({ userId: this.id, viaReset }));
  }

  /** Права администратора выдаются только после подтверждения владения адресом (сброс пароля по ссылке). */
  promoteToAdmin() {
    this.props.role = "admin";
  }

  // ─── второй фактор ───────────────────────────────────────────────────────

  /** Новый секрет: 2FA включится только после ввода верного кода. */
  beginTwoFactorSetup(encryptedSecret: string) {
    if (this.twoFactorEnabled) throw new IdentityError("twoFactorAlreadyOn");
    this.props.twoFactor = { encryptedSecret, enabledAt: null, backupHashes: [] };
  }

  get pendingTwoFactorSecret(): string | null {
    return !this.props.twoFactor.enabledAt ? this.props.twoFactor.encryptedSecret : null;
  }

  enableTwoFactor(backupHashes: string[], now: Date) {
    if (!this.props.twoFactor.encryptedSecret) throw new IdentityError("twoFactorCode");
    this.props.twoFactor = { ...this.props.twoFactor, enabledAt: now, backupHashes };
    this.record(IdentityEvents.twoFactorEnabled({ userId: this.id }));
  }

  replaceBackupCodes(backupHashes: string[]) {
    this.props.twoFactor = { ...this.props.twoFactor, backupHashes };
  }

  /** Резервный код срабатывает один раз. */
  consumeBackupCode(hash: string): boolean {
    if (!this.props.twoFactor.backupHashes.includes(hash)) return false;
    this.props.twoFactor = { ...this.props.twoFactor, backupHashes: this.props.twoFactor.backupHashes.filter((h) => h !== hash) };
    return true;
  }

  disableTwoFactor(byAdmin: boolean) {
    const wasOn = this.twoFactorEnabled;
    this.props.twoFactor = { encryptedSecret: null, enabledAt: null, backupHashes: [] };
    if (wasOn) this.record(IdentityEvents.twoFactorDisabled({ userId: this.id, byAdmin }));
  }
}
