"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/class-names";

/**
 * «Ответьте на один вопрос»: что человек пишет, сразу появляется на свёрстанной странице книги.
 * Пока он не начал печатать, страница сама «пишет» пример — чтобы с первого взгляда было понятно, что произойдёт.
 */
export function TryPage({
  chapter,
  heading,
  question,
  sample,
  placeholder,
  hint,
  yours,
  folio,
  lang,
}: {
  chapter: string;
  heading: string;
  question: string;
  sample: string;
  placeholder: string;
  hint: string;
  yours: string;
  folio: number;
  lang: string;
}) {
  const [text, setText] = useState("");
  const [typed, setTyped] = useState(0);
  const [touched, setTouched] = useState(false);
  const page = useRef<HTMLDivElement>(null);

  // Пример печатается, когда страница попала на экран, и замирает, как только человек начал писать сам.
  useEffect(() => {
    if (touched) return;
    const el = page.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        if (reduce) return setTyped(sample.length);
        const step = (i: number) => {
          setTyped(i);
          if (i < sample.length) timer = setTimeout(() => step(i + 1), sample[i] === " " ? 55 : 38 + Math.random() * 40);
        };
        timer = setTimeout(() => step(1), 500);
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      clearTimeout(timer);
    };
  }, [sample, touched]);

  const mine = text.trim().length > 0;
  const body = mine ? text : sample.slice(0, typed);
  const typing = !mine && typed < sample.length;
  const [first, rest] = [body.slice(0, 1), body.slice(1)];

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:gap-10">
      {/* Страница книги */}
      <div ref={page} className="relative lg:order-2">
        <div className="relative mx-auto min-h-[380px] w-full lg:aspect-[148/210] lg:min-h-0 max-w-[420px] rotate-[0.6deg] rounded-[3px] bg-[#fbf8f2] px-[11%] pt-[13%] pb-[10%] shadow-[0_1px_0_#e9e1d3,0_30px_60px_-30px_rgb(60_30_20/0.45),0_12px_24px_-16px_rgb(60_30_20/0.25)]">
          {/* корешок и бумага */}
          <div className="pointer-events-none absolute inset-y-0 left-0 w-[9%] bg-gradient-to-r from-black/[.07] to-transparent" />
          <div className="pointer-events-none absolute inset-0 rounded-[3px] opacity-60 mix-blend-multiply [background-image:url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22160%22 height=%22160%22><filter id=%22n%22><feTurbulence type=%22fractalNoise%22 baseFrequency=%22.9%22 numOctaves=%222%22/><feColorMatrix values=%220 0 0 0 .55 0 0 0 0 .5 0 0 0 0 .45 0 0 0 .07 0%22/></filter><rect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23n)%22/></svg>')]" />
          <div className="relative flex h-full flex-col">
            <div className="text-center text-[10px] font-medium tracking-[0.22em] text-wine/80 uppercase sm:text-[11px]">{chapter}</div>
            <h3 className="mt-[9%] text-center font-serif text-[clamp(26px,7.5vw,38px)] leading-[1.05] font-medium text-ink italic">{heading}</h3>
            <div className="mx-auto mt-[6%] flex items-center gap-2 text-gold" aria-hidden>
              <span className="h-px w-8 bg-current" />
              <span className="size-1 rotate-45 bg-current" />
              <span className="h-px w-8 bg-current" />
            </div>
            <p className="mt-[9%] min-h-[4lh] font-serif text-[clamp(17px,4.6vw,21px)] leading-[1.45] text-ink-soft [hyphens:auto] [overflow-wrap:anywhere]" lang={lang}>
              {first ? <span className="float-left mt-[0.08em] mr-2 font-serif text-[3.3em] leading-[0.78] text-wine">{first}</span> : null}
              {rest}
              {typing || !body ? <span className="ml-px inline-block h-[1em] w-px translate-y-[0.15em] animate-pulse bg-ink/60 align-baseline" /> : null}
            </p>
            <div className="mt-auto text-center font-serif text-sm text-muted tabular-nums">{folio}</div>
          </div>
        </div>
        {/* Рукописная пометка появляется, когда текст — ваш */}
        <div
          className={cn(
            "pointer-events-none absolute -top-7 right-2 flex items-end gap-1 text-wine transition-all duration-500 sm:right-6",
            mine ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
          )}
          aria-hidden
        >
          <span className="rotate-[-4deg] font-hand text-2xl leading-none">{yours}</span>
          <svg className="h-9 w-10" viewBox="0 0 40 36" fill="none">
            <path d="M4 4 C 20 6, 30 14, 30 30" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M24 25 L 30 31 L 35 24" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>

      {/* Поле ответа */}
      <div className="lg:order-1 lg:pt-10">
        <label htmlFor="try-answer" className="block font-serif text-[26px] leading-tight text-ink sm:text-3xl">
          {question}
        </label>
        <textarea
          id="try-answer"
          rows={4}
          maxLength={420}
          value={text}
          onFocus={() => setTouched(true)}
          onChange={(e) => {
            setTouched(true);
            setText(e.target.value);
          }}
          placeholder={placeholder}
          className="mt-5 block w-full resize-none rounded-2xl border border-line bg-white px-4 py-3.5 text-[16px] leading-relaxed text-ink shadow-[inset_0_1px_2px_rgb(0_0_0/0.04)] placeholder:text-muted/70 focus:border-wine/50 focus:ring-4 focus:ring-wine/10 focus:outline-none"
        />
        <p className="mt-3 text-sm text-muted">{hint}</p>
      </div>
    </div>
  );
}
