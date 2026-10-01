import type { Metadata } from "next";
import { requireUser } from "@/server/auth";
import { getAccessibleBook } from "@/server/books";
import { container } from "@/server/container";
import { getLocale, getMessages } from "@/i18n/server";
import { messagesFor } from "@/i18n/messages";
import { coverName } from "@/i18n/labels";
import { applyGender } from "@/lib/content/gender";
import { getTheme } from "@/lib/content/themes";
import { getFormat } from "@/lib/book/formats";
import { getInteriorDesign, interiorsForCover } from "@/lib/book/interiors";
import { buildBookContent, estimateChapterPages, textMetrics } from "@/lib/book/layout";
import { splitParagraphs } from "@/lib/book/inline-photo";
import type { SpreadSample } from "@/components/interior/InteriorSpread";
import { PagesEditor } from "./PagesEditor";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).books.pages.meta };
}

/** Сколько текста первой главы показывать на развороте: страница всё равно обрезается по полосе набора. */
const SAMPLE_CHARS = 1800;

export default async function PagesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/books/${id}/pages`);
  const book = await getAccessibleBook(id, user);
  const [questions, m, locale] = await Promise.all([container().authoring.queries.questions(book.id), getMessages(), getLocale()]);
  const t = m.books.pages;
  const format = getFormat(book.format);

  // Разворот показываем на настоящем тексте книги; пока ответов нет — на примере на языке книги.
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

  const spreadSample: SpreadSample = {
    language: book.language,
    title: content.title,
    subtitle: book.subtitle.trim(),
    author: book.authorName.trim(),
    year: content.year,
    dedication: book.dedication.trim(),
    dedicationPlaceholder: t.dedicationEmpty,
    chapter: first
      ? { number: 1, title: first.title, epigraph: first.epigraph }
      : { number: 1, title: applyGender(firstThemeChapter?.title ?? sample.chapterTitle, book.authorGender, book.recipientGender), epigraph: firstThemeChapter?.epigraph ?? sample.epigraph },
    entries,
    toc,
    showToc: book.showToc,
  };

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="mb-8 font-serif text-4xl font-medium sm:text-5xl">{t.title}</h1>
      <PagesEditor
        bookId={book.id}
        format={format.id}
        editable={book.status === "draft"}
        sample={spreadSample}
        cover={{ name: coverName(book.coverTemplate, locale), pairs: interiorsForCover(book.coverTemplate).map((d) => d.id) }}
        initial={{ interior: getInteriorDesign(book.interior).id, dedication: book.dedication, showToc: book.showToc, photoPlacement: book.photoPlacement }}
      />
    </main>
  );
}
