import "server-only";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { users, type User } from "../db/schema";
import { isSecureCookie } from "../env";
import { decryptSecret, encryptSecret, signValue, verifySigned } from "./crypto";
import { generateBackupCodes, generateSecret, hashBackupCode, isBackupCodeShape, verifyTotp } from "./totp";

/** После верного пароля: «билет» на 5 минут, чтобы ввести код 2FA. Без него сессия не создаётся. */
const TICKET_COOKIE = "mb_2fa";
const TICKET_TTL_MS = 5 * 60_000;

export const needsSecondFactor = (u: Pick<User, "role" | "totpEnabledAt" | "totpSecret">) => u.role === "admin" && !!u.totpEnabledAt && !!u.totpSecret;

export async function issueTicket(userId: string) {
  const exp = Date.now() + TICKET_TTL_MS;
  (await cookies()).set(TICKET_COOKIE, signValue(`${userId}.${exp}`), { httpOnly: true, sameSite: "lax", secure: isSecureCookie, path: "/", maxAge: TICKET_TTL_MS / 1000 });
}

export async function readTicket(): Promise<string | null> {
  const raw = (await cookies()).get(TICKET_COOKIE)?.value;
  const data = raw ? verifySigned(raw) : null;
  if (!data) return null;
  const [userId, exp] = data.split(".");
  return Number(exp) > Date.now() ? userId : null;
}

export async function clearTicket() {
  (await cookies()).delete(TICKET_COOKIE);
}

// Код из приложения нельзя использовать дважды (перехват по плечу, повтор запроса). Один инстанс — хватает памяти процесса.
const usedSteps = new Map<string, number>();

/** Проверка кода из приложения или резервного кода; резервный код после входа сгорает. */
export async function verifySecondFactor(user: User, code: string): Promise<boolean> {
  const c = code.trim();
  if (isBackupCodeShape(c)) {
    const hash = hashBackupCode(c);
    if (!user.totpBackup.includes(hash)) return false;
    await db
      .update(users)
      .set({ totpBackup: user.totpBackup.filter((h) => h !== hash) })
      .where(eq(users.id, user.id));
    return true;
  }
  const secret = user.totpSecret ? decryptSecret(user.totpSecret) : null;
  if (!secret) return false;
  const step = verifyTotp(secret, c);
  if (step === null || (usedSteps.get(user.id) ?? -1) >= step) return false;
  usedSteps.set(user.id, step);
  return true;
}

/** Начало настройки: новый секрет сохраняем, но 2FA включится только после ввода верного кода. */
export async function startSetup(userId: string): Promise<string> {
  const secret = generateSecret();
  await db.update(users).set({ totpSecret: encryptSecret(secret), totpEnabledAt: null }).where(eq(users.id, userId));
  return secret;
}

export async function pendingSecret(user: User): Promise<string | null> {
  if (user.totpEnabledAt || !user.totpSecret) return null;
  return decryptSecret(user.totpSecret);
}

/** Подтверждение настройки кодом из приложения: включаем 2FA и выдаём резервные коды (показываются один раз). */
export async function confirmSetup(user: User, code: string): Promise<string[] | null> {
  const secret = await pendingSecret(user);
  if (!secret) return null;
  const step = verifyTotp(secret, code);
  if (step === null) return null;
  usedSteps.set(user.id, step);
  const codes = generateBackupCodes();
  await db
    .update(users)
    .set({ totpEnabledAt: new Date(), totpBackup: codes.map(hashBackupCode) })
    .where(eq(users.id, user.id));
  return codes;
}

export async function regenerateBackupCodes(userId: string): Promise<string[]> {
  const codes = generateBackupCodes();
  await db.update(users).set({ totpBackup: codes.map(hashBackupCode) }).where(eq(users.id, userId));
  return codes;
}

export async function disableTwoFactor(userId: string) {
  await db.update(users).set({ totpSecret: null, totpEnabledAt: null, totpBackup: [] }).where(eq(users.id, userId));
}
