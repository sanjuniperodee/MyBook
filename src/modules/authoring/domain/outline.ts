/**
 * Оглавление своей книги (тема blank): главы из book_chapters и разделы — строки book_questions. Инвариант после
 * каждой операции: позиции глав 0..M-1, позиции разделов 0..N-1 подряд по главам в их порядке (§1.6).
 */

export interface OutlineChapter {
  key: string;
  title: string;
  epigraph: string;
  position: number;
}

export interface OutlineSection {
  id: string;
  chapter: string;
  position: number;
}

/** Ответ операций оглавления: актуальные главы и разделы по порядку — клиент применяет их как истину. */
export interface Outline {
  chapters: OutlineChapter[];
  sections: OutlineSection[];
}

/** Тот же набор без повторов: перестановка присылает полный порядок, а не изменение. */
export function sameSet(given: readonly string[], current: readonly string[]): boolean {
  if (given.length !== current.length) return false;
  const set = new Set(given);
  return set.size === given.length && current.every((x) => set.has(x));
}

/** Ключи глав с новой главой после afterKey (null — в конец). */
export function insertKey(keys: readonly string[], key: string, afterKey: string | null): string[] {
  const at = afterKey === null ? keys.length : keys.indexOf(afterKey) + 1;
  return [...keys.slice(0, at), key, ...keys.slice(at)];
}
