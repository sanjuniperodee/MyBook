import type { FlipbookData } from "@/components/book3d/pages";
import type { PreviewChapter } from "@/components/editor/PagePreview";
import type { SpreadKind, SpreadSample } from "@/components/interior/InteriorSpread";
import { site } from "@/config/site";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { backContent, backPhotoIds, type BackContent } from "@/lib/book/cover-back";
import type { PhotoSpec } from "@/lib/book/cover-kit";
import { coverNamesLine, coverPhotoIds } from "@/lib/book/covers";
import { printablePageCount } from "@/lib/book/formats";
import { splitParagraphs } from "@/lib/book/inline-photo";
import { buildBookContent, estimatePages, photoPages, toPhotoItem, type PhotoItem } from "@/lib/book/layout";
import { backPhotoRefs, coverPhotoRefs } from "@/lib/book/photo-refs";
import { applyGender } from "@/lib/content/gender";
import { chapterTitle, getTheme } from "@/lib/content/themes";
import { photoUrl } from "@/lib/urls";
import { bookSpreadSample } from "@/server/spreadSample";
import type { FixtureBook } from "../../tests/fixtures/books";

/**
 * Данные стенда html-snapshot — так же, как их готовят страницы сайта: развороты InteriorSpread —
 * bookSpreadSample (books/[id]/pages), превью PagePreview — editorPreview (копия из books/[id]/questions и
 * QuestionsEditor), полосы 3D-книги — flipbookData (копия из books/[id]/preview), оборот CoverBackPreview —
 * backData (как редактор обложки books/[id]/cover). Строятся в Node (время заморожено — год на развороте
 * и обороте), в браузер уходят JSON.
 */

/** Все виды разворота: TypeScript требует перечислить каждый SpreadKind. */
const spreadKinds = Object.keys({ chapter: true, front: true, toc: true, photos: true } satisfies Record<SpreadKind, true>) as SpreadKind[];

/** Ширина стенда, px: разворот (две полосы); полоса превью и 3D-книги, оборот обложки. */
const SPREAD_WIDTH = 960;
const PAGE_WIDTH = 480;

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

export interface BackData {
  template: string;
  content: BackContent;
  photos: PhotoSpec[];
}

export type StandView = ViewBase &
  ({ kind: SpreadKind; sample: SpreadSample } | { kind: "preview"; preview: PreviewData } | { kind: "flipbook"; flipbook: FlipbookData } | { kind: "back"; back: BackData });

/**
 * Превью редактора. Копия, перевести на экспорт из src в первом коммите C7/D1: маппинг глав в src не экспортирован —
 * заголовки глав и вопросов с учётом рода, эпиграфы и фото без обложки — из books/[id]/questions/page.tsx,
 * группы глав подряд и кто попадает в превью (текущий вопрос, ответы и вопросы с фото) — из QuestionsEditor.
 */
function editorPreview({ book, questions, photos }: FixtureBook["bundle"]): PreviewData {
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

/**
 * Листаемая книга. Копия, перевести на экспорт из src в первом коммите C7/D1: FlipbookData собирается прямо
 * в books/[id]/preview/page.tsx — из тех же данных, что PDF: ответы, фото в ответах, фотостраницы, галерея, письма.
 */
function flipbookData({ book, questions, photos: allPhotos, letters }: FixtureBook["bundle"]): FlipbookData {
  const content = buildBookContent(book, questions, allPhotos.map(toPhotoItem), undefined, letters ?? []);
  const backPhotos = backPhotoIds(book).flatMap((id) => allPhotos.filter((p) => p.id === id));
  const names = coverNamesLine(book.authorName, book.recipientName, book.hideRecipientOnCover);
  const photos = coverPhotoRefs(coverPhotoIds(book), allPhotos, book, "view");
  const pagePhoto = (p: PhotoItem) => ({ id: p.id, url: photoUrl(p.id, "view"), width: p.width, height: p.height, caption: p.caption, layout: p.layout });
  return {
    cover: { template: book.coverTemplate, format: book.format, title: book.title, subtitle: book.subtitle, names, photos },
    language: content.language,
    formatId: content.format.id,
    interiorId: content.interior.id,
    title: content.title,
    subtitle: content.subtitle,
    author: content.authorName,
    year: content.year,
    dedication: content.dedication,
    showToc: content.showToc,
    model: {
      pageCount: printablePageCount(estimatePages(content)),
      brand: site.name.toUpperCase(),
      back: backContent(book, backPhotos.map((p) => ({ width: p.width, height: p.height })), new Date()),
      backPhotos: backPhotoRefs(backPhotos, book, "view"),
    },
    chapters: content.chapters.map((c) => ({
      number: c.number,
      title: c.title,
      epigraph: c.epigraph,
      openerPhoto: c.openerPhoto ? photoUrl(c.openerPhoto.id, "view") : undefined,
      entries: c.items.flatMap((it) => {
        const paragraphs = splitParagraphs(it.answer);
        const inline = (it.photos ?? []).map((p) => ({ id: p.id, url: photoUrl(p.id, "view"), width: p.width, height: p.height, caption: p.caption, inline: p.inline }));
        return paragraphs.length || inline.length ? [{ heading: it.heading, paragraphs, photos: inline }] : [];
      }),
      photoPages: photoPages(c.photos).map((group) => group.map(pagePhoto)),
    })),
    gallery: content.galleryPhotos.length ? { title: messagesFor(content.language).book.gallery, pages: photoPages(content.galleryPhotos).map((group) => group.map(pagePhoto)) } : undefined,
  };
}

/** Оборот, как в редакторе обложки (CoverEditor): содержимое — те же поля, что backContent (год — из occasionDate или текущий), фото — backPhotoRefs. */
function backData({ book, photos }: FixtureBook["bundle"]): BackData {
  const list = backPhotoIds(book).flatMap((id) => photos.filter((p) => p.id === id));
  return { template: book.coverTemplate, content: backContent(book, list.map((p) => ({ width: p.width, height: p.height })), new Date()), photos: backPhotoRefs(list, book, "view") };
}

export function standViews(fixture: FixtureBook): StandView[] {
  const { book, questions, photos } = fixture.bundle;
  const base = { locale: book.language, format: book.format, interior: book.interior };
  const sample = bookSpreadSample(book, questions, messagesFor(book.language).books.pages.dedicationEmpty, photos);
  const view = (kind: string) => ({ ...base, key: `html:${kind}:${fixture.key}`, width: PAGE_WIDTH });
  return [
    ...spreadKinds.map((kind) => ({ ...view(kind), width: SPREAD_WIDTH, kind, sample })),
    { ...view("preview"), kind: "preview" as const, preview: editorPreview(fixture.bundle) },
    { ...view("flipbook"), kind: "flipbook" as const, flipbook: flipbookData(fixture.bundle) },
    { ...view("back"), kind: "back" as const, back: backData(fixture.bundle) },
  ];
}
