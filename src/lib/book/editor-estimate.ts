/**
 * Оценка объёма книги в редакторе вопросов: сколько полос получится и сколько напечатают.
 * Книгу собирает та же сборка, что для PDF (assembleBookContent), а считает та же estimatePages — число
 * в редакторе совпадает с оценкой в кабинете и в листаемой книге: вопросы только с фото и письма близких
 * попадают в счёт. Тексты, которых нет в ответах, — названия глав из данных редактора: на число полос
 * они не влияют, а словари и каталог тем в браузер не грузятся.
 */
import type { EditorBook, EditorChapter, EditorPhoto, EditorQuestion } from "./editor-model";
import { printablePageCount } from "./formats";
import { estimatePages } from "./estimate";
import { assembleBookContent, CUSTOM_KEY, toPhotoItem, type BookTexts, type LetterLike } from "./layout";

/** Тексты книги из данных редактора: названия глав — из списка глав (своя книга) или из вопросов (уже в роде автора и адресата). */
function editorTexts(questions: EditorQuestion[], chapters: readonly EditorChapter[] | undefined, outline: boolean): BookTexts {
  return {
    chapter: (key) => {
      const c = chapters?.find((x) => x.key === key);
      if (c) return { title: c.title, epigraph: c.epigraph, own: c.own };
      const q = questions.find((x) => x.chapter === key);
      return q ? { title: q.chapterTitle, own: outline } : undefined;
    },
    chapterOrder: outline && chapters ? chapters.map((c) => c.key) : undefined,
    misc: "",
    untitledChapter: "",
    letters: { title: "" },
    defaultTitle: "",
    galleryTitle: "",
  };
}

export function editorEstimate(book: EditorBook, questions: EditorQuestion[], photos: EditorPhoto[], letters: LetterLike[], chapters?: readonly EditorChapter[]) {
  const content = assembleBookContent(
    // Подзаголовок, имена и обложка на число полос не влияют; фото обложки в списке редактора уже нет.
    { ...book, subtitle: "", authorName: "", recordedBy: "", recipientName: "", coverPhotoId: null },
    // Заголовок по умолчанию в редакторе уже в роде автора и адресата, свой текст (custom) — как у автора.
    questions.map((q, position) => ({ id: q.id, chapter: q.chapter, position, title: q.defaultTitle, displayText: q.displayText, hideHeading: q.hideHeading, answer: q.answer, questionKey: q.isCustom ? CUSTOM_KEY : null })),
    photos.map((p) => toPhotoItem({ ...p, inline: p.inline ?? null, storageKey: "", thumbKey: "" })),
    editorTexts(questions, chapters, book.kind === "blank"),
    undefined,
    letters,
  );
  // Пока в книге нечего печатать, счётчик показывает 0, а не пустые титул и оборот. Фото без вопроса печатаются галереей.
  const raw = content.chapters.length || content.galleryPhotos.length ? estimatePages(content) : 0;
  return { raw, printed: raw ? printablePageCount(raw) : 0 };
}
