import "server-only";
import { messagesFor } from "@/i18n/messages";
import { applyGender } from "@/lib/content/gender";
import { getTheme } from "@/lib/content/themes";
import { getFormat } from "@/lib/book/formats";
import { getInteriorDesign } from "@/lib/book/interiors";
import { buildBookContent, estimateChapterPages, textMetrics } from "@/lib/book/layout";
import { splitParagraphs } from "@/lib/book/inline-photo";
import type { SpreadSample } from "@/components/interior/InteriorSpread";
import { photoUrl } from "@/lib/urls";

/** Сколько текста первой главы показывать на развороте: страница всё равно обрезается по полосе набора. */
const SAMPLE_CHARS = 1800;

/**
 * Содержимое для разворотов в выбранном оформлении — на настоящем тексте книги, а пока ответов
 * нет, на примере на языке книги. Общее для вкладок «Страницы» и «Обложка».
 */
export function bookSpreadSample(
  book: Parameters<typeof buildBookContent>[0],
  questions: Parameters<typeof buildBookContent>[1],
  dedicationPlaceholder: string,
  /** Фото книги: в примерах фотостраниц и начала главы показываем их, а не пейзажи-заглушки. */
  photos: { id: string; width: number; height: number; caption: string }[] = [],
): SpreadSample {
  const format = getFormat(book.format);
  const content = buildBookContent(book, questions, []);
  const theme = getTheme(book.theme, book.language);
  const sample = messagesFor(book.language).landing.sample;
  const first = content.chapters[0];
  const firstThemeChapter = theme.chapters[0];

  const entries: SpreadSample["entries"] = [];
  if (first) {
    let budget = SAMPLE_CHARS;
    for (const it of first.items) {
      const paragraphs: string[] = [];
      for (const p of splitParagraphs(it.answer)) {
        if (budget <= 0) break;
        paragraphs.push(p);
        budget -= p.length;
      }
      if (paragraphs.length) entries.push({ heading: it.heading, paragraphs });
      if (budget <= 0) break;
    }
  } else {
    entries.push({ heading: sample.h1, paragraphs: [sample.p1, sample.p2] }, { heading: sample.h2, paragraphs: [sample.p3, sample.p4] });
  }

  // Оглавление: главы книги с примерными номерами страниц (пока ответов нет — главы темы).
  const metrics = textMetrics(format, getInteriorDesign(book.interior).type);
  let page = 3 + (book.dedication.trim() ? 1 : 0) + 1; // титул, оборот, посвящение, оглавление
  const toc = content.chapters.length
    ? content.chapters.slice(0, 10).map((c) => {
        const entry = { number: c.number, title: c.title, page };
        page += estimateChapterPages(c, metrics, format);
        return entry;
      })
    : theme.chapters.slice(0, 10).map((c, i) => ({ number: i + 1, title: applyGender(c.title, book.authorGender, book.recipientGender), page: page + i * 6 }));

  return {
    language: book.language,
    title: content.title,
    subtitle: book.subtitle.trim(),
    author: book.authorName.trim(),
    year: content.year,
    dedication: book.dedication.trim(),
    dedicationPlaceholder,
    chapter: first
      ? { number: 1, title: first.title, epigraph: first.epigraph }
      : { number: 1, title: applyGender(firstThemeChapter?.title ?? sample.chapterTitle, book.authorGender, book.recipientGender), epigraph: firstThemeChapter?.epigraph ?? sample.epigraph },
    entries,
    toc,
    showToc: book.showToc,
    photos: photos.filter((p) => p.id !== book.coverPhotoId).slice(0, 4).map((p) => ({ url: photoUrl(p.id, "full"), width: p.width, height: p.height, caption: p.caption })),
  };
}
