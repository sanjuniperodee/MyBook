"use client";

import { useEffect, useRef, useState } from "react";
import { cssFont, type Typography } from "@/lib/book/fonts";
import type { BookFormat } from "@/lib/book/formats";
import { interiorMetrics } from "@/lib/book/layout";

const PT_TO_MM = 25.4 / 72;

/** Приблизительная HTML-копия страницы книги с теми же шрифтами, кеглем и полями, что в PDF. */
export function PagePreview({
  format,
  typography,
  heading,
  answer,
  pageNumber,
}: {
  format: BookFormat;
  typography: Typography;
  heading: string | null;
  answer: string;
  pageNumber?: number;
}) {
  const m = interiorMetrics[format.id];
  const W = format.widthMm;
  const side = (m.marginInner + m.marginOuter) / 2;
  const bodyMm = typography.bodySize * m.scale * PT_TO_MM;
  const cq = (mm: number) => `${(mm / W) * 100}cqw`;
  const body = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);

  useEffect(() => {
    const el = body.current;
    if (!el) return;
    const check = () => setOverflow(el.scrollHeight > el.clientHeight + 2);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [heading, answer]);

  const paragraphs = answer
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <div className="relative bg-white shadow-[0_1px_3px_rgba(0,0,0,.06),0_20px_40px_-20px_rgba(0,0,0,.25)]" style={{ aspectRatio: `${W} / ${format.heightMm}`, containerType: "inline-size" }}>
      <div
        ref={body}
        className="absolute overflow-hidden"
        style={{ left: cq(side), right: cq(side), top: cq(m.marginTop), bottom: cq(m.marginBottom) }}
        lang="ru"
      >
        {heading ? (
          <div
            style={{
              fontFamily: cssFont(typography.heading),
              fontWeight: typography.headingWeight,
              fontStyle: typography.headingItalic ? "italic" : "normal",
              fontSize: cq(bodyMm * 1.55),
              lineHeight: 1.22,
              marginBottom: cq(8 * m.scale * PT_TO_MM),
              color: "#1f1a17",
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
                fontSize: cq(bodyMm),
                lineHeight: typography.lineHeight,
                marginBottom: cq(bodyMm * 0.45),
                textAlign: "justify",
                hyphens: "auto",
                color: "#1f1a17",
              }}
            >
              {p}
            </p>
          ))
        ) : (
          <p style={{ fontFamily: cssFont(typography.body), fontSize: cq(bodyMm), lineHeight: typography.lineHeight, color: "#b4a99e", fontStyle: "italic" }}>
            Здесь появится ваш ответ…
          </p>
        )}
        {overflow ? <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[12%] bg-gradient-to-t from-white to-transparent" /> : null}
      </div>
      {overflow ? (
        <div className="absolute inset-x-0 text-center text-muted italic" style={{ bottom: cq(m.marginBottom * 0.62), fontSize: cq(2.6) }}>
          продолжение на следующей странице →
        </div>
      ) : null}
      {pageNumber ? (
        <div className="absolute inset-x-0 text-center text-muted" style={{ bottom: cq(m.marginBottom / 2 - 3), fontSize: cq(2.8), fontFamily: cssFont(typography.body) }}>
          {pageNumber}
        </div>
      ) : null}
    </div>
  );
}
