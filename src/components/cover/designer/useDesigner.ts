"use client";

/**
 * Состояние конструктора: обложка с историей правок (отмена и повтор), выбранный слой и буферы (слой и стиль).
 * Каждая правка сразу уходит наверх (onChange — автосохранение редактора обложки). История живёт в ref, чтобы
 * обработчики жестов на window всегда видели последнюю версию.
 */
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { CoverDesign, CoverLayer, CoverTexts } from "@/lib/book/cover-design";
import { cloneLayer, copyStyle, historyOf, pasteStyle, record, redo as redoH, undo as undoH, updateLayer, type History, type StyleClip } from "./logic";

export interface Designer {
  design: CoverDesign;
  selected: string | null;
  select: (id: string | null) => void;
  /** Правка обложки; key — сливать с предыдущей правкой с тем же ключом в один шаг отмены. */
  commit: (fn: (d: CoverDesign) => CoverDesign, key?: string | null) => void;
  /** Правка слоя по id. */
  patch: (id: string, fn: (l: CoverLayer) => CoverLayer, key?: string | null) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  copyLayer: () => void;
  pasteLayer: () => void;
  copyStyleOf: () => void;
  pasteStyleTo: () => void;
  styleClip: StyleClip | null;
  hasClipboard: boolean;
}

export function useDesigner(initial: CoverDesign, onChange: (d: CoverDesign) => void, texts: CoverTexts): Designer {
  const [history, setHistoryState] = useState<History>(() => historyOf(initial));
  const [selected, setSelected] = useState<string | null>(null);
  const [styleClip, setStyleClip] = useState<StyleClip | null>(null);
  const [hasClipboard, setHasClipboard] = useState(false);
  const ref = useRef(history);
  const clipboard = useRef<CoverLayer | null>(null);
  const changeRef = useRef(onChange);
  const selectedRef = useRef(selected);
  const textsRef = useRef(texts);
  useLayoutEffect(() => {
    changeRef.current = onChange;
    selectedRef.current = selected;
    textsRef.current = texts;
  });

  const set = useCallback((h: History) => {
    if (h === ref.current) return;
    const changed = h.present !== ref.current.present;
    ref.current = h;
    setHistoryState(h);
    if (changed) changeRef.current(h.present);
  }, []);

  const commit = useCallback((fn: (d: CoverDesign) => CoverDesign, key: string | null = null) => set(record(ref.current, fn(ref.current.present), key)), [set]);
  const patch = useCallback((id: string, fn: (l: CoverLayer) => CoverLayer, key: string | null = null) => commit((d) => updateLayer(d, id, fn), key), [commit]);

  const undo = useCallback(() => {
    const h = undoH(ref.current);
    set(h);
    // Выбранного слоя после отмены может не быть.
    if (selectedRef.current && !h.present.layers.some((l) => l.id === selectedRef.current)) setSelected(null);
  }, [set]);
  const redo = useCallback(() => {
    const h = redoH(ref.current);
    set(h);
    if (selectedRef.current && !h.present.layers.some((l) => l.id === selectedRef.current)) setSelected(null);
  }, [set]);

  const current = () => ref.current.present.layers.find((l) => l.id === selectedRef.current) ?? null;

  const copyLayer = useCallback(() => {
    const l = current();
    if (!l) return;
    clipboard.current = structuredClone(l);
    setHasClipboard(true);
  }, []);

  const pasteLayer = useCallback(() => {
    const l = clipboard.current;
    if (!l) return;
    const d = ref.current.present;
    const copy = cloneLayer(l, d, textsRef.current);
    commit((x) => ({ ...x, layers: [...x.layers, copy] }));
    setSelected(copy.id);
    // Следующая вставка — ещё правее и ниже.
    clipboard.current = { ...l, x: copy.x, y: copy.y };
  }, [commit]);

  const copyStyleOf = useCallback(() => {
    const l = current();
    if (l) setStyleClip(copyStyle(l));
  }, []);

  const pasteStyleTo = useCallback(() => {
    const l = current();
    if (l && styleClip && styleClip.kind === l.kind) patch(l.id, (x) => pasteStyle(x, styleClip));
  }, [patch, styleClip]);

  return {
    design: history.present,
    selected,
    select: setSelected,
    commit,
    patch,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    copyLayer,
    pasteLayer,
    copyStyleOf,
    pasteStyleTo,
    styleClip,
    hasClipboard,
  };
}
