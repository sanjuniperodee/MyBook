import { bookKind } from "../content/kinds";

/** Глава на хабе книги: сколько в ней разделов (вопросов), сколько с текстом и куда вести ссылку. */
export interface HubChapter {
  key: string;
  title: string;
  total: number;
  answered: number;
  /** Первый раздел главы по порядку. */
  firstId: string | null;
  /** Первый раздел без текста. */
  firstOpenId: string | null;
}

/**
 * Главы хаба. У книг с банком — по порядку вопросов; у своей книги — по таблице глав, включая пустые
 * (иначе новая глава без разделов не появилась бы на хабе); разделы потерянной главы идут в конце.
 */
export function hubChapters(
  theme: string,
  ownChapters: { key: string }[],
  questions: { id: string; chapter: string; answer: string }[],
  titleOf: (key: string) => string,
): HubChapter[] {
  const rows = new Map<string, HubChapter>();
  const rowOf = (key: string) => {
    let ch = rows.get(key);
    if (!ch) rows.set(key, (ch = { key, title: titleOf(key), total: 0, answered: 0, firstId: null, firstOpenId: null }));
    return ch;
  };
  if (bookKind(theme) === "blank") for (const ch of ownChapters) rowOf(ch.key);
  for (const q of questions) {
    const ch = rowOf(q.chapter);
    ch.total++;
    ch.firstId ??= q.id;
    if (q.answer.trim()) ch.answered++;
    else ch.firstOpenId ??= q.id;
  }
  return [...rows.values()];
}

/** Адрес раздела в редакторе — по id: после перестановок номер в адресе указывал бы на другой раздел. */
export const sectionHref = (bookId: string, sectionId: string | null) => (sectionId ? `/books/${bookId}/questions?s=${sectionId}` : `/books/${bookId}/questions`);
