import { sql, type AnyColumn, type SQL } from "drizzle-orm";
import { BANK_READY, BANK_TEXT_STEP, BLANK_HALF_WORDS, BLANK_READY_WORDS, BLANK_TEXT_WORDS } from "@/lib/content/kinds";

/**
 * Прогресс книги в SQL — те же правила, что progressOf (lib/content/kinds): фильтры и списки CRM, дашборд,
 * воронка и автописьма считают в базе, а пороги не расходятся с хабом и готовностью к заказу.
 * Слово — как в countWords (trim + split(/\s+/)): непрерывный кусок без пробельных символов JS \s, включая
 * неразрывный пробел и переводы строк. Шаблон уходит параметром запроса — без экранирования в тексте SQL.
 */
export const WORD_PATTERN = "[^\\t\\n\\v\\f\\r \\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff]+";

/** Ссылка на книгу во внешнем запросе (booksId из refs) или её id. */
type BookRef = SQL | string;

/** Есть ли в ответе текст — как answer.trim() в JS (пробелы, переводы строк и неразрывный пробел не в счёт). */
export const hasText = (answer: SQL) => sql<boolean>`(${answer} ~ ${WORD_PATTERN})`;

/** Вопросов (разделов) с текстом в книге. */
export const answeredSql = (book: BookRef) => sql<number>`(select count(*)::int from book_questions q where q.book_id = ${book} and q.answer ~ ${WORD_PATTERN})`;

/** Всего вопросов (разделов) в книге. */
export const totalSql = (book: BookRef) => sql<number>`(select count(*)::int from book_questions q where q.book_id = ${book})`;

/** Слов во всех ответах книги — как сумма countWords по вопросам. */
export const wordsSql = (book: BookRef) => sql<number>`(select count(*)::int from book_questions q, regexp_matches(q.answer, ${WORD_PATTERN}, 'g') w where q.book_id = ${book})`;

interface ProgressCols {
  theme: AnyColumn | SQL;
  answered: SQL;
  total: SQL;
  words: SQL;
}

const isBlank = (theme: ProgressCols["theme"]) => sql`(${theme} = 'blank')`;

/** «Почти готова»: progressOf(...).ready. */
export const readySql = (c: ProgressCols) => sql<boolean>`(case when ${isBlank(c.theme)} then ${c.words} >= ${BLANK_READY_WORDS} else ${c.answered} >= ${BANK_READY} end)`;

/** «Половина» (монотонно: готовая книга — и на половине): progressOf(...).half. */
export const halfSql = (c: ProgressCols) =>
  sql<boolean>`(case when ${isBlank(c.theme)} then ${c.words} >= ${Math.min(BLANK_HALF_WORDS, BLANK_READY_WORDS)} else (${c.total} > 0 and ${c.answered} * 2 >= ${c.total}) or ${c.answered} >= ${BANK_READY} end)`;

/** Шаг «Текст» выполнен (книга не короткая): progressOf(...).textStepDone. */
export const textStepSql = (c: ProgressCols) => sql<boolean>`(case when ${isBlank(c.theme)} then ${c.words} >= ${BLANK_TEXT_WORDS} else ${c.answered} >= ${BANK_TEXT_STEP} end)`;

/**
 * Книга заполнена меньше percent процентов — по той же доле, что полоска в CRM (progressRatio, lib/content/crm-labels):
 * ответы из вопросов, у своей книги — слова до порога «почти готова». Без деления: доля сравнивается умножением, слова
 * считаются только у своей книги (CASE не вычисляет вторую ветку).
 */
export const filledBelowSql = (c: ProgressCols, percent: number) =>
  sql<boolean>`(case when ${isBlank(c.theme)} then ${c.words} * 100 < ${percent * BLANK_READY_WORDS}::int else ${c.answered} * 100 < ${percent}::int * ${c.total} or ${c.total} = 0 end)`;

/** Все показатели книги из внешнего запроса по books: ответы, вопросы, слова. */
export const progressCols = (book: BookRef) => ({ answered: answeredSql(book), total: totalSql(book), words: wordsSql(book) });
