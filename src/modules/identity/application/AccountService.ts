import type { Locale } from "@/i18n/config";
import type { Clock, UnitOfWork } from "@/shared/application";
import { normalizePhone } from "@/shared/domain/phone";
import { Email, IdentityError, User, generateBackupCodes, generateSecret, hashBackupCode, isPhoneEmail, otpauthUrl, phoneEmail, verifyTotp, type UserRepository } from "../domain";
import type { AuthService } from "./AuthService";
import type { PasswordHasher, SecretCipher } from "./ports";

/** Профиль клиента и сотрудника: имя, телефон, пароль, второй фактор. */
export class AccountService {
  constructor(
    private readonly users: UserRepository,
    private readonly auth: AuthService,
    private readonly hasher: PasswordHasher,
    private readonly cipher: SecretCipher,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  private async load(userId: string) {
    const user = await this.users.findById(userId);
    if (!user) throw new IdentityError("credentials");
    return user;
  }

  async updateProfile(userId: string, name: string, phone: string | null) {
    const user = await this.load(userId);
    user.updateProfile(name, phone);
    await this.users.save(user);
  }

  /** Язык интерфейса и писем. */
  async setLocale(userId: string, locale: Locale) {
    const user = await this.load(userId);
    user.useLocale(locale);
    await this.users.save(user);
  }

  async rememberPhone(userId: string, phone: string) {
    const user = await this.load(userId);
    user.rememberPhone(phone);
    await this.users.save(user);
  }

  /** Смена пароля из профиля: остальные устройства выходят, текущая сессия остаётся. */
  async changePassword(userId: string, current: string, next: string, currentToken: string | null) {
    User.assertPasswordPolicy(next);
    const user = await this.load(userId);
    if (!(await this.hasher.verify(current, user.passwordHash))) throw new IdentityError("credentials");
    const hash = await this.hasher.hash(next);
    await this.uow.run(async () => {
      user.changePassword(hash, false);
      await this.users.save(user);
      await this.auth.revokeAllSessions(user.id, currentToken);
      this.uow.track(user);
    });
  }

  /** Аккаунт сотрудника, заведённый руководителем. */
  async provision(input: { email: string; name: string; password: string }): Promise<string> {
    const email = Email.parse(input.email);
    User.assertPasswordPolicy(input.password);
    const user = User.provision(this.users.nextId(), { email, name: input.name, passwordHash: await this.hasher.hash(input.password) }, this.clock.now());
    await this.users.add(user);
    return user.id;
  }

  /**
   * Клиент, которого завёл менеджер: телефон обязателен, почта — нет (тогда ставится служебный адрес, а входит клиент
   * по телефону). Пароль задаёт менеджер или генерируется; клиент получает его от менеджера и может сменить в профиле.
   * Дубликат по телефону или почте — IdentityError("exists") с id уже существующего клиента в `existingId`.
   */
  async provisionClient(input: { name: string; phone: string; email: string | null; password: string; locale: Locale }): Promise<{ id: string; login: string }> {
    const phone = normalizePhone(input.phone);
    if (phone.length < 10 || phone.length > 15) throw new IdentityError("phone");
    const email = input.email?.trim() ? Email.parse(input.email) : Email.parse(phoneEmail(phone));
    User.assertPasswordPolicy(input.password);
    const name = input.name.trim();
    if (!name) throw new IdentityError("credentials");
    const [sameEmail, samePhone] = await Promise.all([this.users.findByEmail(email.value), this.users.findClientsByPhone(phone)]);
    const duplicate = sameEmail ?? samePhone[0] ?? null;
    if (duplicate) throw Object.assign(new IdentityError("exists"), { existingId: duplicate.id });
    const user = User.provisionClient(this.users.nextId(), { email, name, phone, passwordHash: await this.hasher.hash(input.password), locale: input.locale }, this.clock.now());
    await this.users.add(user);
    return { id: user.id, login: isPhoneEmail(email.value) ? phone : email.value };
  }

  /** Новый пароль клиенту (потерял, не получил): прежние сессии завершаются. Возвращает логин для сообщения клиенту. */
  async issueClientPassword(userId: string, password: string): Promise<{ login: string; name: string; locale: Locale }> {
    User.assertPasswordPolicy(password);
    const user = await this.load(userId);
    if (user.role !== "user") throw new IdentityError("credentials");
    const hash = await this.hasher.hash(password);
    await this.uow.run(async () => {
      user.changePassword(hash, true);
      await this.users.save(user);
      await this.auth.revokeAllSessions(user.id, null);
      this.uow.track(user);
    });
    return { login: isPhoneEmail(user.email) ? normalizePhone(user.phone ?? "") : user.email, name: user.name, locale: user.locale };
  }

  /** Пароль, выданный руководителем (сброс сотруднику). */
  async setPassword(userId: string, password: string) {
    User.assertPasswordPolicy(password);
    const user = await this.load(userId);
    user.changePassword(await this.hasher.hash(password), true);
    await this.users.save(user);
  }

  // ─── второй фактор ───────────────────────────────────────────────────────

  async beginTwoFactor(userId: string): Promise<{ secret: string; otpauthUrl: string }> {
    const user = await this.load(userId);
    const secret = generateSecret();
    user.beginTwoFactorSetup(this.cipher.encrypt(secret));
    await this.users.save(user);
    return { secret, otpauthUrl: otpauthUrl(secret, user.email) };
  }

  /** Код из приложения подтверждает настройку; резервные коды показываются один раз. */
  async confirmTwoFactor(userId: string, code: string): Promise<string[]> {
    const user = await this.load(userId);
    const pending = user.pendingTwoFactorSecret;
    const secret = pending ? this.cipher.decrypt(pending) : null;
    const step = secret ? verifyTotp(secret, code, this.clock.now().getTime()) : null;
    if (step === null) throw new IdentityError("twoFactorCode");
    await this.auth.markStepUsed(user.id, step);
    const codes = generateBackupCodes();
    await this.uow.run(async () => {
      user.enableTwoFactor(codes.map(hashBackupCode), this.clock.now());
      await this.users.save(user);
      this.uow.track(user);
    });
    return codes;
  }

  async regenerateBackupCodes(userId: string, code: string): Promise<string[]> {
    const user = await this.load(userId);
    if (!(await this.auth.checkSecondFactor(user, code))) throw new IdentityError("twoFactorCode");
    const codes = generateBackupCodes();
    user.replaceBackupCodes(codes.map(hashBackupCode));
    await this.users.save(user);
    return codes;
  }

  async disableTwoFactor(userId: string, code: string) {
    const user = await this.load(userId);
    if (!(await this.auth.checkSecondFactor(user, code))) throw new IdentityError("twoFactorCode");
    await this.uow.run(async () => {
      user.disableTwoFactor(false);
      await this.users.save(user);
      this.uow.track(user);
    });
  }

  /** Сотрудник потерял телефон и резервные коды — сброс руководителем. */
  async resetTwoFactorByAdmin(userId: string) {
    const user = await this.load(userId);
    await this.uow.run(async () => {
      user.disableTwoFactor(true);
      await this.users.save(user);
      this.uow.track(user);
    });
  }
}
