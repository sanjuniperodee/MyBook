import type { Locale } from "@/i18n/config";
import type { Clock, UnitOfWork } from "@/shared/application";
import { Email, IdentityError, User, generateBackupCodes, generateSecret, hashBackupCode, otpauthUrl, verifyTotp, type UserRepository } from "../domain";
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
