"use client";

import type { BackContent } from "@/lib/book/cover-back";

import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Locale } from "@/i18n/config";
import type { CoverPreviewProps } from "@/components/cover/CoverPreview";
import { DedicationPage, EndPage, OpenerPage, pageKit, TextPage, TitlePage, TocPage, type PageKit, type SampleEntry } from "@/components/interior/BookPage";
import { cqwUnits } from "@/components/interior/units";
import { getFormat } from "@/lib/book/formats";
import { getInteriorDesign } from "@/lib/book/interiors";
import { interiorMetrics } from "@/lib/book/layout";
import { planFaces, planSheets, type Face, type Sheet } from "@/lib/book/flipbook";
import { cn } from "@/lib/utils";

export interface FlipbookChapter {
  number: number;
  title: string;
  epigraph?: string;
  entries: SampleEntry[];
}

/** Всё, что нужно книге, одними сериализуемыми данными (страница-сервер → клиентский компонент). */
export interface FlipbookData {
  cover: Pick<CoverPreviewProps, "template" | "format" | "title" | "subtitle" | "names" | "photoUrl" | "titlePlaceholder" | "photoHint">;
  language: Locale;
  formatId: string;
  interiorId: string;
  title: string;
  subtitle: string;
  author: string;
  year: number;
  dedication: string;
  showToc: boolean;
  chapters: FlipbookChapter[];
  /** Данные объёмной модели: толщина корешка считается по числу страниц. */
  model: { pageCount: number; brand: string; back: BackContent; backPhotoUrl?: string };
}

/** Ширина, на которой считаем разбивку текста по страницам. Вёрстка в cqw, так что от размера на экране она не зависит. */
const MEASURE_WIDTH = 640;

export interface FaceContext {
  data: FlipbookData;
  kit: PageKit;
  /** Номера полос, с которых начинаются главы. */
  chapterStarts: number[];
}

export const faceBox = "absolute inset-0 size-full";

/** Одна полоса книги по её описанию из раскладки. */
export function FaceView({ face, no, ctx }: { face: Face; no: number; ctx: FaceContext }) {
  const { data, kit, chapterStarts } = ctx;
  switch (face.kind) {
    case "blank":
      return <div className={cn(faceBox, "bg-white")} />;
    case "title":
      return <TitlePage kit={kit} title={data.title} subtitle={data.subtitle} author={data.author} year={data.year} className={faceBox} />;
    case "dedication":
      return <DedicationPage kit={kit} text={data.dedication} className={faceBox} />;
    case "toc":
      return <TocPage kit={kit} className={faceBox} entries={data.chapters.map((c, i) => ({ number: c.number, title: c.title, page: chapterStarts[i] ?? 0 }))} />;
    case "opener": {
      const ch = data.chapters[face.chapter];
      return <OpenerPage kit={kit} number={ch.number} title={ch.title} epigraph={ch.epigraph} className={faceBox} />;
    }
    case "text": {
      const ch = data.chapters[face.chapter];
      return <TextPage kit={kit} entries={ch.entries} folio={no} bookTitle={data.title} chapterTitle={ch.title} recto={no % 2 === 1} leadIn={face.part === 0} part={face.part} className={faceBox} />;
    }
    case "end":
      return <EndPage kit={kit} year={data.year} className={faceBox} />;
  }
}

export interface PagedBook {
  /** Листы по порядку: обложка, листы блока, задняя обложка. Пусто, пока текст не измерен. */
  sheets: Sheet[];
  ctx: FaceContext | null;
  /** Невидимая копия глав для замера; её нужно вывести в разметку один раз. */
  measure: ReactNode;
}

/**
 * Раскладывает книгу по страницам: сколько полос займёт текст каждой главы, измеряем невидимой копией
 * с теми же колонками, что в TextPage; затем строим листы и контекст для отрисовки полос.
 */
export function usePagedBook(data: FlipbookData): PagedBook {
  const format = getFormat(data.formatId);
  const design = useMemo(() => getInteriorDesign(data.interiorId), [data.interiorId]);
  const kit = useMemo(() => pageKit(design, format, cqwUnits(format.widthMm), data.language), [design, format, data.language]);

  const root = useRef<HTMLDivElement>(null);
  const [textPages, setTextPages] = useState<number[] | null>(null);
  const measureNow = useCallback(() => {
    const el = root.current;
    if (!el) return;
    const m = interiorMetrics[format.id];
    const side = (m.marginInner + m.marginOuter) / 2;
    const gapPx = (2 * side * MEASURE_WIDTH) / format.widthMm;
    const next = Array.from(el.querySelectorAll<HTMLElement>("[data-flow]"), (flow) => Math.max(1, Math.round((flow.scrollWidth + gapPx) / (flow.clientWidth + gapPx))));
    setTextPages((prev) => (prev && prev.length === next.length && prev.every((n, i) => n === next[i]) ? prev : next));
  }, [format]);
  const measured = useMemo(() => data.chapters.filter((c) => c.entries.length), [data.chapters]);
  useLayoutEffect(() => {
    measureNow();
    // Шрифты подгружаются после первой отрисовки и меняют разбивку.
    const fonts = typeof document !== "undefined" ? document.fonts : undefined;
    fonts?.ready.then(measureNow);
    fonts?.addEventListener("loadingdone", measureNow);
    return () => fonts?.removeEventListener("loadingdone", measureNow);
  }, [measureNow, measured, design]);

  const plan = useMemo(() => {
    if (!textPages) return null;
    let k = 0;
    const perChapter = data.chapters.map((c) => (c.entries.length ? (textPages[k++] ?? 1) : 0));
    return planFaces({ hasDedication: !!data.dedication, hasToc: data.showToc, textPages: perChapter });
  }, [textPages, data.chapters, data.dedication, data.showToc]);
  const sheets = useMemo(() => (plan ? planSheets(plan.faces) : []), [plan]);
  const ctx = useMemo<FaceContext | null>(() => (plan ? { data, kit, chapterStarts: plan.chapterStarts } : null), [plan, data, kit]);

  const measure = (
    <div ref={root} aria-hidden className="pointer-events-none invisible fixed top-0 -left-[10000px]" style={{ width: MEASURE_WIDTH }}>
      {measured.map((c) => (
        <TextPage key={c.number} kit={kit} entries={c.entries} folio={1} bookTitle="" chapterTitle="" recto={false} leadIn={false} style={{ width: MEASURE_WIDTH, aspectRatio: `${format.widthMm} / ${format.heightMm}` }} />
      ))}
    </div>
  );
  return { sheets, ctx, measure };
}
