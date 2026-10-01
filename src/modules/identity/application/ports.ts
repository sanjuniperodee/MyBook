import type { Locale } from "@/i18n/config";

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, hash: string): Promise<boolean>;
}

/** Случайные токены (сессии, сброс пароля) и их хэши для хранения. */
export interface TokenService {
  newToken(): string;
  hash(token: string): string;
}

/** Шифрование секретов (TOTP) ключом приложения. */
export interface SecretCipher {
  encrypt(plain: string): string;
  decrypt(encrypted: string): string | null;
}

export interface PasswordResetMailer {
  send(input: { email: string; name: string; token: string; locale: Locale }): Promise<void>;
}

/** Адреса, которым права администратора выдаются после подтверждения почты (ADMIN_EMAILS). */
export interface AdminEmailsPolicy {
  isAdminEmail(email: string): boolean;
}
