import "server-only";

/**
 * Не больше limit задач одновременно, остальные ждут по очереди. Завершившаяся задача передаёт свой слот следующей
 * из очереди напрямую: иначе между освобождением и пробуждением ждущей слот успевала занять новая задача — сверх limit.
 */
export function slots(limit: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async function run<T>(fn: () => Promise<T>): Promise<T> {
    if (active < limit) active++;
    else await new Promise<void>((resolve) => waiting.push(resolve));
    try {
      return await fn();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  };
}

/**
 * Ограничение параллельной генерации PDF: вёрстка большой книги занимает сотни мегабайт памяти,
 * поэтому одновременно выполняется не больше PDF_CONCURRENCY задач (по умолчанию 1), остальные ждут.
 * Две параллельные сборки (блок и читательская версия одного заказа) выводили процесс за лимит памяти PM2 → 502.
 */
export const withRenderSlot = slots(Math.max(1, Number(process.env.PDF_CONCURRENCY ?? 1)));

const inflight = new Map<string, Promise<unknown>>();

/** Склеивает одинаковые одновременные задачи (например, два клика «скачать» по одному заказу). */
export function dedupe<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;
  const p = fn().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}
