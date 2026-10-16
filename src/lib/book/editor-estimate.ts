/**
 * Оценка объёма книги в редакторе вопросов: сколько полос получится и сколько напечатают.
 * Книгу собирает та же сборка, что для PDF (assembleBookContent), а считает та же estimatePages — число
 * в редакторе совпадает с оценкой в кабинете и в листаемой книге: вопросы только с фото и письма близких
 * попадают в счёт. Тексты, которых нет в ответах, — названия глав из вопросов редактора: на число полос
 * они не влияют, а словари и каталог тем в браузер не грузятся.
 */
import type { EditorBook, EditorPhoto, EditorQuestion } from "./editor-model";
import { printablePageCount } from "./formats";
import { estimatePages } from "./estimate";
import { assembleBookContent, toPhotoItem, type BookTexts, type LetterLike } from "./layout";

/** Тексты книги из данных редактора: названия глав — из вопросов (уже в роде автора и адресата). */
function editorTexts(questions: EditorQuestion[]): BookTexts {
  return {
    chapter: (key) => {
      const q = questions.find((x) => x.chapter === key);
      return q ? { title: q.chapterTitle } : undefined;
    },
    misc: "",
    letters: { title: "" },
    defaultTitle: "",
  };
}

export function editorEstimate(book: EditorBook, questions: EditorQuestion[], photos: EditorPhoto[], letters: LetterLike[]) {
  const content = assembleBookContent(
    // Подзаголовок, имена и обложка на число полос не влияют; фото обложки в списке редактора уже нет.
    { ...book, subtitle: "", authorName: "", recipientName: "", coverPhotoId: null },
    // Заголовок по умолчанию в редакторе уже в роде автора и адресата — повторная подстановка его не меняет.
    questions.map((q, position) => ({ id: q.id, chapter: q.chapter, position, title: q.defaultTitle, displayText: q.displayText, hideHeading: q.hideHeading, answer: q.answer })),
    photos.map((p) => toPhotoItem({ ...p, inline: p.inline ?? null, storageKey: "", thumbKey: "" })),
    editorTexts(questions),
    undefined,
    letters,
  );
  // Пока в книге нечего печатать, счётчик показывает 0, а не пустые титул и оборот. Фото без вопроса печатаются галереей.
  const raw = content.chapters.length || content.galleryPhotos.length ? estimatePages(content) : 0;
  return { raw, printed: raw ? printablePageCount(raw) : 0 };
}
