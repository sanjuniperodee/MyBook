import { printablePageCount } from "@/lib/book/formats";
import { buildBookContent, estimatePages, toPhotoItem } from "@/lib/book/layout";

export interface BookStats {
  answered: number;
  total: number;
  photos: number;
  words: number;
  estimatedPages: number;
  printedPages: number;
}

type Args = Parameters<typeof buildBookContent>;

/** Прогресс и объём книги: ответы, слова, оценка страниц (с учётом фото и писем близких). */
export function computeStats(book: Args[0], questions: (Args[1][number] & { answer: string })[], photos: Parameters<typeof toPhotoItem>[0][], letters: NonNullable<Args[4]>): BookStats {
  const content = buildBookContent(book, questions, photos.map(toPhotoItem), undefined, letters);
  const answered = questions.filter((q) => q.answer.trim()).length;
  const words = questions.reduce((s, q) => s + (q.answer.trim() ? q.answer.trim().split(/\s+/).length : 0), 0);
  const estimatedPages = estimatePages(content);
  return { answered, total: questions.length, photos: photos.length, words, estimatedPages, printedPages: printablePageCount(estimatedPages) };
}
