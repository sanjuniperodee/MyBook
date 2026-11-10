/** Своя фраза последней страницы книги (books.end_text) — не длиннее. */
export const END_TEXT_MAX = 120;

/**
 * Фраза последней страницы: нет своей (null) — «Продолжение следует…» на языке книги, пустая строка — без фразы
 * (остаются виньетка и год), иначе — своя.
 */
export function endPageText(own: string | null | undefined, fallback: string): string {
  return own == null ? fallback : own.trim();
}
