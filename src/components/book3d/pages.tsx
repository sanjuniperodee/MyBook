"use client";

import type { BackContent } from "@/lib/book/cover-back";
import type { PhotoRef } from "@/lib/book/covers/svg-kit";

import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Locale } from "@/i18n/config";
import type { CoverPreviewProps } from "@/components/cover/CoverPreview";
import type { SampleEntry } from "@/components/interior/entry";
import { pageKit, type PageKit } from "@/components/interior/kit";
import { ColophonPage, DedicationPage, EndPage, OpenerPage, PhotoPage, TextPage, TitlePage, TocPage, type PagePhoto } from "@/components/interior/pages";
import { cqwUnits } from "@/components/interior/units";
import { getFormat } from "@/lib/book/formats";
import { getInteriorDesign } from "@/lib/book/interiors";
import { columnPages, pageSide } from "@/lib/book/page-geometry";
import { planFaces, planSheets, type Face, type Sheet } from "@/lib/book/flipbook";
import { cn } from "@/lib/class-names";

export interface FlipbookChapter {
  number: number;
  title: string;
  epigraph?: string;
  entries: SampleEntry[];
  /** Снимок на начальной полосе — в оформлениях, где глава открывается фото. */
  openerPhoto?: string;
  /** Фотостраницы главы — после её текста, по той же группировке, что в PDF. */
  photoPages?: PagePhoto[][];
}

/** Всё, что нужно книге, одними сериализуемыми данными (страница-сервер → клиентский компонент). */
export interface FlipbookData {
  cover: Pick<CoverPreviewProps, "template" | "format" | "title" | "subtitle" | "names" | "photos" | "titlePlaceholder" | "photoHint">;
  language: Locale;
  formatId: string;
  interiorId: string;
  title: string;
  subtitle: string;
  author: string;
  /** Автобиография: кто записал со слов автора — строка на обороте титула (пусто — строки нет). */
  recordedBy: string;
  year: number;
  dedication: string;
  showToc: boolean;
  /**
   * Оглавление не по умолчанию (по разделам, свои названия, скрытые строки): строки по полосам оглавления и где
   * каждая начинается — глава (−1 — галерея) и доля текста главы перед разделом (у главы — null). Нет — по главам.
   */
  toc?: { pages: number; lines: { key: string; title: string; number: number | null; level: 0 | 1; part: number; chapter: number; share: number | null }[] };
  chapters: FlipbookChapter[];
  /** Галерея в конце книги (фото не по главам): подпись начальной полосы и фотостраницы. */
  gallery?: { title: string; pages: PagePhoto[][] };
  /** Данные объёмной модели: толщина корешка считается по числу страниц. */
  model: { pageCount: number; brand: string; back: BackContent; backPhotos?: (PhotoRef | undefined)[] };
}

/** Ширина, на которой считаем разбивку текста по страницам. Вёрстка в cqw, так что от размера на экране она не зависит. */
const MEASURE_WIDTH = 640;

export interface FaceContext {
  data: FlipbookData;
  kit: PageKit;
  /** Номера полос, с которых начинаются главы. */
  chapterStarts: number[];
  /** Полоса, с которой начинается галерея (для строки оглавления). */
  galleryStart: number | null;
  /** Полос текста в каждой главе — для номеров страниц разделов в оглавлении. */
  textPages?: number[];
}

export const faceBox = "absolute inset-0 size-full";

/** Одна полоса книги по её описанию из раскладки. */
export function FaceView({ face, no, ctx }: { face: Face; no: number; ctx: FaceContext }) {
  const { data, kit, chapterStarts, galleryStart } = ctx;
  switch (face.kind) {
    case "blank":
      return <div className={cn(faceBox, "bg-white")} />;
    case "title":
      return <TitlePage kit={kit} title={data.title} subtitle={data.subtitle} author={data.author} year={data.year} className={faceBox} />;
    case "colophon":
      return <ColophonPage kit={kit} year={data.year} author={data.author} recordedBy={data.recordedBy} className={faceBox} />;
    case "dedication":
      return <DedicationPage kit={kit} text={data.dedication} className={faceBox} />;
    case "toc":
      if (data.toc)
        return (
          <TocPage
            kit={kit}
            className={faceBox}
            entries={data.toc.lines
              .filter((l) => l.part === face.part)
              .map((l) => {
                const start = l.chapter < 0 ? (galleryStart ?? 0) : (chapterStarts[l.chapter] ?? 0);
                const text = ctx.textPages?.[l.chapter] ?? 0;
                // Раздел — на полосе текста главы, куда приходится его доля текста (начальная полоса — первая).
                const page = l.share === null || !text ? start : start + 1 + Math.min(text - 1, Math.floor(l.share * text));
                return { key: l.key, title: l.title, number: l.number, level: l.level, page };
              })}
          />
        );
      return (
        <TocPage
          kit={kit}
          className={faceBox}
          entries={[
            ...data.chapters.map((c, i) => ({ number: c.number as number | null, title: c.title, page: chapterStarts[i] ?? 0 })),
            // Галерея — строка без номера, как в PDF (pdf/interior/toc.tsx).
            ...(data.gallery && galleryStart ? [{ number: null, title: data.gallery.title, page: galleryStart }] : []),
          ]}
        />
      );
    case "opener": {
      const ch = data.chapters[face.chapter];
      return <OpenerPage kit={kit} number={ch.number} title={ch.title} epigraph={ch.epigraph} photo={ch.openerPhoto ? { url: ch.openerPhoto } : undefined} className={faceBox} />;
    }
    case "text": {
      const ch = data.chapters[face.chapter];
      return <TextPage kit={kit} entries={ch.entries} folio={no} bookTitle={data.title} chapterTitle={ch.title} recto={no % 2 === 1} leadIn={face.part === 0} part={face.part} tail className={faceBox} />;
    }
    case "photos": {
      const pages = face.chapter < 0 ? data.gallery?.pages : data.chapters[face.chapter]?.photoPages;
      const photos = pages?.[face.page];
      return photos ? <PhotoPage kit={kit} photos={photos} className={faceBox} /> : <div className={cn(faceBox, "bg-white")} />;
    }
    case "galleryOpener":
      return <OpenerPage kit={kit} number={null} title={data.gallery?.title ?? ""} className={faceBox} />;
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
    const gapPx = (2 * pageSide(format) * MEASURE_WIDTH) / format.widthMm;
    const next = Array.from(el.querySelectorAll<HTMLElement>("[data-flow]"), (flow) => columnPages(flow.scrollWidth, flow.clientWidth, gapPx));
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
    return { ...planFaces({
      hasDedication: !!data.dedication,
      hasToc: data.showToc,
      tocPages: data.toc?.pages,
      textPages: perChapter,
      photoPages: data.chapters.map((c) => c.photoPages?.length ?? 0),
      galleryPages: data.gallery?.pages.length ?? 0,
    }), textPages: perChapter };
  }, [textPages, data.chapters, data.dedication, data.showToc, data.toc, data.gallery]);
  const sheets = useMemo(() => (plan ? planSheets(plan.faces) : []), [plan]);
  const ctx = useMemo<FaceContext | null>(() => (plan ? { data, kit, chapterStarts: plan.chapterStarts, galleryStart: plan.galleryStart, textPages: plan.textPages } : null), [plan, data, kit]);

  const measure = (
    <div ref={root} aria-hidden className="pointer-events-none invisible fixed top-0 -left-[10000px]" style={{ width: MEASURE_WIDTH }}>
      {measured.map((c) => (
        <TextPage key={c.number} kit={kit} entries={c.entries} folio={1} bookTitle="" chapterTitle="" recto={false} leadIn={false} tail style={{ width: MEASURE_WIDTH, aspectRatio: `${format.widthMm} / ${format.heightMm}` }} />
      ))}
    </div>
  );
  return { sheets, ctx, measure };
}
