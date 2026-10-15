/**
 * Оценка объёма книги: сколько полос займёт содержимое, не собирая PDF. Модуль общий для сервера и браузера.
 */
import type { Typography } from "./fonts";
import { MM_TO_PT, type BookFormat } from "./formats";
import { framedBox, layoutInline, normalizeStyle, splitParagraphs } from "./inline-photo";
import { interiorMetrics, textArea } from "./page-geometry";
import { photoPages, type BookContent, type ContentChapter, type PhotoItem } from "./layout";

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
  const widthPt = area.w * MM_TO_PT;
  return {
    charsPerLine: Math.floor(widthPt / (bodyPt * AVG_CHAR_EM)),
    linesPerPage: Math.floor((area.h * MM_TO_PT - 18) / (bodyPt * typo.lineHeight)),
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
  const m = textMetrics(content.format, content.interior.type);
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
