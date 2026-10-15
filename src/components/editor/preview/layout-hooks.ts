"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { PreviewChapter } from "@/lib/book/editor-model";
import { columnPages } from "@/lib/book/page-geometry";

/** Ширина страницы превью, px: следит за шириной контейнера. */
export function usePageWidth(wrap: RefObject<HTMLDivElement | null>) {
  const [pageW, setPageW] = useState(0);
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const update = () => setPageW(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [wrap]);
  return pageW;
}

/**
 * Полосы превью и прокрутка к текущему ответу.
 *
 * Полос в каждой главе: невидимая копия главы раскладывается CSS-колонками шириной в полосу набора, и полосы
 * считаются по её ширине. Пересчёт — при смене содержимого (liveKey), ширины и после загрузки шрифтов.
 * К началу текущего ответа превью прокручивается сразу при смене ответа и пока полосы ещё дорисовываются.
 */
export function usePreviewPages({
  chapters,
  currentId,
  textW,
  gap,
  liveKey,
  pageW,
  resizeWidth,
  marginTop,
}: {
  chapters: PreviewChapter[];
  currentId: string;
  /** Полоса набора и промежуток между колонками, px. */
  textW: number;
  gap: number;
  liveKey: string;
  pageW: number;
  /** Ширина фото, пока тянут уголок: раскладка меняется до сохранения. */
  resizeWidth: number;
  /** Верхнее поле страницы, px. */
  marginTop: number;
}) {
  const scroll = useRef<HTMLDivElement>(null);
  const measureRefs = useRef(new Map<string, HTMLDivElement>());
  const [pagesBy, setPagesBy] = useState<Record<string, number>>({});

  const measure = useCallback(() => {
    if (!textW) return;
    setPagesBy((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const [key, el] of measureRefs.current) {
        const n = columnPages(el.scrollWidth, textW, gap);
        if (next[key] !== n) {
          next[key] = n;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [textW, gap]);

  useEffect(() => {
    measure();
  }, [measure, liveKey, pageW, resizeWidth]);

  useEffect(() => {
    void document.fonts?.ready.then(measure);
  }, [measure]);

  const settleUntil = useRef(0);
  const scrolledOnce = useRef(false);
  const scrollToCurrent = useCallback(
    (behavior: ScrollBehavior) => {
      const root = scroll.current;
      const ch = chapters.find((c) => c.entries.some((e) => e.id === currentId));
      const flowEl = ch ? measureRefs.current.get(ch.key) : null;
      const marker = flowEl?.querySelector<HTMLElement>(`[data-marker="${CSS.escape(currentId)}"]`);
      if (!root || !ch || !flowEl || !marker || !textW) return false;
      const fr = flowEl.getBoundingClientRect();
      const mr = marker.getBoundingClientRect();
      const k = Math.min((pagesBy[ch.key] ?? 1) - 1, Math.max(0, Math.floor((mr.left - fr.left + 1) / (textW + gap))));
      const pageEl = root.querySelector<HTMLElement>(`[data-page="${CSS.escape(ch.key)}:${k}"]`);
      if (!pageEl) return false;
      const top = root.scrollTop + pageEl.getBoundingClientRect().top - root.getBoundingClientRect().top + marginTop + (mr.top - fr.top) - 16;
      root.scrollTo({ top: Math.max(0, top), behavior });
      return true;
    },
    [chapters, currentId, textW, gap, pagesBy, marginTop],
  );
  useEffect(() => {
    settleUntil.current = Date.now() + 1500;
    if (scrollToCurrent(scrolledOnce.current ? "smooth" : "auto")) scrolledOnce.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId]);
  useEffect(() => {
    // страницы ещё дорисовываются: подправляем позицию, пока раскладка не устоялась
    if (Date.now() < settleUntil.current || !scrolledOnce.current) if (scrollToCurrent("auto")) scrolledOnce.current = true;
  }, [pagesBy, scrollToCurrent]);

  return { scroll, measureRefs, pagesBy, measure };
}
