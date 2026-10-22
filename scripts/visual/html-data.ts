import type { SpreadKind, SpreadSample } from "@/components/interior/InteriorSpread";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { backContent, backPhotoIds, type BackContent } from "@/lib/book/cover-back";
import type { PhotoSpec } from "@/lib/book/covers/svg-kit";
import { editorModel } from "@/lib/book/editor-data";
import { groupByChapter, previewChapters, type PreviewChapter } from "@/lib/book/editor-model";
import { backPhotoRefs } from "@/lib/book/photo-refs";
import { bookSpreadSample } from "@/server/spreadSample";
import type { FixtureBook } from "../../tests/fixtures/books";

/**
 * Данные стенда html-snapshot — так же, как их готовят страницы сайта: развороты InteriorSpread —
 * bookSpreadSample (books/[id]/pages), превью PagePreview — editorPreview (те же editorModel и previewChapters
 * из lib/book/editor-model, что у books/[id]/questions и QuestionsEditor), оборот CoverBackPreview — backData
 * (как редактор обложки books/[id]/cover). Полос 3D-книги здесь нет: это картинки PDF, их сверяет pdf-snapshot.
 * Строятся в Node (время заморожено — год на развороте и обороте), в браузер уходят JSON.
 */

/** Все виды разворота: TypeScript требует перечислить каждый SpreadKind. */
const spreadKinds = Object.keys({ chapter: true, front: true, toc: true, photos: true } satisfies Record<SpreadKind, true>) as SpreadKind[];

/** Ширина стенда, px: разворот (две полосы); полоса превью, оборот обложки. */
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
  ({ kind: SpreadKind; sample: SpreadSample } | { kind: "preview"; preview: PreviewData } | { kind: "back"; back: BackData });

/** Превью редактора: вопросы и главы — тем же кодом, что страница books/[id]/questions и QuestionsEditor (lib/book/editor-model). */
function editorPreview({ book, questions, chapters: ownChapters, photos }: FixtureBook["bundle"]): PreviewData {
  const model = editorModel(book, questions, ownChapters, photos);
  // Текущий вопрос — первый: в превью попадает даже пустым, остальные — с ответом или фото.
  const currentId = model.questions[0].id;
  const chapters = previewChapters(groupByChapter(model.questions, book.theme === "blank" ? model.chapters : undefined), model.photos, model.epigraphs, currentId);
  return { language: book.language, bookTitle: book.title, chapters, currentId };
}

/** Оборот, как в редакторе обложки (CoverEditor): содержимое — те же поля, что backContent (год — из occasionDate или текущий), фото — backPhotoRefs. */
function backData({ book, photos }: FixtureBook["bundle"]): BackData {
  const list = backPhotoIds(book).flatMap((id) => photos.filter((p) => p.id === id));
  return { template: book.coverTemplate, content: backContent(book, list.map((p) => ({ width: p.width, height: p.height })), new Date()), photos: backPhotoRefs(list, book, "view") };
}

export function standViews(fixture: FixtureBook): StandView[] {
  const { book, questions, chapters, photos } = fixture.bundle;
  const base = { locale: book.language, format: book.format, interior: book.interior };
  const sample = bookSpreadSample(book, questions, chapters, messagesFor(book.language).books.pages.dedicationEmpty, photos);
  const view = (kind: string) => ({ ...base, key: `html:${kind}:${fixture.key}`, width: PAGE_WIDTH });
  return [
    ...spreadKinds.map((kind) => ({ ...view(kind), width: SPREAD_WIDTH, kind, sample })),
    { ...view("preview"), kind: "preview" as const, preview: editorPreview(fixture.bundle) },
    { ...view("back"), kind: "back" as const, back: backData(fixture.bundle) },
  ];
}
