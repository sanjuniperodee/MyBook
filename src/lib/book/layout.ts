/**
 * Сборка содержимого книги и оценка объёма. Модуль общий для сервера и браузера.
 */
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { applyGender } from "../content/gender";
import { getTheme } from "../content/themes";
import type { Book, BookQuestion, InlinePhotoStyle, Photo } from "@/shared/infrastructure/db/schema";
import { framedBox, layoutInline, MAX_INLINE_HEIGHT_SHARE, normalizeStyle, splitParagraphs } from "./inline-photo";
import { getFormat, type BookFormat, type FormatId } from "./formats";
import { getTypography, type Typography } from "./fonts";

export interface InteriorMetrics {
  /** Поля от линии реза, мм. */
  marginTop: number;
  marginBottom: number;
  marginInner: number;
  marginOuter: number;
  /** Масштаб кегля относительно A5. */
  scale: number;
}

export const interiorMetrics: Record<FormatId, InteriorMetrics> = {
  a5: { marginTop: 17, marginBottom: 21, marginInner: 18, marginOuter: 16, scale: 1 },
  square: { marginTop: 22, marginBottom: 24, marginInner: 24, marginOuter: 22, scale: 1.12 },
};

export function textArea(format: BookFormat) {
  const m = interiorMetrics[format.id];
  return {
    w: format.widthMm - m.marginInner - m.marginOuter,
    h: format.heightMm - m.marginTop - m.marginBottom,
  };
}

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
  layout: "full" | "bleed" | "half";
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
}

export interface BookContent {
  /** Язык книги: на нём печатаются служебные надписи (оглавление, «Глава N») и расставляются переносы. */
  language: Locale;
  format: BookFormat;
  typography: Typography;
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
  | "typography"
  | "format"
  | "photoPlacement"
  | "showToc"
  | "coverPhotoId"
>;

export function questionHeading(q: Pick<BookQuestion, "title" | "displayText">, book: Pick<Book, "authorGender" | "recipientGender">) {
  return q.displayText ?? applyGender(q.title, book.authorGender, book.recipientGender);
}

export function toPhotoItem(p: Photo): PhotoItem {
  return {
    id: p.id,
    caption: p.caption,
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
      heading: q.hideHeading ? null : questionHeading(q, book),
      answer: q.answer.trim(),
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

  // Письма близких — последняя глава, после распределения фото.
  const letterItems = letters.filter((l) => l.text.trim());
  if (letterItems.length) {
    chapters.push({
      key: LETTERS_CHAPTER,
      number: chapters.length + 1,
      title: t.letters.title,
      epigraph: t.letters.epigraph,
      items: letterItems.map((l) => ({ id: l.id, heading: l.relation.trim() ? `${l.authorName.trim()}, ${l.relation.trim()}` : l.authorName.trim(), answer: l.text.trim() })),
      photos: [],
    });
  }

  return {
    language: book.language,
    format: getFormat(book.format),
    typography: getTypography(book.typography),
    title: book.title.trim() || theme.titleSuggestions[0],
    subtitle: book.subtitle.trim(),
    authorName: book.authorName.trim(),
    recipientName: book.recipientName.trim(),
    dedication: book.dedication.trim(),
    showToc: book.showToc,
    chapters,
    galleryPhotos,
    year,
  };
}

/** Группирует фото в страницы: «половинки» объединяются по две. */
export function photoPages(photos: PhotoItem[]): PhotoItem[][] {
  const pages: PhotoItem[][] = [];
  let pendingHalf: PhotoItem | null = null;
  for (const p of photos) {
    if (p.layout === "half") {
      if (pendingHalf) {
        pages.push([pendingHalf, p]);
        pendingHalf = null;
      } else pendingHalf = p;
    } else pages.push([p]);
  }
  if (pendingHalf) pages.push([pendingHalf]);
  return pages;
}

// ─── оценка объёма ─────────────────────────────────────────────────────────

const PT_PER_MM = 72 / 25.4;
const AVG_CHAR_EM = 0.5;

export interface TextMetrics {
  charsPerLine: number;
  linesPerPage: number;
  headingCharsPerLine: number;
}

export function textMetrics(format: BookFormat, typo: Typography): TextMetrics {
  const area = textArea(format);
  const scale = interiorMetrics[format.id].scale;
  const bodyPt = typo.bodySize * scale;
  const headingPt = bodyPt * 1.55;
  const widthPt = area.w * PT_PER_MM;
  return {
    charsPerLine: Math.floor(widthPt / (bodyPt * AVG_CHAR_EM)),
    linesPerPage: Math.floor((area.h * PT_PER_MM - 18) / (bodyPt * typo.lineHeight)),
    headingCharsPerLine: Math.floor(widthPt / (headingPt * AVG_CHAR_EM)),
  };
}

/** Сколько строк основного текста займёт ответ. */
export function answerLines(text: string, m: TextMetrics): number {
  const paragraphs = text.split(/\n+/).filter((p) => p.trim());
  return paragraphs.reduce((sum, p) => sum + Math.max(1, Math.ceil(p.trim().length / m.charsPerLine)) + 0.4, 0);
}

/** Строки, которые занимает заголовок вопроса (в строках основного текста). */
export function headingLines(heading: string | null, m: TextMetrics): number {
  if (!heading) return 1.5;
  return Math.ceil(heading.length / m.headingCharsPerLine) * 1.6 + 2.2;
}

/** Высота фото внутри ответа в долях страницы (с учётом размера, кадра, рядов и рамки). */
export function inlinePhotosPages(photos: Pick<PhotoItem, "width" | "height" | "inline">[] | undefined, answer: string, format: BookFormat) {
  if (!photos?.length) return 0;
  const area = textArea(format);
  const items = photos.map((p) => ({ p, style: normalizeStyle(p.inline) }));
  const paragraphs = splitParagraphs(answer).length;
  let total = 0;
  for (const rows of layoutInline(items, paragraphs).values())
    for (const row of rows) {
      const hs = row.map(({ p, style }) => framedBox(p, style, area.w, area.h, row.length).outerH);
      total += Math.max(...hs) + area.h * 0.05;
    }
  return total / area.h;
}

export function estimateChapterPages(ch: Pick<ContentChapter, "items" | "photos">, m: TextMetrics, format?: BookFormat): number {
  let lines = 0;
  for (const it of ch.items)
    lines += headingLines(it.heading, m) + answerLines(it.answer, m) + (format ? inlinePhotosPages(it.photos, it.answer, format) : (it.photos?.length ?? 0) * 0.5) * m.linesPerPage;
  const textPages = ch.items.length ? Math.max(1, Math.ceil(lines / m.linesPerPage)) : 0;
  return 1 /* титул главы */ + textPages + photoPages(ch.photos).length;
}

/** Оценка количества страниц в готовой книге (до добивки до кратности). */
export function estimatePages(content: BookContent): number {
  const m = textMetrics(content.format, content.typography);
  let pages = 2; // титульный лист + оборот
  if (content.dedication) pages += 1;
  if (content.showToc && content.chapters.length > 0) pages += Math.ceil(content.chapters.length / 18);
  for (const ch of content.chapters) pages += estimateChapterPages(ch, m, content.format);
  if (content.galleryPhotos.length) pages += 1 + photoPages(content.galleryPhotos).length;
  pages += 1; // финальная страница
  return pages;
}

/** Оценка для одного ответа: сколько страниц он займёт (для индикатора в редакторе). */
export function estimateAnswerPages(
  heading: string | null,
  answer: string,
  format: BookFormat,
  typo: Typography,
  photos: Pick<PhotoItem, "width" | "height" | "inline">[] = [],
) {
  const m = textMetrics(format, typo);
  return (headingLines(heading, m) + answerLines(answer, m)) / m.linesPerPage + inlinePhotosPages(photos, answer, format);
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
  if (layout === "inline") return { w: area.w, h: area.h * MAX_INLINE_HEIGHT_SHARE };
  return { w: area.w, h: area.h - 14 };
}

export function pluralRu(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
