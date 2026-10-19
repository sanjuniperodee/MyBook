import type { User } from "./User";

export interface UserRepository {
  nextId(): string;
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  /** Клиенты (не сотрудники) с этим номером телефона; номер сравнивается по цифрам. */
  findClientsByPhone(phone: string): Promise<User[]>;
  add(user: User): Promise<void>;
  save(user: User): Promise<void>;
}

/** Сессии: в базе хранится только хэш токена из cookie. */
export interface SessionRepository {
  create(userId: string, tokenHash: string, expiresAt: Date): Promise<void>;
  findUserId(tokenHash: string, now: Date): Promise<string | null>;
  revoke(tokenHash: string): Promise<void>;
  revokeAll(userId: string, exceptTokenHash?: string | null): Promise<void>;
  purgeExpired(now: Date): Promise<void>;
}

/** Назначение одноразовой ссылки: reset — сброс пароля по почте; access — доступ в кабинет после оплаты (в WhatsApp). */
export type LinkPurpose = "reset" | "access";

export interface PasswordResetRepository {
  create(tokenHash: string, userId: string, expiresAt: Date, purpose?: LinkPurpose): Promise<void>;
  /** Действующий (не просроченный и не использованный) запрос — id пользователя и назначение ссылки. */
  findValid(tokenHash: string, now: Date): Promise<{ id: string; userId: string; purpose: LinkPurpose } | null>;
  /** Погасить ссылку; false — её уже погасил параллельный запрос (одна ссылка — один новый пароль). */
  markUsed(id: string, now: Date): Promise<boolean>;
  /** Ссылка без погашения (страницу открывает и предпросмотр WhatsApp): назначение и действует ли ещё. */
  peek(tokenHash: string, now: Date): Promise<{ purpose: LinkPurpose; valid: boolean } | null>;
  /** Неиспользованные ссылки пользователя с этим назначением гаснут (выдана новая). */
  revokeUnused(userId: string, purpose: LinkPurpose, now: Date): Promise<void>;
}
