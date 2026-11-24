/**
 * Очередь по ключу внутри процесса: работы с одним ключом идут строго одна за другой, с разными — параллельно.
 * Для «найти или создать», которое иначе гоняется само с собой (два сообщения клиента в одну секунду — две заявки).
 */
export function keyedLock() {
  const tails = new Map<string, Promise<unknown>>();
  return async function withLock<T>(key: string, work: () => Promise<T>): Promise<T> {
    const prev = tails.get(key) ?? Promise.resolve();
    const run = prev.then(work, work);
    const tail = run.catch(() => {});
    tails.set(key, tail);
    try {
      return await run;
    } finally {
      // Последний в очереди убирает ключ, чтобы карта не росла.
      if (tails.get(key) === tail) tails.delete(key);
    }
  };
}
