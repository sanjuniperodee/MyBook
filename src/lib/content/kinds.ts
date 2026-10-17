/**
 * Виды книг: подарок по теме (любимому, маме, папе, другу), автобиография и своя книга с чистого листа (blank).
 * Вид — это тема книги (books.theme). Лёгкий модуль без банков вопросов: его импортируют клиентские компоненты,
 * сервер, CRM и SQL-отчёты (пороги прогресса — здесь же, одни на всех: shared/infrastructure/db/bookProgress.ts).
 */

export type BookKind = "gift" | "autobiography" | "blank";

/** Вид книги по теме: всё, что не автобиография и не своя книга, — подарок (в том числе незнакомые старые строки). */
export function bookKind(theme: string): BookKind {
  return theme === "autobiography" || theme === "blank" ? theme : "gift";
}

/** Нужен ли получатель: у подарка — обязателен, у своей книги — по желанию, у автобиографии его нет (это посвящение). */
export type RecipientPolicy = "required" | "optional" | "none";

export function recipientPolicy(theme: string): RecipientPolicy {
  const kind = bookKind(theme);
  return kind === "gift" ? "required" : kind === "blank" ? "optional" : "none";
}

/** Вопросы банка копируются в книгу при создании (у своей книги их нет). */
export const hasQuestionBank = (theme: string) => bookKind(theme) !== "blank";

/** Свои главы и разделы: оглавление ведёт сам автор (только своя книга). */
export const hasOutline = (theme: string) => bookKind(theme) === "blank";

// ─── лимиты своей книги (§1.9) ──────────────────────────────────────────────

export const MAX_CHAPTERS = 50;
export const CHAPTER_TITLE_MAX = 120;
export const CHAPTER_EPIGRAPH_MAX = 300;
export const SECTION_TITLE_MAX = 200;
export const SECTION_PROMPT_MAX = 300;
/** «Кто записал со слов» у автобиографии. */
export const RECORDED_BY_MAX = 80;

// ─── прогресс (§3.1) ────────────────────────────────────────────────────────

/** Книга с банком: шаг «Текст» засчитан и книга «не короткая» — от стольких ответов. */
export const BANK_TEXT_STEP = 10;
/** Книга с банком «почти готова» — от стольких ответов. */
export const BANK_READY = 25;
/** Своя книга: шаг «Текст» и «не короткая» — от стольких слов. */
export const BLANK_TEXT_WORDS = 1000;
/** Своя книга: «половина» — от стольких слов. */
export const BLANK_HALF_WORDS = 1500;
/** Своя книга «почти готова» — от стольких слов. */
export const BLANK_READY_WORDS = 3000;

export interface ProgressInput {
  /** Вопросов или разделов с текстом. */
  answered: number;
  /** Всего вопросов или разделов. */
  total: number;
  /** Слов во всех ответах. */
  words: number;
}

export interface BookProgress {
  /** Начата: есть хотя бы один ответ. */
  started: boolean;
  /** Половина: ответов не меньше половины вопросов (своя книга — по словам). */
  half: boolean;
  /** Почти готова. */
  ready: boolean;
  /** Шаг «Текст» на хабе выполнен. */
  textStepDone: boolean;
  /** Начата, но пока совсем короткая — предупреждение при заказе. */
  short: boolean;
}

/**
 * Прогресс книги — одна функция для хаба, готовности к заказу, воронки CRM, автописем, фильтров и дашборда
 * (в SQL — те же пороги, bookProgress.ts). Монотонна: «почти готова» ⇒ «половина» ⇒ «начата» — у любимому
 * (172 вопроса) готовность наступает раньше половины, и без этого веха «половина» не наступила бы никогда.
 */
export function progressOf(kind: BookKind, p: ProgressInput): BookProgress {
  const blank = kind === "blank";
  const ready = blank ? p.words >= BLANK_READY_WORDS : p.answered >= BANK_READY;
  const half = ready || (blank ? p.words >= BLANK_HALF_WORDS : p.total > 0 && p.answered * 2 >= p.total);
  const started = half || p.answered > 0;
  const textStepDone = blank ? p.words >= BLANK_TEXT_WORDS : p.answered >= BANK_TEXT_STEP;
  return { started, half, ready, textStepDone, short: started && !textStepDone };
}

/** Сменилась ли хотя бы одна веха прогресса — тогда отправляется событие book_progressed. */
export function progressChanged(kind: BookKind, before: ProgressInput, after: ProgressInput): boolean {
  const a = progressOf(kind, before);
  const b = progressOf(kind, after);
  return a.started !== b.started || a.half !== b.half || a.ready !== b.ready || a.textStepDone !== b.textStepDone;
}
