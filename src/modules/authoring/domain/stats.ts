import { printablePageCount } from "@/lib/book/formats";
import { estimatePages } from "@/lib/book/estimate";
import { countWords, toPhotoItem } from "@/lib/book/layout";
import { buildBookContent } from "@/lib/book/book-content";

export interface BookStats {
  /** Вопросов (у своей книги — разделов) с текстом. */
  answered: number;
  /** Всего вопросов (у своей книги — разделов). */
  total: number;
  photos: number;
  words: number;
  estimatedPages: number;
  printedPages: number;
  /** Своя книга: сколько глав без текста и фото — в книгу они не попадут (у остальных 0). */
  emptyChapters: number;
}

type Args = Parameters<typeof buildBookContent>;

/** Прогресс и объём книги: ответы, слова, оценка страниц (с учётом фото, писем близких и глав своей книги). */
export function computeStats(book: Args[0], questions: (Args[1][number] & { answer: string })[], chapters: Args[3], photos: Parameters<typeof toPhotoItem>[0][], letters: NonNullable<Args[5]>): BookStats {
  const content = buildBookContent(book, questions, photos.map(toPhotoItem), chapters, undefined, letters);
  const answered = questions.filter((q) => q.answer.trim()).length;
  const words = questions.reduce((s, q) => s + countWords(q.answer), 0);
  const estimatedPages = estimatePages(content);
  const printed = new Set(content.chapters.map((c) => c.key));
  const emptyChapters = chapters.filter((c) => !printed.has(c.key)).length;
  return { answered, total: questions.length, photos: photos.length, words, estimatedPages, printedPages: printablePageCount(estimatedPages), emptyChapters };
}
