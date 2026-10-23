/**
 * Книга в редакторе вопросов: та же сборка, что для PDF (assembleBookContent), с теми же входами — правила раскладки
 * фото книги (layoutRev), снимки обложки, оглавление по-своему и фото с кадром и местом, выбранным автором. По ней
 * считается объём (та же estimatePages — число в редакторе совпадает с оценкой в кабинете и в листаемой книге:
 * вопросы только с фото и письма близких попадают в счёт), строится превью и места фото (photoPlaceOf). Тексты,
 * которых нет в ответах: названия глав — из данных редактора, подписи («Разное», письма близких, альбом в конце) —
 * из словаря языка книги (i18n/messages/partial); каталог тем и обложек в браузер не грузится.
 */
import { bookMessagesFor } from "@/i18n/messages/partial";
import type { EditorBook, EditorChapter, EditorPhoto, EditorQuestion } from "./editor-model";
import { printablePageCount } from "./formats";
import { estimatePages } from "./estimate";
import { assembleBookContent, CUSTOM_KEY, toPhotoItem, type BookContent, type BookTexts, type LetterLike } from "./layout";

/**
 * Тексты книги из данных редактора: названия глав — из списка глав (своя книга) или из вопросов (уже в роде автора
 * и адресата); подписи — как у bookTexts (book-content.ts), на языке книги. Названия по умолчанию (из каталога тем)
 * нет: на число полос и места фото оно не влияет.
 */
function editorTexts(book: Pick<EditorBook, "language" | "kind">, questions: EditorQuestion[], chapters: readonly EditorChapter[] | undefined): BookTexts {
  const outline = book.kind === "blank";
  const t = bookMessagesFor(book.language);
  return {
    chapter: (key) => {
      const c = chapters?.find((x) => x.key === key);
      if (c) return { title: c.title, epigraph: c.epigraph, own: c.own };
      const q = questions.find((x) => x.chapter === key);
      return q ? { title: q.chapterTitle, own: outline } : undefined;
    },
    chapterOrder: outline && chapters ? chapters.map((c) => c.key) : undefined,
    misc: t.misc,
    untitledChapter: t.untitledChapter,
    letters: t.letters,
    defaultTitle: "",
    galleryTitle: book.kind === "gift" ? t.gallery : t.galleryByKind[book.kind],
  };
}

/**
 * Содержимое книги по данным редактора — как buildBookContent у PDF. chapters — главы редактора (у своей книги —
 * обязательно: порядок и пустые главы; у книг с банком — эпиграфы для превью, на объём они не влияют).
 */
export function editorContent(book: EditorBook, questions: EditorQuestion[], photos: EditorPhoto[], letters: LetterLike[], chapters?: readonly EditorChapter[]): BookContent {
  return assembleBookContent(
    // Подзаголовок и имена на число полос и места фото не влияют. Правила раскладки и снимки обложки — книги:
    // по ним сборка решает, где фото, и снимок обложки в ответе печатается или нет (как в PDF).
    {
      ...book,
      subtitle: "",
      authorName: "",
      recordedBy: "",
      recipientName: "",
      coverPhotoId: book.coverPhotoId ?? null,
      coverPhotoExtra: book.coverPhotoExtra ?? [],
      backPhotoId: book.backPhotoId ?? null,
      backPhotoExtra: book.backPhotoExtra ?? [],
      layoutRev: book.layoutRev ?? 1,
    },
    // Заголовок по умолчанию в редакторе уже в роде автора и адресата, свой текст (custom) — как у автора.
    questions.map((q, position) => ({ id: q.id, chapter: q.chapter, position, title: q.defaultTitle, displayText: q.displayText, hideHeading: q.hideHeading, answer: q.answer, media: q.media, questionKey: q.isCustom ? CUSTOM_KEY : null })),
    // Фото — в порядке книги (позиции), с кадром, главой и отметкой фото главы.
    photos.map((p) => toPhotoItem({ ...p, inline: p.inline ?? null, storageKey: "", thumbKey: "" })),
    editorTexts(book, questions, chapters),
    undefined,
    letters,
  );
}

/** Полос в книге и печатный объём. Пока в книге нечего печатать, счётчик показывает 0, а не пустые титул и оборот; фото без вопроса печатаются альбомом. */
export function contentPages(content: BookContent) {
  const raw = content.chapters.length || content.galleryPhotos.length ? estimatePages(content) : 0;
  return { raw, printed: raw ? printablePageCount(raw) : 0 };
}

export function editorEstimate(book: EditorBook, questions: EditorQuestion[], photos: EditorPhoto[], letters: LetterLike[], chapters?: readonly EditorChapter[]) {
  return contentPages(editorContent(book, questions, photos, letters, chapters));
}
