import type { BackDesign } from "@/lib/book/cover-back";
import { photoHref, type PhotoRef } from "@/lib/book/cover-kit";
import { cssFrame } from "@/lib/book/photo-frame";
import { cssFont } from "@/lib/book/fonts";
import { Ornament } from "./CoverPreview";

/** #RRGGBB и прозрачность → rgba(). */
const hexAlpha = (hex: string, a: number) => `rgba(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(",")},${a})`;

/**
 * Задняя сторона поверх фона — по той же раскладке, что и PDF (src/lib/book/cover-back.ts).
 * Контейнер — задняя крышка с container-type: inline-size; размеры — в % и cqw от её ширины.
 */
export function CoverBackLayer({ design, widthMm, heightMm, photos = [], brand }: { design: BackDesign; widthMm: number; heightMm: number; photos?: (PhotoRef | undefined)[]; brand: string }) {
  const x = (v: number) => `${(v / widthMm) * 100}%`;
  const y = (v: number) => `${(v / heightMm) * 100}%`;
  const cq = (v: number) => `${(v / widthMm) * 100}cqw`;
  return (
    <>
      {design.blocks.map((b, i) => {
        const box = { position: "absolute" as const, left: x(b.x), top: y(b.y), width: x(b.w) };
        if (b.kind === "text")
          return (
            <div
              key={i}
              style={{
                ...box,
                fontFamily: cssFont(b.font),
                fontSize: cq(b.size),
                lineHeight: b.lineHeight,
                fontStyle: b.italic ? "italic" : "normal",
                fontWeight: b.weight,
                color: b.color,
                textAlign: b.align,
                letterSpacing: b.tracking ? `${b.tracking}em` : undefined,
                textTransform: b.upper ? "uppercase" : undefined,
                whiteSpace: "pre-line",
                overflowWrap: "anywhere",
                hyphens: "auto",
              }}
            >
              {b.text}
            </div>
          );
        if (b.kind === "ornament")
          return (
            <div key={i} style={{ ...box, height: y(b.h), display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Ornament kind={b.ornament} color={b.color} size={cq(b.w)} />
            </div>
          );
        if (b.kind === "shade")
          return <div key={i} style={{ ...box, height: y(b.h), background: `linear-gradient(to bottom, transparent ${b.from * 100}%, ${hexAlpha(b.color, b.opacity)})` }} />;
        const ref = photos[b.slot];
        const url = photoHref(ref);
        const img = url ? (
          // Обёртка обрезает увеличенный снимок по месту (масштаб кадра выходит за рамку).
          <div data-photo-slot={b.slot} style={{ width: "100%", height: "100%", overflow: "hidden" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" draggable={false} style={{ display: "block", width: "100%", height: "100%", objectFit: "cover", ...cssFrame(typeof ref === "string" ? null : ref?.frame) }} />
          </div>
        ) : (
          <div style={{ width: "100%", height: "100%", background: "#e9e4dc" }} />
        );
        if (b.frame === "bleed") return <div key={i} style={{ ...box, height: y(b.h) }}>{img}</div>;
        const polaroid = b.frame === "polaroid";
        return (
          <div
            key={i}
            style={{
              ...box,
              height: y(b.h),
              padding: polaroid ? `${cq(b.mat)} ${cq(b.mat)} ${cq(b.matBottom ?? b.mat)}` : cq(b.mat),
              background: "#fff",
              boxShadow: "0 0.6cqw 1.6cqw rgba(0,0,0,.22)",
              transform: b.rotate ? `rotate(${b.rotate}deg)` : undefined,
            }}
          >
            {img}
          </div>
        );
      })}
      <div
        style={{ position: "absolute", left: 0, right: 0, top: y(design.brand.y), textAlign: "center", textTransform: "uppercase", fontFamily: cssFont("montserrat"), fontWeight: 500, fontSize: cq(design.brand.size), letterSpacing: "0.3em", color: design.brand.color, opacity: 0.75 }}
      >
        {brand}
      </div>
    </>
  );
}
