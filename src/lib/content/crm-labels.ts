/**
 * Подписи книг для CRM (внутренний инструмент, русский): вид книги, получатель и прогресс — одинаково в списке
 * книг, карточках клиента, сделки и заказа, поиске. Лёгкий модуль без банков вопросов.
 */
import { BLANK_READY_WORDS, bookKind, type BookKind } from "./kinds";

export interface BookLine {
  theme: string;
  /** Название темы для подарков: «Маме», «Любимому». */
  themeShort: string;
  authorName: string;
  recipientName: string;
}

/** Вид книги словами для менеджера. */
export function kindName(kind: BookKind, themeShort: string): string {
  return kind === "autobiography" ? "Автобиография" : kind === "blank" ? "Своя книга" : themeShort;
}

/**
 * Одна строка о книге: «Маме · Аня → Мария», «Автобиография · рассказчик Иван», «Своя книга · Аня».
 * Стрелка с получателем — только если получатель есть (у автобиографии его нет, у своей книги он необязателен).
 */
export function bookLine(b: BookLine): string {
  const kind = bookKind(b.theme);
  const author = b.authorName.trim();
  const recipient = b.recipientName.trim();
  if (kind === "autobiography") return `Автобиография${author ? ` · рассказчик ${author}` : ""}`;
  return `${kindName(kind, b.themeShort)}${author ? ` · ${author}` : ""}${recipient ? ` → ${recipient}` : ""}`;
}

export interface ProgressNumbers {
  theme: string;
  answered: number;
  total: number;
  words: number;
}

/** Доля заполненности для полоски: ответы из вопросов, у своей книги — слова до порога «почти готова». */
export function progressRatio(p: ProgressNumbers): number {
  if (bookKind(p.theme) === "blank") return Math.min(1, p.words / BLANK_READY_WORDS);
  return p.total ? Math.min(1, p.answered / p.total) : 0;
}

/** Прогресс словами: «12 из 90 ответов» у книг с вопросами, «4 из 5 разделов с текстом · 1250 слов» у своей книги. */
export function progressText(p: ProgressNumbers): string {
  if (bookKind(p.theme) === "blank") return `${p.answered} из ${p.total} разделов с текстом · ${p.words} слов`;
  return `${p.answered} из ${p.total} ответов`;
}

/** Коротко для плотных мест (карточка воронки, таблица): «12/90» или «1250 сл.». */
export function progressShort(p: ProgressNumbers): string {
  return bookKind(p.theme) === "blank" ? `${p.words} сл.` : `${p.answered}/${p.total}`;
}
