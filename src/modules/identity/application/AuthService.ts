import type { Clock, UnitOfWork } from "@/shared/application";
import type { Locale } from "@/i18n/config";
import { Email, IdentityError, User, hashBackupCode, isBackupCodeShape, verifyTotp, type PasswordResetRepository, type SessionRepository, type UserRepository } from "../domain";
import type { AdminEmailsPolicy, PasswordHasher, PasswordResetMailer, SecretCipher, TokenService } from "./ports";

export const SESSION_TTL_DAYS = 30;
const RESET_TTL_MS = 3600_000;

/** Итог входа: сессия создана — или нужен код второго фактора. */
export type LoginResult = { kind: "session"; token: string; expiresAt: Date; user: User } | { kind: "second_factor"; userId: string };

/**
 * Аутентификация: регистрация, вход по паролю и второму фактору, выход, сброс пароля.
 * Токены сессий генерируются здесь, а в cookie их кладёт веб-адаптер.
 */
export class AuthService {
  // Код из приложения нельзя использовать дважды (подсмотрели, повтор запроса). Один инстанс — хватает памяти процесса.
  readonly #usedSteps = new Map<string, number>();

  constructor(
    private readonly users: UserRepository,
    private readonly sessions: SessionRepository,
    private readonly resets: PasswordResetRepository,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
    private readonly cipher: SecretCipher,
    private readonly resetMailer: PasswordResetMailer,
    private readonly adminEmails: AdminEmailsPolicy,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  async register(input: { email: string; name: string; password: string; locale: Locale; source: Record<string, string> | null }) {
    const email = Email.parse(input.email);
    User.assertPasswordPolicy(input.password);
    if (await this.users.findByEmail(email.value)) throw new IdentityError("exists");
    const user = User.register(this.users.nextId(), { email, name: input.name, passwordHash: await this.hasher.hash(input.password), locale: input.locale, source: input.source }, this.clock.now());
    await this.uow.run(async () => {
      await this.users.add(user);
      this.uow.track(user);
    });
    return { user, ...(await this.openSession(user.id)) };
  }

  async login(input: { email: string; password: string; locale: Locale }): Promise<LoginResult> {
    const user = await this.users.findByEmail(input.email.trim().toLowerCase());
    if (!user || !(await this.hasher.verify(input.password, user.passwordHash))) throw new IdentityError("credentials");
    if (user.needsSecondFactor) return { kind: "second_factor", userId: user.id };
    await this.rememberLocale(user, input.locale);
    return { kind: "session", user, ...(await this.openSession(user.id)) };
  }

  /** Код из приложения или резервный код (сгорает). */
  async completeSecondFactor(userId: string, code: string, locale: Locale): Promise<{ token: string; expiresAt: Date; user: User }> {
    const user = await this.users.findById(userId);
    if (!user?.needsSecondFactor) throw new IdentityError("twoFactorExpired");
    if (!(await this.checkSecondFactor(user, code))) throw new IdentityError("twoFactorCode");
    await this.rememberLocale(user, locale);
    return { user, ...(await this.openSession(user.id)) };
  }

  /** Проверка второго фактора для чувствительных действий (новые резервные коды, отключение 2FA). */
  async checkSecondFactor(user: User, code: string): Promise<boolean> {
    const c = code.trim();
    if (isBackupCodeShape(c)) {
      if (!user.consumeBackupCode(hashBackupCode(c))) return false;
      await this.users.save(user);
      return true;
    }
    const secret = user.twoFactor.encryptedSecret ? this.cipher.decrypt(user.twoFactor.encryptedSecret) : null;
    if (!secret) return false;
    const step = verifyTotp(secret, c, this.clock.now().getTime());
    if (step === null || (this.#usedSteps.get(user.id) ?? -1) >= step) return false;
    this.#usedSteps.set(user.id, step);
    return true;
  }

  /** Отметить шаг TOTP использованным (после подтверждения настройки 2FA тем же кодом). */
  markStepUsed(userId: string, step: number) {
    this.#usedSteps.set(userId, step);
  }

  async currentUserId(token: string): Promise<string | null> {
    return this.sessions.findUserId(this.tokens.hash(token), this.clock.now());
  }

  async logout(token: string | null | undefined) {
    if (token) await this.sessions.revoke(this.tokens.hash(token));
  }

  async revokeAllSessions(userId: string, exceptToken?: string | null) {
    await this.sessions.revokeAll(userId, exceptToken ? this.tokens.hash(exceptToken) : null);
  }

  /** Письмо со ссылкой; несуществующий адрес не раскрываем. */
  async requestPasswordReset(rawEmail: string, locale: Locale) {
    const user = await this.users.findByEmail(rawEmail.trim().toLowerCase());
    if (!user) return;
    const token = this.tokens.newToken();
    await this.resets.create(this.tokens.hash(token), user.id, new Date(this.clock.now().getTime() + RESET_TTL_MS));
    await this.resetMailer.send({ email: user.email, name: user.name, token, locale });
  }

  /**
   * Новый пароль по ссылке из письма: все сессии закрываются. Переход по ссылке подтверждает
   * владение адресом — только здесь адреса из ADMIN_EMAILS получают права администратора.
   */
  async resetPassword(token: string, password: string): Promise<LoginResult> {
    User.assertPasswordPolicy(password);
    const now = this.clock.now();
    const reset = await this.resets.findValid(this.tokens.hash(token), now);
    if (!reset) throw new IdentityError("resetExpired");
    const hash = await this.hasher.hash(password);
    const user = await this.uow.run(async () => {
      const u = await this.users.findById(reset.userId);
      if (!u) throw new IdentityError("resetExpired");
      u.changePassword(hash, true);
      if (u.role !== "admin" && this.adminEmails.isAdminEmail(u.email)) u.promoteToAdmin();
      await this.users.save(u);
      await this.resets.markUsed(reset.id, now);
      await this.sessions.revokeAll(u.id);
      this.uow.track(u);
      return u;
    });
    // Смена пароля по письму не обходит второй фактор сотрудника.
    if (user.needsSecondFactor) return { kind: "second_factor", userId: user.id };
    return { kind: "session", user, ...(await this.openSession(user.id)) };
  }

  private async openSession(userId: string) {
    const token = this.tokens.newToken();
    const now = this.clock.now();
    const expiresAt = new Date(now.getTime() + SESSION_TTL_DAYS * 86_400_000);
    await this.sessions.create(userId, this.tokens.hash(token), expiresAt);
    await this.sessions.purgeExpired(now);
    return { token, expiresAt };
  }

  private async rememberLocale(user: User, locale: Locale) {
    if (user.locale === locale) return;
    user.useLocale(locale);
    await this.users.save(user);
  }
}
