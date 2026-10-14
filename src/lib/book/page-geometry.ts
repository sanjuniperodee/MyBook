/**
 * Геометрия полосы блока: поля, полоса набора, рамка парадных полос и начало блока с названием главы.
 * Одно место для PDF (pdf/interior/), HTML-страниц (components/interior), превью в редакторе,
 * 3D-книги и фотостраниц (photo-pages.ts). Единицы — мм обрезного формата.
 */
import { formats, type BookFormat, type FormatId } from "./formats";
import type { InteriorDesign } from "./interiors";
import type { PageBox } from "./interior-art";

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

/**
 * Боковое поле полосы, мм. Поля симметричны — среднее внутреннего и внешнего: левые и правые полосы
 * верстаются одинаково, полоса набора стоит по центру листа.
 */
export function pageSide(format: BookFormat) {
  const m = interiorMetrics[format.id];
  return (m.marginInner + m.marginOuter) / 2;
}

/** Полоса набора, мм: обрезной формат минус поля. */
export function textArea(format: BookFormat) {
  const m = interiorMetrics[format.id];
  return {
    w: format.widthMm - m.marginInner - m.marginOuter,
    h: format.heightMm - m.marginTop - m.marginBottom,
  };
}

/** Обрезной формат с вылетами и отступ рамки парадных полос — для графики из interior-art. */
export function pageBox(format: BookFormat, bleed: number): PageBox {
  const m = interiorMetrics[format.id];
  return { w: format.widthMm, h: format.heightMm, bleed, inset: Math.min(m.marginTop, m.marginOuter) * 0.55 };
}

/**
 * Начальная полоса главы: где начинается блок с номером и названием (мм от верхнего обреза)
 * и во сколько раз полоса набора больше, чем у A5, — по этому масштабу рисуются картинки.
 */
export function openerFlow(format: BookFormat, design: InteriorDesign) {
  const m = interiorMetrics[format.id];
  const h = textArea(format).h;
  return { top: m.marginTop + design.opener.top * h, k: h / textArea(formats.a5).h };
}
