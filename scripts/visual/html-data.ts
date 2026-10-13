import type { PreviewChapter } from "@/components/editor/PagePreview";
import type { SpreadKind, SpreadSample } from "@/components/interior/InteriorSpread";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { applyGender } from "@/lib/content/gender";
import { chapterTitle, getTheme } from "@/lib/content/themes";
import { photoUrl } from "@/lib/urls";
import { bookSpreadSample } from "@/server/spreadSample";
import type { FixtureBook } from "../../tests/fixtures/books";

/**
 * Данные стенда html-snapshot — так же, как их готовят страницы сайта: развороты InteriorSpread —
 * bookSpreadSample (books/[id]/pages), превью PagePreview — главы из books/[id]/questions и QuestionsEditor.
 * Строятся в Node (время заморожено — год на развороте), в браузер уходят JSON.
 */

/** Все виды разворота: TypeScript требует перечислить каждый SpreadKind. */
const spreadKinds = Object.keys({ chapter: true, front: true, toc: true, photos: true } satisfies Record<SpreadKind, true>) as SpreadKind[];

/** Ширина стенда, px: разворот (две полосы) и полоса превью. */
const SPREAD_WIDTH = 960;
const PREVIEW_WIDTH = 480;

interface ViewBase {
  /** Ключ манифеста: html:<вид>:<книга>. */
  key: string;
  /** Язык интерфейса (I18nProvider) — язык книги. */
  locale: Locale;
  format: string;
  interior: string;
  width: number;
}

export interface PreviewData {
  language: Locale;
  bookTitle: string;
  chapters: PreviewChapter[];
  currentId: string;
}

export type StandView = ViewBase & ({ kind: SpreadKind; sample: SpreadSample } | { kind: "preview"; preview: PreviewData });

/** Главы превью: как questions/page.tsx (заголовки и главы с учётом рода) и QuestionsEditor (кто попадает в превью). */
function previewData({ book, questions, photos }: FixtureBook["bundle"]): PreviewData {
  const theme = getTheme(book.theme, book.language);
  const g = (s: string) => applyGender(s, book.authorGender, book.recipientGender);
  const epigraphs = new Map(theme.chapters.map((c) => [c.key, c.epigraph]));
  const own = photos.filter((p) => p.id !== book.coverPhotoId);
  // Текущий вопрос — первый: в превью попадает даже пустым, остальные — с ответом или фото.
  const currentId = questions[0].id;
  const groups: { key: string; items: typeof questions }[] = [];
  for (const q of questions) {
    const last = groups.at(-1);
    if (last?.key === q.chapter) last.items.push(q);
    else groups.push({ key: q.chapter, items: [q] });
  }
  const chapters: PreviewChapter[] = [];
  for (const { key, items } of groups) {
    const entries = items
      .map((q) => ({ q, ph: own.filter((p) => p.questionId === q.id) }))
      .filter(({ q, ph }) => q.id === currentId || q.answer.trim() || ph.length)
      .map(({ q, ph }) => ({
        id: q.id,
        heading: q.hideHeading ? null : (q.displayText ?? g(q.title)),
        answer: q.answer,
        photos: ph.map((p) => ({ id: p.id, url: photoUrl(p.id), width: p.width, height: p.height, caption: p.caption, inline: p.inline })),
      }));
    if (entries.length) chapters.push({ key, number: chapters.length + 1, title: g(chapterTitle(theme, key, book.language)), epigraph: epigraphs.get(key), entries });
  }
  return { language: book.language, bookTitle: book.title, chapters, currentId };
}

export function standViews(fixture: FixtureBook): StandView[] {
  const { book, questions, photos } = fixture.bundle;
  const base = { locale: book.language, format: book.format, interior: book.interior };
  const sample = bookSpreadSample(book, questions, messagesFor(book.language).books.pages.dedicationEmpty, photos);
  return [
    ...spreadKinds.map((kind) => ({ ...base, key: `html:${kind}:${fixture.key}`, width: SPREAD_WIDTH, kind, sample })),
    { ...base, key: `html:preview:${fixture.key}`, width: PREVIEW_WIDTH, kind: "preview" as const, preview: previewData(fixture.bundle) },
  ];
}
