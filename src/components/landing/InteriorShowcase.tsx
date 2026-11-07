"use client";

import { useEffect, useState } from "react";
import { Link, useMessages } from "@/i18n/client";
import { InteriorSpread, type SpreadKind, type SpreadSample } from "@/components/interior/InteriorSpread";
import { formats } from "@/lib/book/formats";
import { getInteriorDesign, interiorDesigns, type InteriorDesign, type InteriorId } from "@/lib/book/interiors";
import { cn } from "@/lib/class-names";

const spreads: SpreadKind[] = ["chapter", "photos", "front", "toc"];

/** С чего начинаем показ: самые выразительные начальные полосы. */
const TOUR: InteriorId[] = ["oyu", "stars", "romance", "mountains", "editorial", "shanyrak", "watercolor", "deco", "confetti", "album"];
const TOUR_MS = 3200;
/** Сколько стилей видно сразу на широком экране; остальные — по кнопке «Ещё». На телефоне — лента со всеми. */
const FIRST = 12;

/** Образец цвета дизайна для переключателя: фон начальной полосы (или акцент) и цвет орнамента. */
function swatch(d: InteriorDesign) {
  const base = d.opener.fill?.paper ?? d.palette.accent;
  return `linear-gradient(135deg, ${base} 0 55%, ${d.palette.ornament} 55% 100%)`;
}

/**
 * «Примерьте оформление» на лендинге: разворот книги-примера, который перелистывается в выбранный
 * дизайн. Пока посетитель не выбрал сам, дизайны сменяют друг друга; первое касание это останавливает.
 * При «уменьшении движения» автосмены нет.
 */
export function InteriorShowcase({ sample, cta }: { sample: SpreadSample; cta: string }) {
  const m = useMessages();
  const t = m.landing.interiors;
  const names = m.catalog.interiors;
  const [design, setDesign] = useState<InteriorId>(TOUR[0]);
  const [kind, setKind] = useState<SpreadKind>("chapter");
  const [touring, setTouring] = useState(true);
  const [all, setAll] = useState(false);

  useEffect(() => {
    if (!touring || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => setDesign((d) => TOUR[(TOUR.indexOf(d) + 1) % TOUR.length]), TOUR_MS);
    return () => clearInterval(timer);
  }, [touring]);

  const pick = (id: InteriorId) => {
    setTouring(false);
    setDesign(id);
  };
  const current = getInteriorDesign(design);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-center gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16">
      <div>
        <h2 className="font-serif text-4xl leading-[1.05] font-medium tracking-tight text-balance sm:text-5xl">{t.title(interiorDesigns.length)}</h2>
        <p className="mt-4 leading-relaxed text-muted">{t.text}</p>
        <div
          className="no-scrollbar -mx-4 mt-7 flex scroll-px-4 gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0"
          role="radiogroup"
          aria-label={t.aria}
        >
          {interiorDesigns.map((d, i) => (
            <button
              key={d.id}
              type="button"
              role="radio"
              aria-checked={d.id === design}
              onClick={() => pick(d.id)}
              className={cn(
                "inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border pr-3 pl-1.5 text-sm transition",
                d.id === design ? "border-ink bg-ink text-white" : "border-line bg-white text-ink-soft hover:border-ink/30 hover:text-ink",
                !all && i >= FIRST && d.id !== design && "lg:hidden",
              )}
            >
              <span aria-hidden className="size-6 rounded-[5px] ring-1 ring-black/10" style={{ background: swatch(d) }} />
              {names[d.id].name}
            </button>
          ))}
          {interiorDesigns.length > FIRST ? (
            <button type="button" onClick={() => setAll((v) => !v)} aria-expanded={all} className="hidden h-9 items-center rounded-lg px-3 text-sm font-medium text-wine hover:bg-wine/5 lg:inline-flex">
              {all ? t.less : t.more(interiorDesigns.length - FIRST)}
            </button>
          ) : null}
        </div>
        <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
          <Link href={cta} className="btn btn-primary">
            {t.cta}
          </Link>
          <span className="text-sm text-muted">{t.note}</span>
        </div>
      </div>

      <div>
        <div className="rounded-[14px] bg-sunken/70 p-3 sm:p-7" onPointerEnter={() => setTouring(false)}>
          <InteriorSpread key={design} design={current} format={formats.a5} sample={sample} kind={kind} className="animate-[vt-fade_450ms_ease-out_both] rounded-[3px] shadow-book" />
        </div>
        <div className="mt-4 flex flex-col items-center gap-3 text-center">
          <div role="radiogroup" aria-label={m.books.pages.spreadsAria} className="inline-flex gap-1 rounded-[12px] bg-sunken p-1">
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
                className={cn("h-9 rounded-[9px] px-4 text-sm font-medium transition", kind === k ? "bg-white text-ink shadow-soft" : "text-muted hover:text-ink")}
              >
                {m.books.pages.spreads[k]}
              </button>
            ))}
          </div>
          {/* Пока дизайны сменяются сами, не зачитываем каждую смену */}
          <p className="min-h-10 max-w-md text-sm text-muted" aria-live={touring ? "off" : "polite"}>
            <span className="font-medium text-ink">{names[design].name}</span> — {names[design].description}
          </p>
        </div>
      </div>
    </div>
  );
}
