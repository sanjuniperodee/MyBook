import { PAGES_TEXT_MAX } from "@mybook/contracts/limits";
/** Своя фраза последней страницы книги (books.end_text) — не длиннее. */
export const END_TEXT_MAX = PAGES_TEXT_MAX.endText;

/**
 * Фраза последней страницы: нет своей (null) — «Продолжение следует…» на языке книги, пустая строка — без фразы
 * (остаются виньетка и год), иначе — своя.
 */
export function endPageText(own: string | null | undefined, fallback: string): string {
  return own == null ? fallback : own.trim();
}
