/** Ограничение частоты: true — действие разрешено (окно фиксированное). */
export interface RateLimiter {
  hit(key: string, limit: number, windowMs: number): Promise<boolean>;
}

/**
 * Защита одноразовых кодов TOTP от повтора: advance() разрешает шаг, только если он новее
 * последнего использованного этим пользователем.
 */
export interface OneTimeStepStore {
  advance(userId: string, step: number): Promise<boolean>;
}
