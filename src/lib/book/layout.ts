/**
 * Сборка содержимого книги и помощники фотостраниц. Модуль общий для сервера и браузера.
 */
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { applyGender } from "../content/gender";
import { getTheme } from "../content/themes";
import type { Book, BookQuestion, InlinePhotoStyle, Photo } from "@/shared/infrastructure/db/schema";
import { MAX_INLINE_HEIGHT_SHARE } from "./inline-photo";
import { getFormat, type BookFormat } from "./formats";
import { getInteriorDesign, type InteriorDesign } from "./interiors";
import { textArea } from "./page-geometry";

export interface ContentItem {
  id: string;
  heading: string | null;
  answer: string;
  /** Фото, вставленные в ответ (печатаются после текста). */
  photos?: PhotoItem[];
}

export interface PhotoItem {
  id: string;
  caption: string;
  layout: "full" | "bleed" | "half" | "grid";
  width: number;
  height: number;
  storageKey: string;
  thumbKey: string;
  questionId?: string | null;
  inline?: InlinePhotoStyle | null;
}

export interface ContentChapter {
  key: string;
  number: number;
  title: string;
  epigraph?: string;
  items: ContentItem[];
  photos: PhotoItem[];
  /** Снимок на начальной полосе главы — в оформлениях, где глава открывается фото (первое фото главы). */
  openerPhoto?: PhotoItem;
}

export interface BookContent {
  /** Язык книги: на нём печатаются служебные надписи (оглавление, «Глава N») и расставляются переносы. */
  language: Locale;
  format: BookFormat;
  /** Оформление страниц: шрифты, цвета, виньетки, начальные полосы глав. */
  interior: InteriorDesign;
  title: string;
  subtitle: string;
  authorName: string;
  recipientName: string;
  dedication: string;
  showToc: boolean;
  chapters: ContentChapter[];
  /** Фото, вынесенные в отдельный раздел в конце книги. */
  galleryPhotos: PhotoItem[];
  year: number;
}

type QuestionLike = Pick<BookQuestion, "id" | "chapter" | "position" | "title" | "displayText" | "hideHeading" | "answer">;
type BookLike = Pick<
  Book,
  | "theme"
  | "language"
  | "title"
  | "subtitle"
  | "authorName"
  | "authorGender"
  | "recipientName"
  | "recipientGender"
  | "dedication"
  | "interior"
  | "format"
  | "photoPlacement"
  | "showToc"
  | "coverPhotoId"
>;

export function questionHeading(q: Pick<BookQuestion, "title" | "displayText">, book: Pick<Book, "authorGender" | "recipientGender">) {
  return q.displayText ?? applyGender(q.title, book.authorGender, book.recipientGender);
}

/** Эмодзи (кроме ©, ®, ™), их модификаторы, склейки и флаги: в книжных шрифтах их нет — в печати они превращаются в мусор. */
const EMOJI = /(?![©®™])\p{Extended_Pictographic}|\p{Emoji_Modifier}|[\u200D\uFE0E\uFE0F\u20E3]|[\u{1F1E6}-\u{1F1FF}]/gu;

/** Текст для печати: без эмодзи и оставшихся после них лишних пробелов. */
export function printableText(text: string) {
  if (!EMOJI.test(text)) return text;
  EMOJI.lastIndex = 0;
  return text
    .replace(EMOJI, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([,.!?…:;)»”])/g, "$1")
    .replace(/[ \t]+$/gm, "")
    .trim();
}

export function toPhotoItem(p: Pick<Photo, "id" | "caption" | "layout" | "width" | "height" | "storageKey" | "thumbKey" | "questionId" | "inline">): PhotoItem {
  return {
    id: p.id,
    caption: printableText(p.caption),
    layout: p.layout,
    width: p.width,
    height: p.height,
    storageKey: p.storageKey,
    thumbKey: p.thumbKey,
    questionId: p.questionId,
    inline: p.inline,
  };
}

export interface LetterLike {
  id: string;
  authorName: string;
  relation: string;
  text: string;
}

export const LETTERS_CHAPTER = "__letters";

export function buildBookContent(
  book: BookLike,
  questions: QuestionLike[],
  photos: PhotoItem[],
  year = new Date().getFullYear(),
  letters: LetterLike[] = [],
): BookContent {
  const theme = getTheme(book.theme, book.language);
  const t = messagesFor(book.language).book;
  const sorted = [...questions].sort((a, b) => a.position - b.position);
  const chapterOrder: string[] = [];
  const byChapter = new Map<string, ContentItem[]>();
  // Фото, вставленные в конкретные ответы
  const inline = new Map<string, PhotoItem[]>();
  for (const p of photos) {
    if (!p.questionId || p.id === book.coverPhotoId) continue;
    inline.set(p.questionId, [...(inline.get(p.questionId) ?? []), p]);
  }
  for (const q of sorted) {
    const qPhotos = inline.get(q.id) ?? [];
    if (!q.answer.trim() && !qPhotos.length) continue;
    if (!byChapter.has(q.chapter)) {
      byChapter.set(q.chapter, []);
      chapterOrder.push(q.chapter);
    }
    byChapter.get(q.chapter)!.push({
      id: q.id,
      heading: q.hideHeading ? null : printableText(questionHeading(q, book)),
      answer: printableText(q.answer.trim()),
      photos: qPhotos,
    });
  }

  const chapters: ContentChapter[] = chapterOrder.map((key, i) => {
    const def = theme.chapters.find((c) => c.key === key);
    return {
      key,
      number: i + 1,
      title: applyGender(def?.title ?? t.misc, book.authorGender, book.recipientGender),
      epigraph: def?.epigraph,
      items: byChapter.get(key)!,
      photos: [],
    };
  });

  // Фото обложки не дублируем внутри книги.
  const placedInAnswers = new Set(chapters.flatMap((c) => c.items.flatMap((it) => (it.photos ?? []).map((p) => p.id))));
  const innerPhotos = photos.filter((p) => p.id !== book.coverPhotoId && !placedInAnswers.has(p.id));
  let galleryPhotos: PhotoItem[] = [];
  if (book.photoPlacement === "end" || chapters.length === 0) {
    galleryPhotos = innerPhotos;
  } else {
    innerPhotos.forEach((p, i) => {
      const idx = Math.min(chapters.length - 1, Math.floor((i * chapters.length) / innerPhotos.length));
      chapters[idx].photos.push(p);
    });
  }

  // Оформление, где глава открывается фото: первое фото главы переезжает на её начальную полосу.
  const interior = getInteriorDesign(book.interior);
  if (interior.opener.photo) for (const ch of chapters) ch.openerPhoto = ch.photos.shift();

  // Письма близких — последняя глава, после распределения фото.
  const letterItems = letters.filter((l) => l.text.trim());
  if (letterItems.length) {
    chapters.push({
      key: LETTERS_CHAPTER,
      number: chapters.length + 1,
      title: t.letters.title,
      epigraph: t.letters.epigraph,
      items: letterItems.map((l) => ({ id: l.id, heading: printableText(l.relation.trim() ? `${l.authorName.trim()}, ${l.relation.trim()}` : l.authorName.trim()), answer: printableText(l.text.trim()) })),
      photos: [],
    });
  }

  return {
    language: book.language,
    format: getFormat(book.format),
    interior,
    title: printableText(book.title.trim()) || theme.titleSuggestions[0],
    subtitle: printableText(book.subtitle.trim()),
    authorName: book.authorName.trim(),
    recipientName: book.recipientName.trim(),
    dedication: printableText(book.dedication.trim()),
    showToc: book.showToc,
    chapters,
    galleryPhotos,
    year,
  };
}

/** Сколько фото «сеткой» помещается на страницу. */
export const GRID_PER_PAGE = 4;

/** Группирует фото в страницы: «половинки» объединяются по две, «сетка» — до четырёх. */
export function photoPages<T extends Pick<PhotoItem, "layout">>(photos: T[]): T[][] {
  const pages: T[][] = [];
  let pendingHalf: T | null = null;
  let grid: T[] = [];
  for (const p of photos) {
    if (p.layout === "grid") {
      grid.push(p);
      if (grid.length === GRID_PER_PAGE) {
        pages.push(grid);
        grid = [];
      }
    } else if (p.layout === "half") {
      if (pendingHalf) {
        pages.push([pendingHalf, p]);
        pendingHalf = null;
      } else pendingHalf = p;
    } else pages.push([p]);
  }
  if (pendingHalf) pages.push([pendingHalf]);
  if (grid.length) pages.push(grid);
  return pages;
}

export function countWords(text: string) {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

/** Эффективное разрешение фото при печати: contain — вписать, cover — заполнить. */
export function effectiveDpi(px: { width: number; height: number }, areaMm: { w: number; h: number }, fit: "contain" | "cover") {
  const rx = px.width / areaMm.w;
  const ry = px.height / areaMm.h;
  return Math.round((fit === "contain" ? Math.max(rx, ry) : Math.min(rx, ry)) * 25.4);
}

/** Размер области под фото на странице для заданного макета, мм. */
export function photoAreaMm(format: BookFormat, layout: PhotoItem["layout"] | "inline") {
  const area = textArea(format);
  if (layout === "bleed") return { w: format.widthMm, h: format.heightMm };
  if (layout === "half") return { w: area.w, h: area.h / 2 - 12 };
  if (layout === "grid") return { w: area.w / 2 - 3, h: area.h / 2 - 8 };
  if (layout === "inline") return { w: area.w, h: area.h * MAX_INLINE_HEIGHT_SHARE };
  return { w: area.w, h: area.h - 14 };
}
