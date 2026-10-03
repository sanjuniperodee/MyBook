"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { ChevronLeft, ChevronRight, Maximize2, Minimize2 } from "lucide-react";
import { useMessages } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { CoverPreview, type CoverPreviewProps } from "@/components/cover/CoverPreview";
import { DedicationPage, EndPage, OpenerPage, pageKit, TextPage, TitlePage, TocPage, type PageKit, type SampleEntry } from "@/components/interior/BookPage";
import { cqwUnits } from "@/components/interior/units";
import { getCoverTemplate } from "@/lib/book/covers";
import { getFormat } from "@/lib/book/formats";
import { getInteriorDesign } from "@/lib/book/interiors";
import { interiorMetrics } from "@/lib/book/layout";
import { bookShift, clampPos, planFaces, planSheets, RENDER_WINDOW, settle, visibleSpread, type Face, type Sheet } from "@/lib/book/flipbook";
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
}

/** Ширина, на которой считаем разбивку текста по страницам. Вёрстка в cqw, так что от размера на экране она не зависит. */
const MEASURE_WIDTH = 640;
/** Расстояние между листами по глубине, px: чтобы стопка не «мерцала» (z-fighting). */
const Z_STEP = 0.25;

interface FaceContext {
  data: FlipbookData;
  kit: PageKit;
  /** Номера полос, с которых начинаются главы. */
  chapterStarts: number[];
}

const faceBox = "absolute inset-0 size-full";
const hideBack: CSSProperties = { backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" };

function Endpaper() {
  return <div className={faceBox} style={{ background: "linear-gradient(135deg,#efe7d8,#e4d9c4)" }} />;
}

function FaceView({ face, no, ctx }: { face: Face; no: number; ctx: FaceContext }) {
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

/** Затемнение полосы по мере поворота листа и тень у корешка. */
function Shade({ side, angle }: { side: "front" | "back"; angle: number }) {
  const turn = Math.sin((angle * Math.PI) / 180);
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: side === "front" ? "linear-gradient(to right, rgba(0,0,0,.2), rgba(0,0,0,.04) 9%, transparent 22%)" : "linear-gradient(to left, rgba(0,0,0,.2), rgba(0,0,0,.04) 9%, transparent 22%)" }}
      />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-black" style={{ opacity: turn * 0.12 }} />
    </>
  );
}

const Leaf = memo(function Leaf({ index, angle, near, sheet, ctx, backColor }: { index: number; angle: number; near: boolean; sheet: Sheet; ctx: FaceContext; backColor: string }) {
  let front: React.ReactNode = null;
  let back: React.ReactNode = null;
  if (near) {
    if (sheet.kind === "cover") {
      front = <CoverPreview {...ctx.data.cover} className={faceBox} />;
      back = <Endpaper />;
    } else if (sheet.kind === "back") {
      front = <Endpaper />;
      back = <div className={faceBox} style={{ background: backColor }} />;
    } else {
      front = <FaceView face={sheet.front} no={sheet.frontNo} ctx={ctx} />;
      back = <FaceView face={sheet.back} no={sheet.backNo} ctx={ctx} />;
    }
  }
  const board = sheet.kind !== "pages";
  return (
    <div
      className="absolute top-0 left-1/2 h-full w-1/2"
      style={{ transformOrigin: "left center", transformStyle: "preserve-3d", transform: `translateZ(${(angle < 90 ? -index : index) * Z_STEP}px) rotateY(${-angle}deg)` }}
    >
      <div className={cn("absolute inset-0 overflow-hidden bg-white", board ? "rounded-r-[3px] shadow-[0_1px_2px_rgba(0,0,0,.25)]" : "")} style={hideBack}>
        {front}
        <Shade side="front" angle={angle} />
      </div>
      <div className={cn("absolute inset-0 overflow-hidden bg-white", board ? "rounded-l-[3px]" : "")} style={{ ...hideBack, transform: "rotateY(180deg)" }}>
        {back}
        <Shade side="back" angle={angle} />
      </div>
    </div>
  );
});

const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

interface DragState {
  x0: number;
  base: number;
  pageW: number;
  moved: boolean;
  lastX: number;
  lastT: number;
  velocity: number;
}

export function Flipbook3D({ data, className }: { data: FlipbookData; className?: string }) {
  const t = useMessages().books.preview;
  const f = t.flip;
  const format = getFormat(data.formatId);
  const design = useMemo(() => getInteriorDesign(data.interiorId), [data.interiorId]);
  const kit = useMemo(() => pageKit(design, format, cqwUnits(format.widthMm), data.language), [design, format, data.language]);
  const backColor = getCoverTemplate(data.cover.template).back.color;

  // ── Разбивка текста глав по страницам: меряем невидимую копию с теми же колонками, что в TextPage ──
  const measureRoot = useRef<HTMLDivElement>(null);
  const [textPages, setTextPages] = useState<number[] | null>(null);
  const measure = useCallback(() => {
    const root = measureRoot.current;
    if (!root) return;
    const m = interiorMetrics[format.id];
    const side = (m.marginInner + m.marginOuter) / 2;
    const gapPx = (2 * side * MEASURE_WIDTH) / format.widthMm;
    const next = Array.from(root.querySelectorAll<HTMLElement>("[data-flow]"), (el) => Math.max(1, Math.round((el.scrollWidth + gapPx) / (el.clientWidth + gapPx))));
    setTextPages((prev) => (prev && prev.length === next.length && prev.every((n, i) => n === next[i]) ? prev : next));
  }, [format]);
  const measuredChapters = useMemo(() => data.chapters.filter((c) => c.entries.length), [data.chapters]);
  useLayoutEffect(() => {
    measure();
    // Шрифты подгружаются после первой отрисовки и меняют разбивку.
    const fonts = typeof document !== "undefined" ? document.fonts : undefined;
    fonts?.ready.then(measure);
    fonts?.addEventListener("loadingdone", measure);
    return () => fonts?.removeEventListener("loadingdone", measure);
  }, [measure, measuredChapters, design]);

  const plan = useMemo(() => {
    if (!textPages) return null;
    let k = 0;
    const perChapter = data.chapters.map((c) => (c.entries.length ? (textPages[k++] ?? 1) : 0));
    return planFaces({ hasDedication: !!data.dedication, hasToc: data.showToc, textPages: perChapter });
  }, [textPages, data.chapters, data.dedication, data.showToc]);
  const sheets = useMemo(() => (plan ? planSheets(plan.faces) : []), [plan]);
  const ctx = useMemo<FaceContext | null>(() => (plan ? { data, kit, chapterStarts: plan.chapterStarts } : null), [plan, data, kit]);

  // ── Положение книги: одно число — сколько листов перевёрнуто; угол каждого листа выводится из него ──
  const count = sheets.length;
  const [pos, setPos] = useState(0);
  const posRef = useRef(0);
  const target = useRef(0);
  const raf = useRef(0);
  const drag = useRef<DragState | null>(null);

  const place = useCallback((v: number) => {
    posRef.current = v;
    setPos(v);
  }, []);
  const animateTo = useCallback(
    (to: number) => {
      cancelAnimationFrame(raf.current);
      const from = posRef.current;
      const dist = Math.abs(to - from);
      if (!dist) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return place(to);
      const duration = Math.min(1500, 700 + 110 * Math.max(0, dist - 1));
      const t0 = performance.now();
      const step = (now: number) => {
        const k = Math.min(1, (now - t0) / duration);
        place(from + (to - from) * easeInOut(k));
        if (k < 1) raf.current = requestAnimationFrame(step);
      };
      raf.current = requestAnimationFrame(step);
    },
    [place],
  );
  const goTo = useCallback(
    (n: number) => {
      target.current = Math.round(clampPos(n, count));
      animateTo(target.current);
    },
    [animateTo, count],
  );
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  // Состав страниц изменился (например, дописали ответ) — не оставляем книгу за пределами.
  useEffect(() => {
    if (count && posRef.current > count - 1) {
      target.current = count - 1;
      place(count - 1);
    }
  }, [count, place]);

  // ── Жесты: перетаскивание листа, клик по половине книги, клавиатура ──
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!count || (e.pointerType === "mouse" && e.button !== 0)) return;
    cancelAnimationFrame(raf.current);
    const rect = e.currentTarget.getBoundingClientRect();
    drag.current = { x0: e.clientX, base: Math.round(posRef.current), pageW: rect.width / 2, moved: false, lastX: e.clientX, lastT: e.timeStamp, velocity: 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.abs(e.clientX - d.x0) < 6) return;
    d.moved = true;
    const dt = e.timeStamp - d.lastT;
    if (dt > 0) d.velocity = (-(e.clientX - d.lastX) / d.pageW) / dt;
    d.lastX = e.clientX;
    d.lastT = e.timeStamp;
    place(clampPos(Math.min(d.base + 1, Math.max(d.base - 1, d.base - (e.clientX - d.x0) / d.pageW)), count));
  };
  const endDrag = (e: PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (!d.moved) {
      if (cancelled) return;
      // Клик: по правой половине — вперёд, по левой — назад; закрытая книга листается целиком.
      const rect = e.currentTarget.getBoundingClientRect();
      const r = Math.round(posRef.current);
      const forward = r === 0 ? true : r === count - 1 ? false : e.clientX > rect.left + rect.width / 2;
      goTo(r + (forward ? 1 : -1));
      return;
    }
    goTo(settle(d.base, posRef.current, cancelled ? 0 : d.velocity, count));
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const keys: Record<string, number> = { ArrowRight: target.current + 1, PageDown: target.current + 1, ArrowLeft: target.current - 1, PageUp: target.current - 1, Home: 0, End: count - 1 };
    if (!(e.key in keys)) return;
    e.preventDefault();
    goTo(keys[e.key]);
  };

  // ── Полный экран ──
  const wrapper = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  const canFull = useSyncExternalStore(
    () => () => {},
    () => document.fullscreenEnabled,
    () => false,
  );
  useEffect(() => {
    const sync = () => setFull(document.fullscreenElement === wrapper.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void wrapper.current?.requestFullscreen();
  };

  const rounded = Math.round(pos);
  const spread = count ? visibleSpread(rounded, count) : { left: null, right: null };
  const label = !count ? f.loading : rounded === 0 ? f.cover : rounded === count - 1 ? f.backCover : f.pages(spread.left, spread.right);
  const aspect = `${format.widthMm * 2} / ${format.heightMm}`;
  const shift = count ? bookShift(pos, count) : 0;

  return (
    <div
      ref={wrapper}
      className={cn("flex flex-col items-center gap-4", full && "justify-center bg-paper p-4", className)}
      style={{ "--book-h": full ? "calc(100dvh - 8rem)" : "min(72dvh, 760px)" } as CSSProperties}
    >
      {/* Невидимая копия глав — только чтобы узнать, сколько страниц займёт текст */}
      <div ref={measureRoot} aria-hidden className="pointer-events-none fixed top-0 -left-[10000px] invisible" style={{ width: MEASURE_WIDTH }}>
        {measuredChapters.map((c) => (
          <TextPage key={c.number} kit={kit} entries={c.entries} folio={1} bookTitle="" chapterTitle="" recto={false} leadIn={false} style={{ width: MEASURE_WIDTH, aspectRatio: `${format.widthMm} / ${format.heightMm}` }} />
        ))}
      </div>

      <div
        role="group"
        aria-label={f.group}
        aria-roledescription="book"
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => endDrag(e, false)}
        onPointerCancel={(e) => endDrag(e, true)}
        className="relative cursor-grab touch-pan-y rounded-lg select-none focus-visible:outline-offset-8 active:cursor-grabbing"
        style={{ width: `min(100%, calc(var(--book-h) * ${(format.widthMm * 2) / format.heightMm}))`, aspectRatio: aspect, containerType: "inline-size" }}
      >
        {/* Тень на «столе»: центр всегда посередине (закрытая книга сдвинута к нему), сужается у закрытой */}
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-[3%] h-[6%] -translate-x-1/2 rounded-[50%] bg-black/30 blur-xl"
          style={{ left: "50%", width: `${45 + 50 * (1 - Math.abs(shift) * 2)}%` }}
        />
        <div className="absolute inset-0" style={{ perspective: "400cqw" }}>
          {count ? (
            <div className="absolute inset-0" style={{ transformStyle: "preserve-3d", transform: `translateX(${shift * 50}%) rotateX(4deg)` }}>
              {sheets.map((sheet, i) => (
                <Leaf
                  key={i}
                  index={i}
                  // Угол листа: 0 — лежит справа, 180 — перевёрнут налево.
                  angle={Math.min(1, Math.max(0, pos - i)) * 180}
                  near={Math.abs(i - pos) <= RENDER_WINDOW}
                  sheet={sheet}
                  ctx={ctx!}
                  backColor={backColor}
                />
              ))}
            </div>
          ) : (
            <div className="absolute inset-y-0 right-0 flex w-1/2 items-center justify-center rounded-r-[3px] bg-cream/70 text-sm text-muted">{f.loading}</div>
          )}
        </div>
      </div>

      <div className="flex w-full max-w-xl items-center gap-3">
        <button type="button" className="btn btn-outline btn-sm" aria-label={f.prev} disabled={!count || rounded <= 0} onClick={() => goTo(target.current - 1)}>
          <ChevronLeft className="size-4" />
        </button>
        <input
          type="range"
          aria-label={f.slider}
          min={0}
          max={Math.max(0, count - 1)}
          step={1}
          value={rounded}
          disabled={!count}
          onChange={(e) => goTo(Number(e.target.value))}
          className="min-w-0 flex-1 accent-wine"
        />
        <button type="button" className="btn btn-outline btn-sm" aria-label={f.next} disabled={!count || rounded >= count - 1} onClick={() => goTo(target.current + 1)}>
          <ChevronRight className="size-4" />
        </button>
        {canFull ? (
          <button type="button" className="btn btn-outline btn-sm" aria-label={full ? f.exitFullscreen : f.fullscreen} title={full ? f.exitFullscreen : f.fullscreen} onClick={toggleFull}>
            {full ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </button>
        ) : null}
      </div>
      <p aria-live="polite" className="text-sm font-medium text-ink-soft">
        {label}
      </p>
      <p className="max-w-xl text-center text-xs text-muted">
        {f.hint} {f.approx}
      </p>
    </div>
  );
}
