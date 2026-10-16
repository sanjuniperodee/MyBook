import crypto from "node:crypto";
import { syncBuiltinESMExports } from "node:module";

/** Время снимков: от него зависят год на титуле, обороте и концовке и даты в метаданных PDF. */
export const FIXED_TIME = Date.parse("2026-05-01T09:00:00Z");

/** Генератор mulberry32: одинаковая последовательность при каждом запуске. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Фиксирует то, что меняется от запуска к запуску: текущее время, часовой пояс и случайные числа
 * (шум фактуры обложки — crypto.randomBytes). Вызывать до импорта рендера; возвращает отмену.
 */
export function freezeRuntime(seed = 1): () => void {
  const real = { Date, random: Math.random, randomBytes: crypto.randomBytes, tz: process.env.TZ };
  const next = seeded(seed);
  // Прокси, а не подкласс: Date() без new тоже работает, а даты, созданные до заморозки, остаются instanceof Date.
  const FrozenDate = new Proxy(real.Date, {
    construct: (target, args, newTarget) => Reflect.construct(target, args.length ? args : [FIXED_TIME], newTarget),
    apply: () => new real.Date(FIXED_TIME).toString(),
    get: (target, prop, receiver) => (prop === "now" ? () => FIXED_TIME : Reflect.get(target, prop, receiver)),
  });
  const randomBytes = (size: number, done?: (err: Error | null, buf: Buffer) => void) => {
    const buf = Buffer.alloc(size);
    for (let i = 0; i < size; i++) buf[i] = Math.floor(next() * 256);
    if (!done) return buf;
    process.nextTick(done, null, buf);
  };
  globalThis.Date = FrozenDate;
  Math.random = next;
  // Именованный импорт `randomBytes` из node:crypto — живая привязка: обновляется через syncBuiltinESMExports.
  Object.assign(crypto, { randomBytes });
  syncBuiltinESMExports();
  process.env.TZ = "UTC";
  return () => {
    globalThis.Date = real.Date;
    Math.random = real.random;
    Object.assign(crypto, { randomBytes: real.randomBytes });
    syncBuiltinESMExports();
    if (real.tz === undefined) delete process.env.TZ;
    else process.env.TZ = real.tz;
  };
}
