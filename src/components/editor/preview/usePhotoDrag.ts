"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { InlinePhotoStyle } from "@/lib/book/inline-photo";
import { anchorAtBlock, DRAG_THRESHOLD, draggedSpace, insertionHint, resizedWidth, resizeFactor, type Drag, type DropTarget } from "./drag";

/** Линия места вставки у блока текста. */
const HINT_SHADOW = { below: "inset 0 -2px 0 var(--color-wine, #8b2c3c)", above: "inset 0 2px 0 var(--color-wine, #8b2c3c)" } as const;

/**
 * Где под указателем можно вставить фото: ответ и номер абзаца, после которого оно встанет (−1 — перед текстом,
 * null — в конце); undefined — под курсором нет места для вставки. Ответ — любой, куда можно (canDrop): фото
 * переезжает и в соседний ответ.
 */
function dropTarget(x: number, y: number, canDrop: (entry: string) => boolean, paragraphsOf: (entry: string) => number): DropTarget | undefined {
  for (const el of document.elementsFromPoint(x, y)) {
    const node = el as HTMLElement;
    const entry = node.dataset?.entry;
    if (!entry || !canDrop(entry)) continue;
    const rowAnchor = node.dataset?.rowAnchor;
    if (rowAnchor !== undefined) return { entry, anchor: rowAnchor === "end" ? null : Number(rowAnchor) };
    const para = node.dataset?.para;
    if (para === undefined) continue;
    const i = Number(para);
    if (i < 0) return { entry, anchor: -1 };
    const line = [...node.getClientRects()].find((r) => y >= r.top && y <= r.bottom && x >= r.left - 4 && x <= r.right + 4) ?? node.getBoundingClientRect();
    const from = node.dataset?.paraFrom === undefined ? i : Number(node.dataset.paraFrom);
    return { entry, anchor: anchorAtBlock(y, line, { from, to: i }, paragraphsOf(entry)) };
  }
  return undefined;
}

/**
 * Перетаскивание фото текущего ответа в превью: уголок меняет ширину, ручка сверху опускает фото (отступ над ним),
 * само фото переезжает к другому абзацу — и в другой ответ, щелчок выделяет. Изменения уходят в onChange (onMove —
 * перенос в другой ответ) только по отпусканию.
 */
export function usePhotoDrag({
  currentId,
  paragraphsOf,
  canDrop,
  textW,
  textH,
  selectedId,
  interactive,
  anchorOf,
  onSelect,
  onChange,
  onMove,
}: {
  currentId: string;
  /** Абзацев в ответе. */
  paragraphsOf: (entry: string) => number;
  /** Можно ли бросить фото в этот ответ (вопрос книги, а не письмо); нет onMove — только в текущий. */
  canDrop: (entry: string) => boolean;
  /** Ширина и высота полосы набора, px. */
  textW: number;
  textH: number;
  selectedId: string | null;
  interactive: boolean;
  /** Текущее место фото в тексте. */
  anchorOf: (id: string) => number | null;
  onSelect?: (id: string | null) => void;
  onChange?: (id: string, patch: Partial<InlinePhotoStyle>) => void;
  /** Фото бросили в другой ответ. */
  onMove?: (id: string, entry: string, anchor: number | null) => void;
}) {
  const [drag, setDrag] = useState<Drag | null>(null);
  /** После перетаскивания браузер шлёт click — фото уже переехало, и клик не должен снимать выделение. */
  const suppressClickUntil = useRef(0);
  const droppable = (entry: string) => entry === currentId || (!!onMove && canDrop(entry));

  const grab = (e: ReactPointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const startResize = (e: ReactPointerEvent, id: string, style: InlinePhotoStyle) => {
    grab(e);
    setDrag({ kind: "resize", id, startX: e.clientX, startWidth: style.width, factor: resizeFactor(style.align), width: style.width });
    onSelect?.(id);
  };

  /** Ручка отступа: тянуть вниз — фото ниже по странице, вверх — обратно. limit — наибольший отступ ряда (доля полосы). */
  const startSpace = (e: ReactPointerEvent, id: string, style: InlinePhotoStyle, limit: number) => {
    grab(e);
    const start = Math.min(style.spaceAbove ?? 0, limit);
    setDrag({ kind: "space", id, startY: e.clientY, start, limit, space: start });
    onSelect?.(id);
  };

  const startMove = (e: ReactPointerEvent, id: string) => {
    if (!interactive) return;
    if (e.pointerType !== "mouse" && selectedId !== id) return; // на тач-экране сначала выделяем, чтобы не мешать прокрутке
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ kind: "move", id, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, active: false, target: { entry: currentId, anchor: anchorOf(id) } });
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (!drag) return;
    if (drag.kind === "resize") {
      const width = resizedWidth(drag, e.clientX - drag.startX, textW);
      if (width !== drag.width) setDrag({ ...drag, width });
      return;
    }
    if (drag.kind === "space") {
      const space = draggedSpace(drag, e.clientY - drag.startY, textH);
      if (space !== drag.space) setDrag({ ...drag, space });
      return;
    }
    const active = drag.active || Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > DRAG_THRESHOLD;
    const target = active ? dropTarget(e.clientX, e.clientY, droppable, paragraphsOf) : undefined;
    setDrag({ ...drag, x: e.clientX, y: e.clientY, active, target: target ?? drag.target });
  };

  const onPointerUp = (e: ReactPointerEvent, id: string) => {
    if (!drag) return;
    e.stopPropagation();
    if (drag.kind !== "move" || drag.active) suppressClickUntil.current = e.timeStamp + 400;
    if (drag.kind === "resize") {
      if (drag.width !== drag.startWidth) onChange?.(id, { width: drag.width });
    } else if (drag.kind === "space") {
      if (drag.space !== drag.start) onChange?.(id, { spaceAbove: drag.space });
    } else if (drag.active) {
      const target = dropTarget(e.clientX, e.clientY, droppable, paragraphsOf) ?? drag.target;
      if (target.entry !== currentId) onMove?.(id, target.entry, target.anchor);
      else if (target.anchor !== anchorOf(id)) onChange?.(id, { anchor: target.anchor });
    } else {
      onSelect?.(selectedId === id ? null : id);
    }
    setDrag(null);
  };

  const moving = drag?.kind === "move" && drag.active ? drag : null;
  /** Подсветка места вставки у блока ответа entry, который кончается абзацем i. */
  const hint = (entry: string, i: number) => {
    if (!moving || moving.target.entry !== entry) return undefined;
    const side = insertionHint(moving.target.anchor, paragraphsOf(entry), i);
    return side ? HINT_SHADOW[side] : undefined;
  };

  return { drag, moving, hint, belowShadow: HINT_SHADOW.below, suppressClickUntil, startResize, startSpace, startMove, onPointerMove, onPointerUp, cancel: () => setDrag(null) };
}
