"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cssFont, type Typography } from "@/lib/book/fonts";
import type { BookFormat } from "@/lib/book/formats";
import { INLINE_PHOTO_SHARE, interiorMetrics } from "@/lib/book/layout";

const PT_TO_MM = 25.4 / 72;

export interface PreviewPhoto {
  id: string;
  url: string;
  width: number;
  height: number;
  caption: string;
}

/**
 * HTML-копия страниц книги с теми же шрифтами, кеглем и полями, что в PDF.
 * Текст раскладывается по страницам через CSS-колонки размером с текстовую область:
 * каждая колонка — отдельная страница, страницы листаются вертикально.
 */
export function PagePreview({
  format,
  typography,
  heading,
  answer,
  photos = [],
}: {
  format: BookFormat;
  typography: Typography;
  heading: string | null;
  answer: string;
  photos?: PreviewPhoto[];
}) {
  const m = interiorMetrics[format.id];
  const W = format.widthMm;
  const H = format.heightMm;
  const side = (m.marginInner + m.marginOuter) / 2;
  const wrap = useRef<HTMLDivElement>(null);
  const firstFlow = useRef<HTMLDivElement>(null);
  const [pageW, setPageW] = useState(0);
  const [pages, setPages] = useState(1);

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const update = () => setPageW(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const px = pageW / W; // пикселей на миллиметр
  const textW = (W - side * 2) * px;
  const textH = (H - m.marginTop - m.marginBottom) * px;
  const gap = side * 2 * px;
  const bodyPx = typography.bodySize * m.scale * PT_TO_MM * px;

  const measure = useCallback(() => {
    const el = firstFlow.current;
    if (!el || !textW) return;
    const n = Math.max(1, Math.round((el.scrollWidth + gap) / (textW + gap)));
    setPages((p) => (p === n ? p : n));
  }, [textW, gap]);

  useEffect(() => {
    measure();
  }, [measure, heading, answer, photos, pageW]);

  const paragraphs = answer
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const flow = (k: number) => (
    <div
      ref={k === 0 ? firstFlow : undefined}
      lang="ru"
      style={{
        width: textW,
        height: textH,
        columnWidth: textW,
        columnGap: gap,
        columnFill: "auto",
        transform: k ? `translateX(${-k * (textW + gap)}px)` : undefined,
        color: "#1f1a17",
      }}
    >
      {heading ? (
        <div
          style={{
            fontFamily: cssFont(typography.heading),
            fontWeight: typography.headingWeight,
            fontStyle: typography.headingItalic ? "italic" : "normal",
            fontSize: bodyPx * 1.55,
            lineHeight: 1.22,
            marginBottom: 8 * m.scale * PT_TO_MM * px,
            breakAfter: "avoid",
          }}
        >
          {heading}
        </div>
      ) : null}
      {paragraphs.length ? (
        paragraphs.map((p, i) => (
          <p
            key={i}
            style={{
              fontFamily: cssFont(typography.body),
              fontSize: bodyPx,
              lineHeight: typography.lineHeight,
              marginBottom: bodyPx * 0.45,
              textAlign: "justify",
              hyphens: "auto",
              orphans: 2,
              widows: 2,
            }}
          >
            {p}
          </p>
        ))
      ) : photos.length ? null : (
        <p style={{ fontFamily: cssFont(typography.body), fontSize: bodyPx, lineHeight: typography.lineHeight, color: "#b4a99e", fontStyle: "italic" }}>Здесь появится ваш ответ…</p>
      )}
      {photos.map((ph) => {
        const maxH = textH * INLINE_PHOTO_SHARE;
        const ratio = ph.width / ph.height;
        const w = Math.min(textW, maxH * ratio);
        return (
          <figure key={ph.id} style={{ breakInside: "avoid", margin: `${bodyPx * 0.5}px 0 ${bodyPx}px`, textAlign: "center" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={ph.url} alt={ph.caption} onLoad={measure} style={{ width: w, height: w / ratio, objectFit: "cover", display: "inline-block" }} />
            {ph.caption ? (
              <figcaption style={{ fontFamily: cssFont(typography.body), fontStyle: "italic", fontSize: bodyPx * 0.86, color: "#7a7068", marginTop: bodyPx * 0.5 }}>{ph.caption}</figcaption>
            ) : null}
          </figure>
        );
      })}
    </div>
  );

  return (
    <div ref={wrap} className="space-y-4">
      {pageW
        ? Array.from({ length: pages }, (_, k) => (
            <div key={k} className="relative bg-white shadow-[0_1px_3px_rgba(0,0,0,.06),0_20px_40px_-20px_rgba(0,0,0,.25)]" style={{ width: pageW, height: H * px }}>
              <div className="absolute overflow-hidden" style={{ left: side * px, top: m.marginTop * px, width: textW, height: textH }}>
                {flow(k)}
              </div>
              <div className="absolute inset-x-0 text-center text-muted" style={{ bottom: (m.marginBottom / 2 - 3) * px, fontSize: 2.8 * px, fontFamily: cssFont(typography.body) }}>
                {pages > 1 ? `${k + 1} / ${pages}` : ""}
              </div>
            </div>
          ))
        : <div className="bg-white" style={{ aspectRatio: `${W} / ${H}` }} />}
    </div>
  );
}
