/**
 * Геометрия фото внутри ответа. Общая для превью в браузере, оценки объёма и PDF,
 * поэтому размеры и кадрирование совпадают до пикселя.
 */
import type { InlinePhotoStyle } from "@/shared/infrastructure/db/schema";
export type { InlinePhotoStyle };

export const defaultInlineStyle: InlinePhotoStyle = {
  width: 100,
  align: "center",
  anchor: null,
  aspect: "original",
  focusX: 0.5,
  focusY: 0.5,
  frame: "none",
};

export const aspectRatios: Record<InlinePhotoStyle["aspect"], number | null> = {
  original: null,
  "1:1": 1,
  "4:3": 4 / 3,
  "3:4": 3 / 4,
  "16:9": 16 / 9,
};

/** Максимальная высота фото — доля высоты текстовой области. */
export const MAX_INLINE_HEIGHT_SHARE = 0.8;
/** Ширина, при которой фото встаёт в ряд с соседним. */
export const ROW_MAX_WIDTH = 50;

export function normalizeStyle(s: Partial<InlinePhotoStyle> | null | undefined): InlinePhotoStyle {
  const v = { ...defaultInlineStyle, ...(s ?? {}) };
  v.width = Math.min(100, Math.max(25, Math.round(v.width)));
  v.focusX = Math.min(1, Math.max(0, v.focusX));
  v.focusY = Math.min(1, Math.max(0, v.focusY));
  if (!v.page) delete v.page;
  if (!v.page || v.pageFit !== "contain") delete v.pageFit;
  if (v.keepSize !== true) delete v.keepSize;
  const space = Number(v.spaceAbove);
  if (Number.isFinite(space) && space >= MIN_SPACE_ABOVE) v.spaceAbove = Math.round(Math.min(MAX_SPACE_ABOVE, space) * 1000) / 1000;
  else delete v.spaceAbove;
  if (v.breakBefore !== true) delete v.breakBefore;
  return v;
}

/** Отступ над фото (InlinePhotoStyle.spaceAbove) — не больше этой доли полосы набора; меньше MIN — без отступа. */
export const MAX_SPACE_ABOVE = 0.6;
export const MIN_SPACE_ABOVE = 0.005;
/**
 * Под рядом с отступом всегда остаётся эта доля полосы — на отбивки ряда и подпись: отступ с фото не длиннее полосы,
 * и ряд, перенесённый на новую полосу целиком, на ней помещается.
 */
export const SPACE_RESERVE = 0.12;

/** Фото, которое автор поставил сам (отступ или «с новой страницы»): доводка вёрстки его ряд не трогает. */
export const placedByAuthor = (style: Pick<InlinePhotoStyle, "spaceAbove" | "breakBefore">) => !!style.spaceAbove || !!style.breakBefore;

type RowPart = { p: { width: number; height: number }; style: InlinePhotoStyle };

/** Наибольший отступ над рядом, доля полосы: высокое фото оставляет меньше места над собой. */
export function rowSpaceLimit(row: readonly RowPart[], textW: number, textH: number) {
  const photoH = Math.max(0, ...row.map(({ p, style }) => framedBox(p, style, textW, textH, row.length).outerH));
  return Math.max(0, Math.min(MAX_SPACE_ABOVE, 1 - SPACE_RESERVE - photoH / textH));
}

/** Отступ над рядом в единицах textH: у ряда он от первого фото (фото с отступом начинает ряд), с пределом rowSpaceLimit. */
export function rowSpaceAbove(row: readonly RowPart[], textW: number, textH: number) {
  const share = row[0]?.style.spaceAbove ?? 0;
  return share > 0 ? Math.min(share, rowSpaceLimit(row, textW, textH)) * textH : 0;
}

export function photoRatio(px: { width: number; height: number }, style: InlinePhotoStyle) {
  return aspectRatios[style.aspect] ?? px.width / px.height;
}

/** Размер блока фото (без рамки) в тех же единицах, что и ширина/высота текста. */
export function inlineBox(px: { width: number; height: number }, style: InlinePhotoStyle, textW: number, textH: number) {
  const ratio = photoRatio(px, style);
  let w = (textW * style.width) / 100;
  let h = w / ratio;
  const maxH = textH * MAX_INLINE_HEIGHT_SHARE;
  if (h > maxH) {
    h = maxH;
    w = h * ratio;
  }
  return { w, h, ratio };
}

/** Прямоугольник кадра в пикселях исходника: «cover» с учётом точки фокуса. */
export function cropRect(px: { width: number; height: number }, style: InlinePhotoStyle) {
  const ratio = photoRatio(px, style);
  const src = px.width / px.height;
  let cw = px.width;
  let ch = px.height;
  if (src > ratio) cw = Math.round(px.height * ratio);
  else ch = Math.round(px.width / ratio);
  const left = Math.round(Math.min(px.width - cw, Math.max(0, style.focusX * px.width - cw / 2)));
  const top = Math.round(Math.min(px.height - ch, Math.max(0, style.focusY * px.height - ch / 2)));
  return { left, top, width: cw, height: ch };
}

/** CSS object-position, дающий тот же кадр, что и cropRect. */
export function objectPosition(px: { width: number; height: number }, style: InlinePhotoStyle) {
  const r = cropRect(px, style);
  const x = px.width > r.width ? (r.left / (px.width - r.width)) * 100 : 50;
  const y = px.height > r.height ? (r.top / (px.height - r.height)) * 100 : 50;
  return `${x.toFixed(1)}% ${y.toFixed(1)}%`;
}

export interface Anchored<T> {
  anchor: number; // -1 — перед текстом, n — после абзаца n (с 0), Infinity — в конце
  items: T[];
}

/**
 * Раскладывает фото по местам в тексте и склеивает в ряды: подряд идущие узкие фото
 * (≤ 50% ширины) в одном месте встают рядом. Фото с отступом сверху или «с новой страницы» начинает свой ряд.
 */
export function layoutInline<T extends { style: InlinePhotoStyle }>(photos: T[], paragraphCount: number): Map<number, T[][]> {
  const byAnchor = new Map<number, T[]>();
  for (const p of photos) {
    const a = p.style.anchor === null || p.style.anchor >= paragraphCount - 1 ? Number.POSITIVE_INFINITY : Math.max(-1, p.style.anchor);
    byAnchor.set(a, [...(byAnchor.get(a) ?? []), p]);
  }
  const result = new Map<number, T[][]>();
  for (const [a, list] of byAnchor) {
    const rows: T[][] = [];
    for (const p of list) {
      const last = rows[rows.length - 1];
      const fits = last && !placedByAuthor(p.style) && p.style.width <= ROW_MAX_WIDTH && last.every((x) => x.style.width <= ROW_MAX_WIDTH) && last.reduce((s, x) => s + x.style.width, 0) + p.style.width <= 100;
      if (fits) last.push(p);
      else rows.push([p]);
    }
    result.set(a, rows);
  }
  return result;
}

/** Нижнее поле полароида — доля высоты текстовой области (там же подпись). */
export const POLAROID_BOTTOM = 0.06;
/** Боковые поля полароида — доля ширины блока. */
export const POLAROID_SIDE = 0.045;
/** Промежуток между фото в ряду — доля ширины текста. */
export const ROW_GAP = 0.03;

/**
 * Полная геометрия блока: внешний размер (с рамкой), размер самого снимка, поля.
 * Для фото в ряду передайте rowSize — промежутки вычитаются из ширины текста.
 */
export function framedBox(px: { width: number; height: number }, style: InlinePhotoStyle, textW: number, textH: number, rowSize = 1) {
  const availW = textW - (rowSize - 1) * textW * ROW_GAP;
  const box = inlineBox(px, style, availW, textH);
  if (style.frame !== "polaroid") {
    const radius = style.frame === "round" ? Math.min(box.w, box.h) * 0.07 : 0;
    return { outerW: box.w, outerH: box.h, imgW: box.w, imgH: box.h, pad: 0, padBottom: 0, radius, ratio: box.ratio };
  }
  const pad = box.w * POLAROID_SIDE;
  const imgW = box.w - pad * 2;
  const imgH = imgW / box.ratio;
  const padBottom = textH * POLAROID_BOTTOM;
  return { outerW: box.w, outerH: imgH + pad + padBottom, imgW, imgH, pad, padBottom, radius: 0, ratio: box.ratio };
}

/** Абзацы ответа — одинаково для превью, оценки и PDF. */
export function splitParagraphs(answer: string) {
  return splitParagraphsDetailed(answer).paragraphs;
}

/**
 * Абзацы и пустые строки между ними: breaks — номера абзацев, перед которыми автор оставил пустую строку
 * (между строфами стихов). Нумерация абзацев — та же, что у splitParagraphs: от неё зависят места фото.
 */
export function splitParagraphsDetailed(answer: string): { paragraphs: string[]; breaks: Set<number> } {
  const paragraphs: string[] = [];
  const breaks = new Set<number>();
  let blank = false;
  for (const raw of answer.split("\n")) {
    const p = raw.trim();
    if (!p) {
      blank = true;
      continue;
    }
    if (blank && paragraphs.length) breaks.add(paragraphs.length);
    blank = false;
    paragraphs.push(p);
  }
  return { paragraphs, breaks };
}

/**
 * С какого знака текста ответа начинается абзац n (нумерация splitParagraphs: непустые строки) — куда поставить курсор,
 * когда правку открыли нажатием на абзац в превью книги. Нет такого абзаца — конец текста.
 */
export function paragraphOffset(answer: string, n: number): number {
  let at = 0;
  let index = 0;
  for (const raw of answer.split("\n")) {
    if (raw.trim()) {
      if (index === n) return at + (raw.length - raw.trimStart().length);
      index++;
    }
    at += raw.length + 1;
  }
  return answer.length;
}

/** Абзацы from…end (не включая end) обратно в текст ответа: пустые строки между строфами сохраняются. */
export function joinParagraphs(paragraphs: readonly string[], breaks: ReadonlySet<number>, from: number, end: number) {
  let out = "";
  for (let i = from; i < end; i++) out += (i === from ? "" : breaks.has(i) ? "\n\n" : "\n") + paragraphs[i];
  return out;
}

/** Кегль рукописной подписи на полароиде: помещается в одну строку в нижнем поле. */
export function polaroidFontSize(box: { imgW: number; padBottom: number }, caption: string, bodySize: number) {
  const byWidth = box.imgW / (0.42 * Math.max(caption.length, 1));
  return Math.max(bodySize * 0.55, Math.min(box.padBottom * 0.5, bodySize * 1.3, byWidth));
}
