import "server-only";

/**
 * Ограничение параллельной генерации PDF: вёрстка большой книги занимает сотни мегабайт памяти,
 * поэтому одновременно выполняется не больше PDF_CONCURRENCY задач (по умолчанию 2), остальные ждут.
 */
const limit = Math.max(1, Number(process.env.PDF_CONCURRENCY ?? 2));
let active = 0;
const waiting: (() => void)[] = [];

export async function withRenderSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= limit) await new Promise<void>((resolve) => waiting.push(resolve));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

const inflight = new Map<string, Promise<unknown>>();

/** Склеивает одинаковые одновременные задачи (например, два клика «скачать» по одному заказу). */
export function dedupe<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;
  const p = fn().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}
