/**
 * Оценка объёма книги в редакторе вопросов: сколько полос получится и сколько напечатают.
 */
import type { EditorBook, EditorPhoto, EditorQuestion } from "./editor-model";
import { getFormat, printablePageCount } from "./formats";
import { getInteriorDesign } from "./interiors";
import { estimatePages, type BookContent, type ContentChapter } from "./layout";

export function editorEstimate(questions: EditorQuestion[], photos: EditorPhoto[], book: EditorBook) {
  const chapters: ContentChapter[] = [];
  for (const x of questions) {
    if (!x.answer.trim()) continue;
    let ch = chapters[chapters.length - 1];
    if (!ch || ch.key !== x.chapter) {
      ch = { key: x.chapter, number: chapters.length + 1, title: x.chapterTitle, items: [], photos: [] };
      chapters.push(ch);
    }
    const inline = photos.filter((p) => p.questionId === x.id).map((p) => ({ ...p, storageKey: "", thumbKey: "" }));
    ch.items.push({ id: x.id, heading: x.hideHeading ? null : (x.displayText ?? x.defaultTitle), answer: x.answer, photos: inline });
  }
  const loose = photos.filter((p) => !p.questionId).map((p) => ({ ...p, storageKey: "", thumbKey: "" }));
  const toGallery = book.photoPlacement === "end" || !chapters.length;
  if (!toGallery) loose.forEach((p, i) => chapters[Math.min(chapters.length - 1, Math.floor((i * chapters.length) / loose.length))].photos.push(p));
  const interior = getInteriorDesign(book.interior);
  // Как в buildBookContent: в оформлениях с фото в начале главы первое фото главы уходит на её начальную полосу.
  if (interior.opener.photo) for (const ch of chapters) ch.openerPhoto = ch.photos.shift();
  const content: BookContent = {
    language: book.language,
    format: getFormat(book.format),
    interior,
    title: book.title,
    subtitle: "",
    authorName: "",
    recipientName: "",
    dedication: book.dedication,
    showToc: book.showToc,
    chapters,
    galleryPhotos: toGallery ? loose : [],
    year: 2000,
  };
  const raw = chapters.length ? estimatePages(content) : 0;
  return { raw, printed: raw ? printablePageCount(raw) : 0 };
}
