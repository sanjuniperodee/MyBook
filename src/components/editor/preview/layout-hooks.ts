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
 * считаются по её ширине. Там же — на какой полосе фото «на всю страницу» (колонка его заглушки, data-page-photo):
 * снимок рисуется поверх этой полосы, а не внутри колонок. Каждая глава перемеряет себя сама, когда меняется её
 * содержимое (measure(key)); все главы — при смене ширины и после загрузки шрифтов.
 * К началу текущего ответа превью прокручивается сразу при смене ответа и пока полосы ещё дорисовываются.
 */
export function usePreviewPages({
  chapters,
  currentId,
  textW,
  gap,
  marginTop,
}: {
  chapters: PreviewChapter[];
  currentId: string;
  /** Полоса набора и промежуток между колонками, px. */
  textW: number;
  gap: number;
  /** Верхнее поле страницы, px. */
  marginTop: number;
}) {
  const scroll = useRef<HTMLDivElement>(null);
  const measureRefs = useRef(new Map<string, HTMLDivElement>());
  const [pagesBy, setPagesBy] = useState<Record<string, number>>({});
  const [photoPagesBy, setPhotoPagesBy] = useState<Record<string, PhotoPages>>({});

  const setMeasureRef = useCallback((key: string, el: HTMLDivElement | null) => {
    if (el) measureRefs.current.set(key, el);
    else measureRefs.current.delete(key);
  }, []);

  /** Перемерить главы keys (по умолчанию — все). */
  const measureKeys = useCallback(
    (keys?: string[]) => {
      if (!textW) return;
      const measured = [...(keys ?? measureRefs.current.keys())].flatMap((key) => {
        const el = measureRefs.current.get(key);
        return el ? [{ key, pages: columnPages(el.scrollWidth, textW, gap), photos: photoColumns(el, textW, gap) }] : [];
      });
      setPagesBy((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const { key, pages } of measured)
          if (next[key] !== pages) {
            next[key] = pages;
            changed = true;
          }
        return changed ? next : prev;
      });
      // Тот же объект, пока полосы фото не изменились: глава превью перерисовывается только из-за настоящих перемен.
      setPhotoPagesBy((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const { key, photos } of measured)
          if (!samePhotoPages(next[key], photos)) {
            next[key] = photos;
            changed = true;
          }
        return changed ? next : prev;
      });
    },
    [textW, gap],
  );
  const measure = useCallback((key: string) => measureKeys([key]), [measureKeys]);

  useEffect(() => {
    measureKeys();
    void document.fonts?.ready.then(() => measureKeys());
  }, [measureKeys]);

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

  return { scroll, pagesBy, photoPagesBy, setMeasureRef, measure };
}

/** Фото «на всю страницу» главы → номер полосы текста (с 0), на которой оно стоит. */
export type PhotoPages = Readonly<Record<string, number>>;
export const NO_PHOTO_PAGES: PhotoPages = Object.freeze({});

/** Колонка каждой заглушки фото на всю страницу в копии главы для замера — так же, как колонка начала ответа. */
export function photoColumns(flowEl: Pick<HTMLElement, "querySelectorAll" | "getBoundingClientRect">, textW: number, gap: number): PhotoPages {
  const holders = flowEl.querySelectorAll<HTMLElement>("[data-page-photo]");
  if (!holders.length) return NO_PHOTO_PAGES;
  const left = flowEl.getBoundingClientRect().left;
  const out: Record<string, number> = {};
  for (const el of holders) out[el.dataset.pagePhoto!] = Math.max(0, Math.floor((el.getBoundingClientRect().left - left + 1) / (textW + gap)));
  return out;
}

export function samePhotoPages(a: PhotoPages | undefined, b: PhotoPages) {
  if (!a) return b === NO_PHOTO_PAGES;
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
}
