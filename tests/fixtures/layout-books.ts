import { buildBookContent } from "@/lib/book/book-content";
import { toPhotoItem, type LetterLike, type QuestionLike } from "@/lib/book/layout";
import type { LayoutBundle, LayoutPhoto, PhotoPinChange } from "@/modules/authoring/application/layout-rev2";

// Маленькие книги для правил раскладки фото (layout_rev) и их перевода: своя книга (главы — по списку ключей), строки
// фото с позициями — как их отдаёт база.

export const YEAR = 2026;

export const layoutPhoto = (id: string, position: number, p: Partial<LayoutPhoto> = {}): LayoutPhoto => ({
  id,
  position,
  caption: "",
  layout: "full",
  width: 1200,
  height: 900,
  storageKey: `photos/b1/${id}.jpg`,
  thumbKey: `photos/b1/${id}_thumb.jpg`,
  questionId: null,
  inline: null,
  crop: null,
  chapter: null,
  opener: false,
  ...p,
});

export const layoutQuestion = (id: string, chapter: string, position: number, answer = "Текст истории."): QuestionLike => ({
  id,
  chapter,
  position,
  title: `История ${id}`,
  displayText: null,
  hideHeading: false,
  answer,
  questionKey: "custom",
  media: [],
  pageBreak: false,
});

/** Книга: главы по ключам (у каждой — история с текстом, если не дан свой список вопросов), фото, оформление и обложка. */
export function layoutBundle(opts: { chapters: string[]; photos: LayoutPhoto[]; questions?: QuestionLike[]; book?: Partial<LayoutBundle["book"]>; letters?: LetterLike[] }): LayoutBundle {
  return {
    book: {
      id: "b1",
      status: "draft",
      theme: "blank",
      language: "ru",
      title: "Наша книга",
      subtitle: "",
      authorName: "Алия",
      authorGender: "f",
      recordedBy: "",
      recipientName: "",
      recipientGender: "m",
      dedication: "",
      interior: "photobook",
      format: "a5",
      photoPlacement: "chapters",
      showToc: true,
      coverPhotoId: null,
      coverPhotoExtra: [],
      backPhotoId: null,
      backPhotoExtra: [],
      layoutRev: 1,
      tocMode: "chapters",
      tocLines: {},
      ...opts.book,
    },
    questions: opts.questions ?? opts.chapters.map((key, i) => layoutQuestion(`q-${key}`, key, i)),
    chapters: opts.chapters.map((key) => ({ key, title: `Глава ${key}`, epigraph: "" })),
    photos: opts.photos,
    letters: opts.letters ?? [],
  };
}

/** Сборка, как contentFor у PDF: фото по позициям, правила раскладки layoutRev (по умолчанию — книги). */
export const buildLayout = (b: LayoutBundle, rows: readonly LayoutPhoto[] = b.photos, layoutRev = b.book.layoutRev) =>
  buildBookContent({ ...b.book, layoutRev }, b.questions, [...rows].sort((x, y) => x.position - y.position).map(toPhotoItem), b.chapters, YEAR, b.letters);

/** Строки фото после плана перевода. */
export const applyPins = (rows: readonly LayoutPhoto[], changes: readonly PhotoPinChange[]) =>
  rows.map((r) => {
    const c = changes.find((x) => x.id === r.id);
    return c ? { ...r, ...c.after } : r;
  });
