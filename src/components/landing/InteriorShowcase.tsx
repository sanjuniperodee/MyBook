"use client";

import { useEffect, useRef, useState } from "react";
import { Link, useMessages } from "@/i18n/client";
import { InteriorSpread, type SpreadKind, type SpreadSample } from "@/components/interior/InteriorSpread";
import { formats } from "@/lib/book/formats";
import { getInteriorDesign, interiorDesigns, type InteriorDesign, type InteriorId } from "@/lib/book/interiors";
import { cn } from "@/lib/class-names";

const spreads: SpreadKind[] = ["chapter", "photos", "front", "toc"];

/** С чего начинаем показ: самые выразительные начальные полосы. */
const TOUR: InteriorId[] = ["oyu", "stars", "romance", "mountains", "editorial", "shanyrak", "watercolor", "deco", "confetti", "album"];
const TOUR_MS = 3200;
/** Сколько стилей видно сразу в боковом списке; остальные — по кнопке «Ещё». На телефоне — лента со всеми. */
const FIRST = 10;

/** Образец цвета дизайна для переключателя: фон начальной полосы (или акцент) и цвет орнамента. */
function swatch(d: InteriorDesign) {
  const base = d.opener.fill?.paper ?? d.palette.accent;
  return `linear-gradient(135deg, ${base} 0 55%, ${d.palette.ornament} 55% 100%)`;
}

/**
 * «Примерьте оформление» на лендинге: большой разворот книги-примера, который перелистывается в выбранный дизайн.
 * Слева (на телефоне — лентой под разворотом) перечень оформлений, как в образцах шрифтов; пока посетитель не выбрал
 * сам, дизайны сменяют друг друга — но только пока блок на экране, чтобы не перерисовывать невидимое. Первое касание
 * это останавливает. При «уменьшении движения» автосмены нет.
 */
export function InteriorShowcase({ sample, cta }: { sample: SpreadSample; cta: string }) {
  const m = useMessages();
  const t = m.landing.interiors;
  const names = m.catalog.interiors;
  const [design, setDesign] = useState<InteriorId>(TOUR[0]);
  const [kind, setKind] = useState<SpreadKind>("chapter");
  const [touring, setTouring] = useState(true);
  const [visible, setVisible] = useState(false);
  const [all, setAll] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!touring || !visible || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => setDesign((d) => TOUR[(TOUR.indexOf(d) + 1) % TOUR.length]), TOUR_MS);
    return () => clearInterval(timer);
  }, [touring, visible]);

  const pick = (id: InteriorId) => {
    setTouring(false);
    setDesign(id);
  };
  const current = getInteriorDesign(design);

  return (
    <div ref={root}>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between lg:gap-16">
        <div className="max-w-2xl">
          <h2 className="font-serif text-[34px] leading-[1.05] font-medium tracking-tight text-balance sm:text-5xl">{t.title(interiorDesigns.length)}</h2>
          <p className="mt-4 max-w-xl leading-relaxed text-muted">{t.text}</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 lg:pb-1">
          <Link href={cta} className="btn btn-dark btn-lg">
            {t.cta}
          </Link>
          <span className="max-w-[15rem] text-sm leading-snug text-muted">{t.note}</span>
        </div>
      </div>

      <div className="mt-10 grid grid-cols-[minmax(0,1fr)] gap-6 lg:mt-12 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10 xl:grid-cols-[17rem_minmax(0,1fr)]">
        {/* Перечень оформлений: на телефоне — лента под разворотом, на широком экране — столбик слева */}
        <div
          className="no-scrollbar -mx-4 flex scroll-px-4 gap-2 overflow-x-auto px-4 pb-1 max-lg:order-2 lg:mx-0 lg:flex-col lg:gap-1.5 lg:overflow-visible lg:px-0 lg:pb-0"
          role="radiogroup"
          aria-label={t.aria}
        >
          {interiorDesigns.map((d, i) => {
            const on = d.id === design;
            return (
              <button
                key={d.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => pick(d.id)}
                className={cn(
                  "inline-flex h-11 shrink-0 items-center gap-3 rounded-(--r-ctl) border pr-4 pl-2 text-left text-[15px] transition-colors lg:w-full",
                  on ? "border-ink bg-ink text-white" : "border-line bg-white text-ink-soft hover:border-ink/30 hover:text-ink",
                  !all && i >= FIRST && !on && "lg:hidden",
                )}
              >
                <span aria-hidden className="size-7 shrink-0 rounded-[5px] ring-1 ring-black/10" style={{ background: swatch(d) }} />
                {names[d.id].name}
              </button>
            );
          })}
          {interiorDesigns.length > FIRST ? (
            <button type="button" onClick={() => setAll((v) => !v)} aria-expanded={all} className="hidden h-11 items-center px-2 text-sm font-medium text-wine hover:underline lg:inline-flex">
              {all ? t.less : t.more(interiorDesigns.length - FIRST)}
            </button>
          ) : null}
        </div>

        <div className="min-w-0">
          <div className="rounded-(--r-sheet) bg-sunken/80 p-3 sm:p-8 lg:p-10" onPointerEnter={() => setTouring(false)}>
            <InteriorSpread key={design} design={current} format={formats.a5} sample={sample} kind={kind} className="animate-[vt-fade_450ms_ease-out_both] rounded-[3px] shadow-book" />
          </div>
          <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
            {/* Пока дизайны сменяются сами, не зачитываем каждую смену */}
            <p className="min-h-12 max-w-xl text-[15px] leading-snug text-muted" aria-live={touring ? "off" : "polite"}>
              <span className="font-medium text-ink">{names[design].name}</span> — {names[design].description}
            </p>
            <div role="radiogroup" aria-label={m.books.pages.spreadsAria} className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:shrink-0 sm:px-0">
              {spreads.map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={kind === k}
                  onClick={() => {
                    setTouring(false);
                    setKind(k);
                  }}
                  className={cn("h-11 shrink-0 rounded-(--r-ctl) border px-4 text-sm font-medium transition-colors", kind === k ? "border-ink bg-ink text-white" : "border-line bg-white text-ink-soft hover:border-ink/30 hover:text-ink")}
                >
                  {m.books.pages.spreads[k]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
