/** Журнал действий сотрудников. */
export interface AuditLog {
  record(entry: { actorId: string | null; action: string; entity: string; entityId?: string | null; details?: Record<string, unknown> }): Promise<void>;
}

/** Хранилище правил безопасности (настройки CRM). */
export interface SecuritySettingsStore {
  load(): Promise<{ allowlist: string; require2fa: boolean }>;
  save(input: { allowlist: string; require2fa: boolean }, actorId: string): Promise<void>;
}

/** Учётные записи (контекст Identity): создание аккаунта сотрудника, пароль, сессии. */
export interface AccountGateway {
  create(input: { email: string; name: string; password: string }): Promise<string>;
  setPassword(userId: string, password: string): Promise<void>;
  revokeSessions(userId: string): Promise<void>;
  resetTwoFactor(userId: string): Promise<void>;
}

export interface PasswordGenerator {
  generate(): string;
}
