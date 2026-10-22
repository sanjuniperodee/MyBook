import "server-only";
import { messagesFor } from "@/i18n/messages";
import { applyGender } from "@/lib/content/gender";
import { bookKind } from "@/lib/content/kinds";
import { getTheme } from "@/lib/content/themes";
import { getFormat } from "@/lib/book/formats";
import { bookInterior } from "@/lib/book/interiors";
import { estimateChapterPages, sectionPageOffsets, textMetrics } from "@/lib/book/estimate";
import { GALLERY_KEY, sampleToc, tocCandidates } from "@/lib/book/toc";
import { buildBookContent } from "@/lib/book/book-content";
import { printableText } from "@/lib/book/layout";
import { splitParagraphs } from "@/lib/book/inline-photo";
import { photoUrl } from "@/lib/urls";

/** Сколько текста первой главы показывать на развороте: страница всё равно обрезается по полосе набора. */
const SAMPLE_CHARS = 1800;

/**
 * Содержимое для разворотов в выбранном оформлении — на настоящем тексте книги, а пока ответов
 * нет, на примере на языке книги. Общее для вкладок «Страницы» и «Обложка». Форму результата
 * (SpreadSample) объявляет компонент разворота, поэтому её сверяет тип его свойства sample.
 */
export function bookSpreadSample(
  book: Parameters<typeof buildBookContent>[0],
  questions: Parameters<typeof buildBookContent>[1],
  /** Главы своей книги по порядку (у книг с банком — пусто). */
  chapters: Parameters<typeof buildBookContent>[3],
  dedicationPlaceholder: string,
  /** Фото книги: в примерах фотостраниц и начала главы показываем их, а не пейзажи-заглушки. */
  photos: { id: string; width: number; height: number; caption: string }[] = [],
  /** Номера страниц готового макета этой книги (BookBuild.chapterPages: ключи — pageKey оглавления); нет — оценка. */
  realPages?: Record<string, number> | null,
) {
  const format = getFormat(book.format);
  const content = buildBookContent(book, questions, [], chapters);
  const theme = getTheme(book.theme, book.language);
  const t = messagesFor(book.language);
  const kind = bookKind(book.theme);
  // Пример до первых ответов: у подарков — любовная история с лендинга, у автобиографии — рассказ о детстве, у своей книги — нейтральная заглушка.
  const own = kind === "gift" ? null : t.book.sampleByKind[kind];
  const ownEpigraph: string | undefined = own && "epigraph" in own ? String(own.epigraph) : undefined;
  const sample = t.landing.sample;
  const first = content.chapters[0];
  // Пока ответов нет — главы книги: своей книги — её оглавление (текст автора, без подстановки рода), остальных — темы.
  const g = (s: string) => applyGender(s, book.authorGender, book.recipientGender);
  const planned = chapters.length
    ? chapters.map((c) => ({ title: printableText(c.title.trim()) || t.book.untitledChapter, epigraph: printableText(c.epigraph.trim()) || undefined }))
    : theme.chapters.map((c) => ({ title: g(c.title), epigraph: c.epigraph }));
  const firstPlanned = planned[0];

  const entries: { heading: string | null; paragraphs: string[] }[] = [];
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
    const s = own ?? sample;
    entries.push({ heading: s.h1, paragraphs: [s.p1, s.p2] }, { heading: s.h2, paragraphs: [s.p3, s.p4] });
  }

  // Оглавление: все строки, которые могут в него попасть, с номерами страниц — из готового макета, а каких там нет
  // (макет не собран, раздел в оглавлении по главам) — примерными (пока ответов нет — главы темы). Режим и свои
  // названия применяет selectToc — здесь и в редакторе «Страницы», где их меняют на лету.
  const metrics = textMetrics(format, bookInterior(book));
  const start = 3 + (book.dedication.trim() ? 1 : 0) + 1; // титул, оборот, посвящение, оглавление
  const pageOf = new Map<string, number>();
  let page = start;
  for (const c of content.chapters) {
    pageOf.set(c.key, page);
    sectionPageOffsets(c, metrics).forEach((offset, i) => pageOf.set(`q:${c.items[i].id}`, page + offset));
    page += estimateChapterPages(c, metrics);
  }
  pageOf.set(GALLERY_KEY, page);
  for (const [key, n] of Object.entries(realPages ?? {})) if (pageOf.has(key)) pageOf.set(key, n);
  const tocAll = content.chapters.length
    ? tocCandidates(content).map((c) => ({ ...c, page: pageOf.get(c.pageKey) ?? start }))
    : planned.map((c, i) => ({ key: `c:planned-${i}`, pageKey: `planned-${i}`, kind: "chapter" as const, number: i + 1, label: c.title, page: start + i * 6 }));
  const tocMode = book.tocMode ?? "chapters";
  const tocSettings = book.tocLines ?? {};

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
      : kind === "autobiography"
        ? // Пример рассказа о детстве идёт с главой о детстве, а не с «Вместо предисловия» из оглавления.
          { number: 1, title: own!.chapterTitle, epigraph: ownEpigraph }
        : // У главы автора без эпиграфа пример эпиграфа не подставляем: это его текст.
          { number: 1, title: firstPlanned?.title ?? (own ?? sample).chapterTitle, epigraph: chapters.length ? firstPlanned?.epigraph : (firstPlanned?.epigraph ?? (own ? ownEpigraph : sample.epigraph)) },
    entries,
    toc: sampleToc(tocAll, tocMode, tocSettings),
    tocAll,
    tocMode,
    tocLines: tocSettings,
    showToc: book.showToc,
    captions: own?.photos,
    photos: photos.filter((p) => p.id !== book.coverPhotoId).slice(0, 4).map((p) => ({ url: photoUrl(p.id, "full"), width: p.width, height: p.height, caption: p.caption })),
  };
}

