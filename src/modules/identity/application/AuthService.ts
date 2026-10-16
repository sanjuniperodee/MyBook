import type { Clock, OneTimeStepStore, UnitOfWork } from "@/shared/application";
import type { Locale } from "@/i18n/config";
import { Email, IdentityError, User, clientLogin, hashBackupCode, isBackupCodeShape, parseLoginId, verifyTotp, type LinkPurpose, type PasswordResetRepository, type SessionRepository, type UserRepository } from "../domain";
import type { AdminEmailsPolicy, PasswordHasher, PasswordResetMailer, SecretCipher, TokenService } from "./ports";

const SESSION_TTL_DAYS = 30;
const RESET_TTL_MS = 3600_000;
/** Ссылка доступа в кабинет после оплаты живёт не дольше трёх суток. */
export const ACCESS_LINK_MAX_MS = 72 * 3600_000;
/** Токен ссылки — base64url (выдаём 32 байта = 43 символа); мусор в базу не идёт. */
const isLinkToken = (token: string) => /^[A-Za-z0-9_-]{1,200}$/.test(token);

/** Итог входа: сессия создана — или нужен код второго фактора. */
export type LoginResult = { kind: "session"; token: string; expiresAt: Date; user: User } | { kind: "second_factor"; userId: string };

/**
 * Аутентификация: регистрация, вход по паролю и второму фактору, выход, сброс пароля.
 * Токены сессий генерируются здесь, а в cookie их кладёт веб-адаптер.
 */
export class AuthService {
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
    /** Код из приложения нельзя использовать дважды (подсмотрели, повтор запроса). */
    private readonly steps: OneTimeStepStore,
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

  /** Вход по e-mail или по телефону (клиент, которого завёл менеджер, может не иметь почты). */
  async login(input: { login: string; password: string; locale: Locale }): Promise<LoginResult> {
    const id = parseLoginId(input.login);
    if (!id) throw new IdentityError("credentials");
    let user: User | null;
    if (id.kind === "email") user = await this.users.findByEmail(id.value);
    else {
      // Телефон — только у клиентов, и только если он однозначно указывает на один аккаунт.
      const found = await this.users.findClientsByPhone(id.value);
      user = found.length === 1 ? found[0] : null;
    }
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
    return step !== null && (await this.steps.advance(user.id, step));
  }

  /** Отметить шаг TOTP использованным (после подтверждения настройки 2FA тем же кодом). */
  async markStepUsed(userId: string, step: number) {
    await this.steps.advance(userId, step);
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
    await this.resets.create(this.tokens.hash(token), user.id, new Date(this.clock.now().getTime() + RESET_TTL_MS), "reset");
    await this.resetMailer.send({ email: user.email, name: user.name, token, locale });
  }

  /**
   * Новый пароль по ссылке из письма: все сессии закрываются. Переход по ссылке подтверждает
   * владение адресом — только здесь адреса из ADMIN_EMAILS получают права администратора.
   * Ссылка доступа из WhatsApp (purpose=access) сюда не подходит: у неё свой путь без прав администратора.
   */
  async resetPassword(token: string, password: string): Promise<LoginResult> {
    const user = await this.redeem(token, password, "reset");
    // Смена пароля по письму не обходит второй фактор сотрудника.
    if (user.needsSecondFactor) return { kind: "second_factor", userId: user.id };
    return { kind: "session", user, ...(await this.openSession(user.id)) };
  }

  /**
   * Ссылка доступа в кабинет после оплаты по счёту из чата: клиент сам задаёт пароль и входит. Выдаётся только клиенту
   * (не сотруднику и не адресу из ADMIN_EMAILS) на срок не больше 72 часов; прежние неиспользованные ссылки доступа
   * гаснут — действует одна, последняя. Возвращает токен (уходит клиенту в чат) и логин для сообщения.
   */
  async issueAccessLink(userId: string, ttlMs: number = ACCESS_LINK_MAX_MS): Promise<{ token: string; expiresAt: Date; login: string }> {
    if (!Number.isFinite(ttlMs) || ttlMs <= 0 || ttlMs > ACCESS_LINK_MAX_MS) throw new RangeError("access link ttl must be within 72 hours");
    const user = await this.users.findById(userId);
    if (!user || user.role !== "user" || this.adminEmails.isAdminEmail(user.email)) throw new IdentityError("credentials");
    const token = this.tokens.newToken();
    const now = this.clock.now();
    const expiresAt = new Date(now.getTime() + ttlMs);
    await this.uow.run(async () => {
      await this.resets.revokeUnused(user.id, "access", now);
      await this.resets.create(this.tokens.hash(token), user.id, expiresAt, "access");
    });
    return { token, expiresAt, login: clientLogin(user) };
  }

  /**
   * Пароль по ссылке доступа (POST формы /reset/<token>): отдельный путь без выдачи прав администратора — их даёт
   * только сброс по почте. Ссылка одноразовая, прежние сессии закрываются.
   */
  async redeemAccessLink(token: string, password: string): Promise<{ token: string; expiresAt: Date; user: User }> {
    const user = await this.redeem(token, password, "access");
    return { user, ...(await this.openSession(user.id)) };
  }

  /**
   * Что за ссылка, без погашения: страница /reset/<token> показывает «Задайте пароль» для доступа после оплаты и
   * понятный текст для устаревшей. GET (и предпросмотр ссылки в WhatsApp) ссылку не тратит.
   */
  async linkInfo(token: string): Promise<{ purpose: LinkPurpose; valid: boolean } | null> {
    if (!isLinkToken(token)) return null;
    return this.resets.peek(this.tokens.hash(token), this.clock.now());
  }

  private async redeem(token: string, password: string, purpose: LinkPurpose): Promise<User> {
    User.assertPasswordPolicy(password);
    if (!isLinkToken(token)) throw new IdentityError("resetExpired");
    const now = this.clock.now();
    const reset = await this.resets.findValid(this.tokens.hash(token), now);
    if (!reset || reset.purpose !== purpose) throw new IdentityError("resetExpired");
    const hash = await this.hasher.hash(password);
    return this.uow.run(async () => {
      const u = await this.users.findById(reset.userId);
      // Доступ после оплаты — только клиенту: аккаунт, ставший сотрудником, по такой ссылке не входит.
      if (!u || (purpose === "access" && u.role !== "user")) throw new IdentityError("resetExpired");
      // Одна ссылка — один новый пароль: два одновременных отправления формы не пройдут оба.
      if (!(await this.resets.markUsed(reset.id, now))) throw new IdentityError("resetExpired");
      u.changePassword(hash, true);
      if (purpose === "reset" && u.role !== "admin" && this.adminEmails.isAdminEmail(u.email)) u.promoteToAdmin();
      await this.users.save(u);
      await this.sessions.revokeAll(u.id);
      this.uow.track(u);
      return u;
    });
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
