/** Ограничение частоты: true — действие разрешено (окно фиксированное). */
export interface RateLimiter {
  hit(key: string, limit: number, windowMs: number): Promise<boolean>;
  /** Сколько попаданий в текущем окне и когда оно кончится (мс эпохи); null — окна нет. Попадание не засчитывает. */
  peek(key: string): Promise<{ count: number; resetAt: number } | null>;
  /** Обнулить счётчик: следующее попадание открывает новое окно. */
  reset(key: string): Promise<void>;
}

/**
 * Защита одноразовых кодов TOTP от повтора: advance() разрешает шаг, только если он новее
 * последнего использованного этим пользователем.
 */
export interface OneTimeStepStore {
  advance(userId: string, step: number): Promise<boolean>;
}
