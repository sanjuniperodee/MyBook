import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, gt, isNull, lt, ne, sql } from "drizzle-orm";
import { passwordResets, sessions, users } from "@/shared/infrastructure/db/schema";
import { executor } from "@/shared/infrastructure/database";
import { isPhoneEmail, User, type PasswordResetRepository, type SessionRepository, type UserRepository } from "../domain";

type Row = typeof users.$inferSelect;

const toDomain = (r: Row) =>
  User.restore(r.id, {
    email: r.email,
    name: r.name,
    phone: r.phone,
    passwordHash: r.passwordHash,
    role: r.role,
    locale: r.locale,
    staffDisabled: r.staffDisabled,
    source: r.source,
    twoFactor: { encryptedSecret: r.totpSecret, enabledAt: r.totpEnabledAt, backupHashes: r.totpBackup },
    createdAt: r.createdAt,
  });

/**
 * Пользователь контекста Identity. Таблица users общая с Access и CRM, но этот репозиторий
 * читает и пишет только свои колонки — чужие поля (роль в CRM, менеджер, теги) не трогает.
 */
export class DrizzleUserRepository implements UserRepository {
  nextId() {
    return randomUUID();
  }

  async findById(id: string) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const [r] = await executor().select().from(users).where(eq(users.id, id)).limit(1);
    return r ? toDomain(r) : null;
  }

  async findByEmail(email: string) {
    const [r] = await executor().select().from(users).where(sql`lower(${users.email}) = ${email.toLowerCase()}`).limit(1);
    return r ? toDomain(r) : null;
  }

  async findClientsByPhone(phone: string) {
    const digits = phone.replace(/\D/g, "");
    // В базе номера лежат в разном виде (+7 775…, 8775…): сравниваем цифры, 8… считаем за 7….
    const variants = [digits, digits.length === 11 && digits.startsWith("7") ? `8${digits.slice(1)}` : digits];
    const rows = await executor()
      .select()
      .from(users)
      .where(sql`${users.role} = 'user' and regexp_replace(coalesce(${users.phone}, ''), '\D', '', 'g') in (${sql.join(variants.map((v) => sql`${v}`), sql`, `)})`)
      .limit(5);
    return rows.map(toDomain);
  }

  async add(user: User) {
    const s = user.snapshot();
    await executor()
      .insert(users)
      .values({ id: user.id, email: s.email, name: s.name, phone: s.phone, passwordHash: s.passwordHash, role: s.role, locale: s.locale, source: s.source, emailOptOut: isPhoneEmail(s.email), createdAt: s.createdAt });
  }

  async save(user: User) {
    const s = user.snapshot();
    await executor()
      .update(users)
      .set({ name: s.name, phone: s.phone, passwordHash: s.passwordHash, role: s.role, locale: s.locale, totpSecret: s.twoFactor.encryptedSecret, totpEnabledAt: s.twoFactor.enabledAt, totpBackup: s.twoFactor.backupHashes, updatedAt: new Date() })
      .where(eq(users.id, user.id));
  }
}

export class DrizzleSessionRepository implements SessionRepository {
  async create(userId: string, tokenHash: string, expiresAt: Date) {
    await executor().insert(sessions).values({ id: tokenHash, userId, expiresAt });
  }

  async findUserId(tokenHash: string, now: Date) {
    const [r] = await executor().select({ userId: sessions.userId }).from(sessions).where(and(eq(sessions.id, tokenHash), gt(sessions.expiresAt, now))).limit(1);
    return r?.userId ?? null;
  }

  async revoke(tokenHash: string) {
    await executor().delete(sessions).where(eq(sessions.id, tokenHash));
  }

  async revokeAll(userId: string, exceptTokenHash?: string | null) {
    await executor().delete(sessions).where(exceptTokenHash ? and(eq(sessions.userId, userId), ne(sessions.id, exceptTokenHash)) : eq(sessions.userId, userId));
  }

  async purgeExpired(now: Date) {
    await executor().delete(sessions).where(lt(sessions.expiresAt, now));
  }
}

export class DrizzlePasswordResetRepository implements PasswordResetRepository {
  async create(tokenHash: string, userId: string, expiresAt: Date) {
    await executor().insert(passwordResets).values({ id: tokenHash, userId, expiresAt });
  }

  async findValid(tokenHash: string, now: Date) {
    const [r] = await executor()
      .select({ id: passwordResets.id, userId: passwordResets.userId })
      .from(passwordResets)
      .where(and(eq(passwordResets.id, tokenHash), gt(passwordResets.expiresAt, now), isNull(passwordResets.usedAt)))
      .limit(1);
    return r ?? null;
  }

  async markUsed(id: string, now: Date) {
    await executor().update(passwordResets).set({ usedAt: now }).where(eq(passwordResets.id, id));
  }
}
