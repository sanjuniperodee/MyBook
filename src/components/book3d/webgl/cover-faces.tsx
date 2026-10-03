import type { CSSProperties } from "react";
import { CoverText } from "@/components/cover/CoverPreview";
import type { CoverTemplate } from "@/lib/book/covers";
import { cssFont } from "@/lib/book/fonts";
import { spineFontMm } from "@/lib/book/book-model";
import type { CoverArt } from "../cover-art";

/**
 * Стороны обложки как обычная вёрстка — из неё растеризуются текстуры. Размеры текста — в cqw от ширины стороны:
 * те же пропорции, что у PDF обложки. Блика и теней здесь нет: ими занимается освещение сцены.
 */
const box = (width: number, height: number): CSSProperties => ({ position: "relative", width, height, overflow: "hidden", containerType: "inline-size" });

export function CoverFrontFace({ template, art, title, subtitle, names, titlePlaceholder, width, height, widthMm }: { template: CoverTemplate; art: CoverArt; title: string; subtitle?: string; names?: string; titlePlaceholder?: string; width: number; height: number; widthMm: number }) {
  // Шарнир у корешка: еле заметная канавка, как на настоящей книге.
  const hinge = Math.min(14, widthMm * 0.05);
  const hingePct = (hinge / widthMm) * 100;
  return (
    <div style={box(width, height)}>
      {art.frontInline ? (
        <div className="absolute inset-0 [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: art.frontInline }} />
      ) : (
        <div className="absolute inset-0" style={{ backgroundImage: art.front, backgroundSize: "100% 100%" }} />
      )}
      <CoverText template={template} title={title} subtitle={subtitle} names={names} titlePlaceholder={titlePlaceholder} />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{ background: `linear-gradient(90deg, rgba(0,0,0,.2) 0, rgba(0,0,0,0) 1%, rgba(0,0,0,.18) ${hingePct.toFixed(2)}%, rgba(255,255,255,.08) ${(hingePct + 0.7).toFixed(2)}%, rgba(0,0,0,0) ${(hingePct + 3.5).toFixed(2)}%)` }}
      />
    </div>
  );
}

export function CoverBackFace({ template, art, backText, brand, width, height, widthMm, heightMm }: { template: CoverTemplate; art: CoverArt; backText: string; brand: string; width: number; height: number; widthMm: number; heightMm: number }) {
  return (
    <div style={box(width, height)}>
      <div className="absolute inset-0" style={{ backgroundImage: art.back, backgroundSize: "100% 100%" }} />
      {backText ? (
        <div
          className="absolute flex justify-center text-center"
          style={{ left: "15%", top: "30%", width: "70%", fontFamily: cssFont(template.back.font), fontStyle: "italic", fontSize: `${((12 * 25.4) / 72 / widthMm) * 100}cqw`, lineHeight: 1.5, color: template.back.color }}
        >
          {backText}
        </div>
      ) : null}
      <div
        className="absolute inset-x-0 text-center uppercase"
        style={{ top: `${((heightMm - 16) / heightMm) * 100}%`, fontFamily: cssFont("montserrat"), fontWeight: 500, fontSize: `${((6.5 * 25.4) / 72 / widthMm) * 100}cqw`, letterSpacing: "0.3em", color: template.back.color, opacity: 0.75 }}
      >
        {brand}
      </div>
    </div>
  );
}

export function CoverSpineFace({ template, art, text, width, height, widthMm, heightMm }: { template: CoverTemplate; art: CoverArt; text: string; width: number; height: number; widthMm: number; heightMm: number }) {
  const size = spineFontMm(widthMm);
  return (
    <div style={box(width, height)}>
      <div className="absolute inset-0" style={{ backgroundImage: art.spine, backgroundSize: "100% 100%" }} />
      {size && text ? (
        // Надпись идёт вдоль корешка снизу вверх, как в PDF; размеры — в cqw от ширины корешка.
        <div
          className="absolute top-1/2 left-1/2 flex items-center justify-center whitespace-nowrap"
          style={{ width: `${(heightMm / widthMm) * 100}cqw`, height: "100cqw", transform: "translate(-50%, -50%) rotate(-90deg)", fontFamily: cssFont(template.spine.font), fontWeight: 500, fontSize: `${(size / widthMm) * 100}cqw`, color: template.spine.color }}
        >
          <span className="truncate" style={{ maxWidth: "92%" }}>
            {text}
          </span>
        </div>
      ) : null}
    </div>
  );
}
