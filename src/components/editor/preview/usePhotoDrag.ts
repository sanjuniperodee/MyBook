"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { InlinePhotoStyle } from "@/lib/book/inline-photo";
import { anchorAtBlock, DRAG_THRESHOLD, insertionHint, resizedWidth, resizeFactor, type Drag } from "./drag";

/** Линия места вставки у блока текста. */
const HINT_SHADOW = { below: "inset 0 -2px 0 var(--color-wine, #8b2c3c)", above: "inset 0 2px 0 var(--color-wine, #8b2c3c)" } as const;

/**
 * Где под указателем можно вставить фото текущего ответа: номер абзаца, после которого оно встанет,
 * −1 — перед текстом, null — в конце; undefined — под курсором нет места для вставки.
 */
function dropTarget(x: number, y: number, currentId: string, paragraphs: number): number | null | undefined {
  for (const el of document.elementsFromPoint(x, y)) {
    const node = el as HTMLElement;
    if (node.dataset?.entry !== currentId) continue; // переносить можно только в пределах текущего ответа
    const rowAnchor = node.dataset?.rowAnchor;
    if (rowAnchor !== undefined) return rowAnchor === "end" ? null : Number(rowAnchor);
    const para = node.dataset?.para;
    if (para === undefined) continue;
    const i = Number(para);
    if (i < 0) return -1;
    const line = [...node.getClientRects()].find((r) => y >= r.top && y <= r.bottom && x >= r.left - 4 && x <= r.right + 4) ?? node.getBoundingClientRect();
    const from = node.dataset?.paraFrom === undefined ? i : Number(node.dataset.paraFrom);
    return anchorAtBlock(y, line, { from, to: i }, paragraphs);
  }
  return undefined;
}

/**
 * Перетаскивание фото текущего ответа в превью: уголок меняет ширину, само фото переезжает к другому абзацу,
 * щелчок выделяет. Изменения уходят в onChange только по отпусканию.
 */
export function usePhotoDrag({
  currentId,
  paragraphs,
  textW,
  selectedId,
  interactive,
  anchorOf,
  onSelect,
  onChange,
}: {
  currentId: string;
  /** Абзацев в текущем ответе. */
  paragraphs: number;
  /** Ширина полосы набора, px. */
  textW: number;
  selectedId: string | null;
  interactive: boolean;
  /** Текущее место фото в тексте. */
  anchorOf: (id: string) => number | null;
  onSelect?: (id: string | null) => void;
  onChange?: (id: string, patch: Partial<InlinePhotoStyle>) => void;
}) {
  const [drag, setDrag] = useState<Drag | null>(null);
  /** После перетаскивания браузер шлёт click — фото уже переехало, и клик не должен снимать выделение. */
  const suppressClickUntil = useRef(0);

  const startResize = (e: ReactPointerEvent, id: string, style: InlinePhotoStyle) => {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ kind: "resize", id, startX: e.clientX, startWidth: style.width, factor: resizeFactor(style.align), width: style.width });
    onSelect?.(id);
  };

  const startMove = (e: ReactPointerEvent, id: string) => {
    if (!interactive) return;
    if (e.pointerType !== "mouse" && selectedId !== id) return; // на тач-экране сначала выделяем, чтобы не мешать прокрутке
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ kind: "move", id, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, active: false, target: null });
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (!drag) return;
    if (drag.kind === "resize") {
      const width = resizedWidth(drag, e.clientX - drag.startX, textW);
      if (width !== drag.width) setDrag({ ...drag, width });
      return;
    }
    const active = drag.active || Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > DRAG_THRESHOLD;
    const target = active ? dropTarget(e.clientX, e.clientY, currentId, paragraphs) : null;
    setDrag({ ...drag, x: e.clientX, y: e.clientY, active, target: target === undefined ? drag.target : target });
  };

  const onPointerUp = (e: ReactPointerEvent, id: string) => {
    if (!drag) return;
    e.stopPropagation();
    if (drag.kind === "resize" || drag.active) suppressClickUntil.current = e.timeStamp + 400;
    if (drag.kind === "resize") {
      if (drag.width !== drag.startWidth) onChange?.(id, { width: drag.width });
    } else if (drag.active) {
      const target = dropTarget(e.clientX, e.clientY, currentId, paragraphs);
      const anchor = target === undefined ? drag.target : target;
      if (anchor !== anchorOf(id)) onChange?.(id, { anchor });
    } else {
      onSelect?.(selectedId === id ? null : id);
    }
    setDrag(null);
  };

  const moving = drag?.kind === "move" && drag.active ? drag : null;
  /** Подсветка места вставки у блока, который кончается абзацем i. */
  const hint = (i: number) => {
    if (!moving) return undefined;
    const side = insertionHint(moving.target, paragraphs, i);
    return side ? HINT_SHADOW[side] : undefined;
  };

  return { drag, moving, hint, belowShadow: HINT_SHADOW.below, suppressClickUntil, startResize, startMove, onPointerMove, onPointerUp, cancel: () => setDrag(null) };
}
