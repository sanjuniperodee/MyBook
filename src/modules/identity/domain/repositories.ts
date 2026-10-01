import type { User } from "./User";

export interface UserRepository {
  nextId(): string;
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
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

export interface PasswordResetRepository {
  create(tokenHash: string, userId: string, expiresAt: Date): Promise<void>;
  /** Действующий (не просроченный и не использованный) запрос — id пользователя. */
  findValid(tokenHash: string, now: Date): Promise<{ id: string; userId: string } | null>;
  markUsed(id: string, now: Date): Promise<void>;
}
