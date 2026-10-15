/**
 * Оценка объёма книги в редакторе вопросов: сколько полос получится и сколько напечатают.
 * Книгу собирает та же buildBookContent, что для PDF, а считает та же estimatePages — число в редакторе
 * совпадает с оценкой в кабинете и в листаемой книге: вопросы только с фото и письма близких попадают в счёт.
 */
import type { EditorBook, EditorPhoto, EditorQuestion } from "./editor-model";
import { printablePageCount } from "./formats";
import { estimatePages } from "./estimate";
import { buildBookContent, toPhotoItem, type LetterLike } from "./layout";

export function editorEstimate(book: EditorBook, questions: EditorQuestion[], photos: EditorPhoto[], letters: LetterLike[]) {
  const content = buildBookContent(
    // Подзаголовок, имена и обложка на число полос не влияют; фото обложки в списке редактора уже нет.
    { ...book, subtitle: "", authorName: "", recipientName: "", coverPhotoId: null },
    // Заголовок по умолчанию в редакторе уже в роде автора и адресата — повторная подстановка его не меняет.
    questions.map((q, position) => ({ id: q.id, chapter: q.chapter, position, title: q.defaultTitle, displayText: q.displayText, hideHeading: q.hideHeading, answer: q.answer })),
    photos.map((p) => toPhotoItem({ ...p, inline: p.inline ?? null, storageKey: "", thumbKey: "" })),
    undefined,
    letters,
  );
  // Пока в книге нечего печатать, счётчик показывает 0, а не пустые титул и оборот. Фото без вопроса печатаются галереей.
  const raw = content.chapters.length || content.galleryPhotos.length ? estimatePages(content) : 0;
  return { raw, printed: raw ? printablePageCount(raw) : 0 };
}
