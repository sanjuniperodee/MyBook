/** Время — зависимость (в тестах подменяется фиксированными часами). */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };
