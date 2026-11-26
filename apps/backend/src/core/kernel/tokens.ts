/**
 * Порты общего ядра (src/shared/application): одна единица работы с outbox, часы и лимиты частоты на процесс.
 * Токены — символы: зависимость объявляется от интерфейса, а не от класса реализации (ADR 0014, правило 6).
 */
export const UNIT_OF_WORK = Symbol("UnitOfWork");
export const CLOCK = Symbol("Clock");
export const RATE_LIMITER = Symbol("RateLimiter");
