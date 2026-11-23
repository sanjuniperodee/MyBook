import type { Messages } from "@/i18n/messages";
import { MAX_SPACE_ABOVE, type InlinePhotoStyle } from "@/lib/book/inline-photo";

/** Ширина фото в ответе, % полосы набора: пределы ручки размера и клавиш. */
export const MIN_WIDTH = 25;
export const MAX_WIDTH = 100;

/** Порог сдвига указателя, px: дальше — перетаскивание, ближе — щелчок. */
export const DRAG_THRESHOLD = 6;

/** Куда бросить фото: ответ (entry — id вопроса) и место в его тексте (как InlinePhotoStyle.anchor). */
export interface DropTarget {
  entry: string;
  anchor: number | null;
}

export type Drag =
  | { kind: "resize"; id: string; startX: number; startWidth: number; factor: number; width: number }
  | { kind: "move"; id: string; startX: number; startY: number; x: number; y: number; active: boolean; target: DropTarget }
  /** Ручка отступа над фото: start и space — доли полосы набора, limit — наибольший отступ ряда. */
  | { kind: "space"; id: string; startY: number; start: number; limit: number; space: number };

/**
 * Отступ над фото после сдвига ручки на dy пикселей при высоте полосы набора textH пикселей: доля полосы, от 0 до
 * limit (и не больше MAX_SPACE_ABOVE), шагом 0,5 %.
 */
export function draggedSpace(drag: { start: number; limit: number }, dy: number, textH: number) {
  const raw = drag.start + dy / Math.max(1, textH);
  return Math.round(Math.min(drag.limit, MAX_SPACE_ABOVE, Math.max(0, raw)) * 200) / 200;
}

/** Во сколько раз сдвиг уголка меняет ширину: фото по центру растёт в обе стороны, прижатое вправо — влево. */
export function resizeFactor(align: InlinePhotoStyle["align"]) {
  return (align === "center" ? 2 : 1) * (align === "right" ? -1 : 1);
}

/** Ширина фото, %, после сдвига уголка на dx пикселей при ширине полосы набора textW пикселей. */
export function resizedWidth(drag: { startWidth: number; factor: number }, dx: number, textW: number) {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(drag.startWidth + (dx * drag.factor * 100) / textW)));
}

/**
 * Место вставки, если фото бросили на блок текста: после блока (нижняя половина строки под указателем) или перед ним.
 * Блок (список, стихи) может занимать несколько абзацев from…to: «перед ним» — перед первым из них.
 * Возвращает номер абзаца, после которого встанет фото, −1 — перед текстом, null — в конце ответа.
 */
export function anchorAtBlock(y: number, line: { top: number; height: number }, block: { from: number; to: number }, paragraphs: number): number | null {
  const after = y > line.top + line.height / 2 ? block.to : block.from - 1;
  return after >= paragraphs - 1 ? null : after;
}

/** Подсветка места вставки у блока, который кончается абзацем i: линия под ним или — у первого блока — над ним. */
export function insertionHint(target: number | null, paragraphs: number, i: number): "below" | "above" | undefined {
  const t = target === null ? paragraphs - 1 : target;
  if (t === i) return "below";
  if (t === i - 1 && i === 0) return "above";
  return undefined;
}

/** Место вставки → подпись для подсказки рядом с указателем. */
export function anchorLabel(t: Messages["editor"]["preview"], anchor: number | null, paragraphs: number) {
  if (anchor === null || anchor >= paragraphs - 1) return t.anchorEnd;
  if (anchor < 0) return t.anchorBefore;
  return t.anchorAfter(anchor + 1);
}

/** Подсказка у указателя: место в тексте, а в другом ответе — ещё и куда («В ответ „…“, после 2-го абзаца»). */
export function dropLabel(t: Messages["editor"]["preview"], target: DropTarget, currentId: string, paragraphs: number, heading: string | null) {
  const place = anchorLabel(t, target.anchor, paragraphs);
  return target.entry === currentId ? place : `${t.toAnswer(heading)}, ${place}`;
}
