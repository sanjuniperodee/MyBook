/**
 * Геометрия фото внутри ответа. Общая для превью в браузере, оценки объёма и PDF,
 * поэтому размеры и кадрирование совпадают до пикселя.
 */
import type { InlinePhotoStyle } from "../db/schema";
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
  return v;
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
 * (≤ 50% ширины) в одном месте встают рядом.
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
      const fits = last && p.style.width <= ROW_MAX_WIDTH && last.every((x) => x.style.width <= ROW_MAX_WIDTH) && last.reduce((s, x) => s + x.style.width, 0) + p.style.width <= 100;
      if (fits) last.push(p);
      else rows.push([p]);
    }
    result.set(a, rows);
  }
  return result;
}

/** Добавочная высота рамки (в единицах текста) — для оценки объёма. */
export function frameExtra(style: InlinePhotoStyle, unit: number) {
  return style.frame === "polaroid" ? unit * POLAROID_BOTTOM : 0;
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
  return answer
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Кегль рукописной подписи на полароиде: помещается в одну строку в нижнем поле. */
export function polaroidFontSize(box: { imgW: number; padBottom: number }, caption: string, bodySize: number) {
  const byWidth = box.imgW / (0.42 * Math.max(caption.length, 1));
  return Math.max(bodySize * 0.55, Math.min(box.padBottom * 0.5, bodySize * 1.3, byWidth));
}
