"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Heart } from "lucide-react";
import { useLocale, useMessages } from "@/i18n/client";
import type { Messages } from "@/i18n/messages";
import { cn } from "@/lib/utils";

/**
 * Листаемая книга-пример: те же шрифты и композиция, что в PDF для печати.
 * На широком экране — развороты с перелистыванием, на телефоне — по странице со свайпом.
 * Размеры внутри страницы заданы в cqw, поэтому вёрстка масштабируется как настоящая.
 */

const body = "font-[family-name:var(--font-ptserif)] text-[3.55cqw] leading-[1.6] text-[#1f1a17] text-justify hyphens-auto";

function Folio({ n }: { n: number }) {
  return <div className="absolute inset-x-0 bottom-[4.5%] text-center font-[family-name:var(--font-ptserif)] text-[2.6cqw] text-[#9a8f86]">{n}</div>;
}

function Ornament() {
  return (
    <div className="my-[4cqw] flex items-center justify-center gap-[2cqw] text-[#b4a99e]">
      <span className="h-px w-[9cqw] bg-current" />
      <span className="size-[1.6cqw] rotate-45 bg-current" />
      <span className="h-px w-[9cqw] bg-current" />
    </div>
  );
}

/** Иллюстрация вместо фото клиента: вечерние горы над Алматы. */
function PhotoArt() {
  return (
    <svg viewBox="0 0 400 300" className="block size-full" aria-hidden>
      <defs>
        <linearGradient id="sb-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f1b48c" />
          <stop offset="0.55" stopColor="#f6d5b8" />
          <stop offset="1" stopColor="#fbe9da" />
        </linearGradient>
        <linearGradient id="sb-far" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b98a8a" />
          <stop offset="1" stopColor="#d9b3a8" />
        </linearGradient>
      </defs>
      <rect width="400" height="300" fill="url(#sb-sky)" />
      <circle cx="285" cy="118" r="30" fill="#fff4e6" opacity="0.9" />
      <path d="M0 190 L60 120 L95 150 L150 80 L205 145 L240 110 L300 170 L345 125 L400 165 L400 300 L0 300Z" fill="url(#sb-far)" />
      <path d="M150 80 L168 102 L158 100 L150 112 L140 99 L132 102Z M345 125 L356 138 L348 137 L341 145 L336 136Z" fill="#fff" opacity="0.85" />
      <path d="M0 230 L70 185 L120 215 L190 170 L260 220 L320 190 L400 225 L400 300 L0 300Z" fill="#8f5f63" />
      <path d="M0 265 L90 240 L180 262 L270 238 L400 262 L400 300 L0 300Z" fill="#5e3b40" />
      <g fill="#3f272b">
        <circle cx="178" cy="248" r="5" />
        <rect x="174" y="252" width="8" height="18" rx="3" />
        <circle cx="194" cy="246" r="5" />
        <rect x="190" y="250" width="8" height="20" rx="3" />
      </g>
    </svg>
  );
}

type Sample = Messages["landing"]["sample"];

/** Страницы примера — на языке сайта (тот же текст, что увидит покупатель в своей книге). */
const buildPages = (s: Sample, lang: string): { key: string; render: (n: number) => ReactNode }[] => [
  {
    key: "title",
    render: () => (
      <div className="flex h-full flex-col items-center justify-center px-[12%] text-center">
        <div className="font-[family-name:var(--font-montserrat)] text-[2.3cqw] tracking-[0.3em] text-[#9a8f86] uppercase">{s.names}</div>
        <div className="mt-[8cqw] font-serif text-[10cqw] leading-[1.05] text-[#1f1a17]">{s.title}</div>
        <div className="mt-[3cqw] font-serif text-[4.4cqw] text-[#7a7068] italic">{s.subtitle}</div>
        <Ornament />
        <div className="absolute inset-x-0 bottom-[9%] font-[family-name:var(--font-montserrat)] text-[2.1cqw] tracking-[0.25em] text-[#b4a99e] uppercase">{s.imprint}</div>
      </div>
    ),
  },
  {
    key: "dedication",
    render: () => (
      <div className="flex h-full flex-col items-center justify-center px-[16%] text-center">
        <p className="font-serif text-[5.4cqw] leading-[1.45] text-[#3b332e] italic">
          {s.dedication}
        </p>
        <div className="mt-[6cqw] font-hand text-[6cqw] text-[#7a1f2b]">{s.dedicationSign}</div>
      </div>
    ),
  },
  {
    key: "toc",
    render: (n) => (
      <div className="h-full px-[13%] pt-[16%]">
        <div className="font-serif text-[7cqw] text-[#1f1a17]">{s.toc}</div>
        <ul className="mt-[6cqw] space-y-[2.6cqw] font-[family-name:var(--font-ptserif)] text-[3.3cqw] text-[#3b332e]">
          {s.tocItems.map(([t, p], i) => (
            <li key={String(t)} className="flex items-baseline gap-[1.5cqw]">
              <span className="w-[5cqw] shrink-0 text-[#b4a99e]">{i + 1}</span>
              <span className="shrink-0">{t}</span>
              <span className="mb-[0.8cqw] flex-1 border-b border-dotted border-[#cfc6bc]" />
              <span className="tabular-nums">{p}</span>
            </li>
          ))}
        </ul>
        <Folio n={n} />
      </div>
    ),
  },
  {
    key: "opener",
    render: () => (
      <div className="flex h-full flex-col items-center justify-center px-[14%] text-center">
        <div className="font-[family-name:var(--font-montserrat)] text-[2.4cqw] tracking-[0.3em] text-[#9a8f86] uppercase">{s.chapterLabel}</div>
        <div className="mt-[4cqw] font-serif text-[9cqw] leading-[1.08] text-[#1f1a17]">{s.chapterTitle}</div>
        <Ornament />
        <div className="font-[family-name:var(--font-ptserif)] text-[3.2cqw] text-[#7a7068] italic">{s.epigraph}</div>
      </div>
    ),
  },
  {
    key: "text",
    render: (n) => (
      <div className="h-full px-[12%] pt-[12%]" lang={lang}>
        <div className="font-serif text-[6.4cqw] leading-tight text-[#1f1a17]">{s.h1}</div>
        <p className={cn(body, "mt-[3cqw]")}>
          {s.p1}
        </p>
        <p className={cn(body, "mt-[1.6cqw]")}>
          {s.p2}
        </p>
        <div className="mt-[5cqw] font-serif text-[6.4cqw] leading-tight text-[#1f1a17]">{s.h2}</div>
        <p className={cn(body, "mt-[3cqw]")}>
          {s.p3}
        </p>
        <Folio n={n} />
      </div>
    ),
  },
  {
    key: "photo",
    render: (n) => (
      <div className="h-full px-[12%] pt-[12%]" lang={lang}>
        <p className={body}>
          {s.p4}
        </p>
        <figure className="mx-auto mt-[4cqw] w-[74%] rotate-[-1.5deg] border border-[#e5ddd4] bg-white p-[2.6cqw] pb-0 shadow-[0_1px_2px_rgba(0,0,0,.08)]">
          <div className="aspect-[4/3] overflow-hidden">
            <PhotoArt />
          </div>
          <figcaption className="py-[2.2cqw] text-center font-hand text-[4.6cqw] text-[#3a332e]">{s.caption}</figcaption>
        </figure>
        <p className={cn(body, "mt-[4cqw]")}>
          {s.p5}
        </p>
        <Folio n={n} />
      </div>
    ),
  },
  {
    key: "letter",
    render: (n) => (
      <div className="h-full px-[12%] pt-[12%]" lang={lang}>
        <div className="font-[family-name:var(--font-montserrat)] text-[2.3cqw] tracking-[0.3em] text-[#9a8f86] uppercase">{s.lettersLabel}</div>
        <div className="mt-[3cqw] font-serif text-[6.4cqw] leading-tight text-[#1f1a17]">{s.letterFrom}</div>
        <p className={cn(body, "mt-[3cqw] italic")}>
          {s.letter}
        </p>
        <div className="mt-[4cqw] text-right font-hand text-[5.2cqw] text-[#7a1f2b]">{s.letterSign}</div>
        <Folio n={n} />
      </div>
    ),
  },
  {
    key: "end",
    render: () => (
      <div className="flex h-full flex-col items-center justify-center px-[14%] text-center">
        <Heart className="size-[7cqw] fill-[#7a1f2b] text-[#7a1f2b]" />
        <div className="mt-[5cqw] font-serif text-[7cqw] leading-tight text-[#1f1a17] italic">{s.end}</div>
        <div className="mt-[4cqw] font-[family-name:var(--font-ptserif)] text-[3cqw] text-[#7a7068]">{s.endNote}</div>
      </div>
    ),
  },
];

const FOLIO_START = 5; // номер первой страницы примера в книге

function Page({ pages, index, side, className }: { pages: ReturnType<typeof buildPages>; index: number; side: "left" | "right"; className?: string }) {
  const p = pages[index];
  return (
    <div className={cn("@container relative size-full overflow-hidden bg-[#fbf9f5] text-left", className)}>
      {p ? p.render(FOLIO_START + index) : null}
      <div
        className={cn(
          "pointer-events-none absolute inset-y-0 w-[14%]",
          side === "left" ? "right-0 bg-gradient-to-l from-black/[.09] to-transparent" : "left-0 bg-gradient-to-r from-black/[.09] to-transparent",
        )}
      />
    </div>
  );
}

const FLIP_MS = 650;

export function SampleBook() {
  const s = useMessages().landing.sample;
  const locale = useLocale();
  const pages = useMemo(() => buildPages(s, locale), [s, locale]);
  const [spread, setSpread] = useState(0); // индекс левой страницы разворота / 2
  const [flip, setFlip] = useState<null | "next" | "prev">(null);
  const [mobilePage, setMobilePage] = useState(0);
  const touch = useRef<number | null>(null);
  const spreads = pages.length / 2;

  const go = useCallback(
    (dir: "next" | "prev") => {
      if (flip) return;
      if (dir === "next" && spread >= spreads - 1) return;
      if (dir === "prev" && spread <= 0) return;
      setFlip(dir);
      setTimeout(() => {
        setSpread((s) => s + (dir === "next" ? 1 : -1));
        setFlip(null);
      }, FLIP_MS);
    },
    [flip, spread, spreads],
  );

  const goMobile = useCallback((d: number) => setMobilePage((p) => Math.min(pages.length - 1, Math.max(0, p + d))), [pages.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.getElementById("sample-book");
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) return; // только когда книга на экране
      if (e.key === "ArrowRight") {
        go("next");
        goMobile(1);
      } else if (e.key === "ArrowLeft") {
        go("prev");
        goMobile(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, goMobile]);

  const L = spread * 2;
  // Во время перелистывания под листом уже видна следующая (или предыдущая) страница.
  const underLeft = flip === "prev" ? L - 2 : L;
  const underRight = flip === "next" ? L + 3 : L + 1;

  const nav = (disabledPrev: boolean, disabledNext: boolean, onPrev: () => void, onNext: () => void, label: string) => (
    <div className="mt-6 flex items-center justify-center gap-4">
      <button type="button" onClick={onPrev} disabled={disabledPrev} className="flex size-11 items-center justify-center rounded-full border border-white/20 text-paper transition hover:bg-white/10 disabled:opacity-30" aria-label={s.prev}>
        <ChevronLeft className="size-5" />
      </button>
      <span className="min-w-24 text-center text-sm text-paper/60 tabular-nums">{label}</span>
      <button type="button" onClick={onNext} disabled={disabledNext} className="flex size-11 items-center justify-center rounded-full border border-white/20 text-paper transition hover:bg-white/10 disabled:opacity-30" aria-label={s.next}>
        <ChevronRight className="size-5" />
      </button>
    </div>
  );

  return (
    <div id="sample-book" className="select-none">
      {/* Развороты — от md */}
      <div className="hidden md:block">
        <div className="relative mx-auto aspect-[296/210] w-full [perspective:2400px]">
          <div className="absolute inset-0 grid grid-cols-2 overflow-hidden rounded-[3px] shadow-[0_40px_80px_-30px_rgba(0,0,0,.75)]">
            <button type="button" className="relative cursor-w-resize" onClick={() => go("prev")} aria-label={s.back} disabled={spread === 0}>
              <Page pages={pages} index={underLeft} side="left" />
            </button>
            <button type="button" className="relative cursor-e-resize" onClick={() => go("next")} aria-label={s.forward} disabled={spread >= spreads - 1}>
              <Page pages={pages} index={underRight} side="right" />
            </button>
          </div>
          {flip ? (
            <div
              className={cn("absolute inset-y-0 w-1/2 [transform-style:preserve-3d]", flip === "next" ? "left-1/2 origin-left animate-[sb-flip-next_650ms_ease-in-out_forwards]" : "left-0 origin-right animate-[sb-flip-prev_650ms_ease-in-out_forwards]")}
            >
              <div className="absolute inset-0 [backface-visibility:hidden]">
                <Page pages={pages} index={flip === "next" ? L + 1 : L} side={flip === "next" ? "right" : "left"} />
              </div>
              <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]">
                <Page pages={pages} index={flip === "next" ? L + 2 : L - 1} side={flip === "next" ? "left" : "right"} />
              </div>
            </div>
          ) : null}
          <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-black/10" />
        </div>
        {nav(spread === 0 || !!flip, spread >= spreads - 1 || !!flip, () => go("prev"), () => go("next"), `${FOLIO_START + L}–${FOLIO_START + L + 1}`)}
      </div>

      {/* По странице — на телефоне */}
      <div className="md:hidden">
        <div
          className="relative mx-auto aspect-[148/210] w-full max-w-sm overflow-hidden rounded-[3px] shadow-[0_30px_60px_-25px_rgba(0,0,0,.75)]"
          onPointerDown={(e) => (touch.current = e.clientX)}
          onPointerUp={(e) => {
            if (touch.current === null) return;
            const dx = e.clientX - touch.current;
            touch.current = null;
            if (Math.abs(dx) > 40) goMobile(dx < 0 ? 1 : -1);
            else goMobile(e.clientX > e.currentTarget.getBoundingClientRect().left + e.currentTarget.clientWidth / 2 ? 1 : -1);
          }}
        >
          <div className="flex h-full transition-transform duration-500 ease-out" style={{ transform: `translateX(-${mobilePage * 100}%)` }}>
            {pages.map((p, i) => (
              <div key={p.key} className="h-full w-full shrink-0">
                <Page pages={pages} index={i} side={i % 2 ? "right" : "left"} />
              </div>
            ))}
          </div>
        </div>
        {nav(mobilePage === 0, mobilePage === pages.length - 1, () => goMobile(-1), () => goMobile(1), `${mobilePage + 1} / ${pages.length}`)}
      </div>
    </div>
  );
}
