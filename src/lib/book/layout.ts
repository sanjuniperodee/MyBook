/**
 * Сборка содержимого книги и оценка объёма. Модуль общий для сервера и браузера.
 */
import { applyGender } from "../content/gender";
import { getTheme } from "../content/themes";
import type { Book, BookQuestion, Photo } from "../db/schema";
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
}

export interface PhotoItem {
  id: string;
  caption: string;
  layout: "full" | "bleed" | "half";
  width: number;
  height: number;
  storageKey: string;
  thumbKey: string;
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
  };
}

export function buildBookContent(book: BookLike, questions: QuestionLike[], photos: PhotoItem[], year = new Date().getFullYear()): BookContent {
  const theme = getTheme(book.theme);
  const sorted = [...questions].sort((a, b) => a.position - b.position);
  const chapterOrder: string[] = [];
  const byChapter = new Map<string, ContentItem[]>();
  for (const q of sorted) {
    if (!q.answer.trim()) continue;
    if (!byChapter.has(q.chapter)) {
      byChapter.set(q.chapter, []);
      chapterOrder.push(q.chapter);
    }
    byChapter.get(q.chapter)!.push({
      id: q.id,
      heading: q.hideHeading ? null : questionHeading(q, book),
      answer: q.answer.trim(),
    });
  }

  const chapters: ContentChapter[] = chapterOrder.map((key, i) => {
    const def = theme.chapters.find((c) => c.key === key);
    return {
      key,
      number: i + 1,
      title: applyGender(def?.title ?? "Разное", book.authorGender, book.recipientGender),
      epigraph: def?.epigraph,
      items: byChapter.get(key)!,
      photos: [],
    };
  });

  // Фото обложки не дублируем внутри книги.
  const innerPhotos = photos.filter((p) => p.id !== book.coverPhotoId);
  let galleryPhotos: PhotoItem[] = [];
  if (book.photoPlacement === "end" || chapters.length === 0) {
    galleryPhotos = innerPhotos;
  } else {
    innerPhotos.forEach((p, i) => {
      const idx = Math.min(chapters.length - 1, Math.floor((i * chapters.length) / innerPhotos.length));
      chapters[idx].photos.push(p);
    });
  }

  return {
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

export function estimateChapterPages(ch: Pick<ContentChapter, "items" | "photos">, m: TextMetrics): number {
  let lines = 0;
  for (const it of ch.items) lines += headingLines(it.heading, m) + answerLines(it.answer, m);
  const textPages = ch.items.length ? Math.max(1, Math.ceil(lines / m.linesPerPage)) : 0;
  return 1 /* титул главы */ + textPages + photoPages(ch.photos).length;
}

/** Оценка количества страниц в готовой книге (до добивки до кратности). */
export function estimatePages(content: BookContent): number {
  const m = textMetrics(content.format, content.typography);
  let pages = 2; // титульный лист + оборот
  if (content.dedication) pages += 1;
  if (content.showToc && content.chapters.length > 0) pages += Math.ceil(content.chapters.length / 18);
  for (const ch of content.chapters) pages += estimateChapterPages(ch, m);
  if (content.galleryPhotos.length) pages += 1 + photoPages(content.galleryPhotos).length;
  pages += 1; // финальная страница
  return pages;
}

/** Оценка для одного ответа: сколько страниц он займёт (для индикатора в редакторе). */
export function estimateAnswerPages(heading: string | null, answer: string, format: BookFormat, typo: Typography) {
  const m = textMetrics(format, typo);
  return (headingLines(heading, m) + answerLines(answer, m)) / m.linesPerPage;
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
export function photoAreaMm(format: BookFormat, layout: PhotoItem["layout"]) {
  const area = textArea(format);
  if (layout === "bleed") return { w: format.widthMm, h: format.heightMm };
  if (layout === "half") return { w: area.w, h: area.h / 2 - 12 };
  return { w: area.w, h: area.h - 14 };
}

export function pluralRu(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
