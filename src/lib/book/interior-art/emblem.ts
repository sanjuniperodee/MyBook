/**
 * Свой рисунок книги (emblem, его рисует ИИ-дизайнер) на страницах: над названием главы и на титульном листе.
 * Рисунок вписывается в отведённое место с сохранением пропорций и по центру; цвета-роли: main — цвет украшений
 * оформления, accent — акцент. Координаты — миллиметры от угла обрезного формата, как у остальной графики страниц.
 */
import { resolveDrawing } from "../art";
import { transformAll } from "../art/kit";
import { compose, scaleM, translateM } from "../art/path";
import type { InteriorPalette, TitleLayout } from "../interiors";
import type { Drawing, Shape } from "./geometry";

interface Slot {
  /** Центр по горизонтали, верх и предельные размеры, мм. */
  cx: number;
  top: number;
  maxW: number;
  maxH: number;
}

function place(d: Drawing, slot: Slot, palette: Pick<InteriorPalette, "ornament" | "accent">): Shape[] {
  const k = Math.min(slot.maxW / d.w, slot.maxH / d.h);
  if (!(k > 0)) return [];
  const w = d.w * k;
  const h = d.h * k;
  // Меньшее место ставим по высоте вверх: рисунок «стоит» на нижнем краю слота (ближе к названию).
  const m = compose(translateM(slot.cx - w / 2, slot.top + (slot.maxH - h)), scaleM(k));
  return transformAll(resolveDrawing(d, palette.ornament, palette.accent).shapes, m);
}

/** Над названием главы: от верха полосы до начала блока с названием (flowTop), не выше 22% высоты. */
export function openerEmblemShapes(d: Drawing | undefined, ctx: { w: number; h: number; flowTop: number; k: number; palette: InteriorPalette }): Shape[] {
  if (!d) return [];
  const gap = 4 * ctx.k;
  const top = Math.max(ctx.h * 0.07, ctx.flowTop - gap - ctx.h * 0.22);
  const maxH = ctx.flowTop - gap - top;
  if (maxH < 10) return [];
  return place(d, { cx: ctx.w / 2, top, maxW: ctx.w * 0.4, maxH }, ctx.palette);
}

/** На титуле: в верхней четверти полосы над названием; у композиции «крупный набор сверху» (stack) рисунка нет. */
export function titleEmblemShapes(d: Drawing | undefined, layout: TitleLayout, ctx: { w: number; h: number; palette: InteriorPalette }): Shape[] {
  if (!d || layout === "stack") return [];
  const top = ctx.h * 0.09;
  return place(d, { cx: ctx.w / 2, top, maxW: ctx.w * 0.4, maxH: ctx.h * 0.2 }, ctx.palette);
}
