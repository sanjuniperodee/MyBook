import type { CSSProperties } from "react";
import { CoverText } from "@/components/cover/CoverPreview";
import { CoverBackLayer } from "@/components/cover/CoverBack";
import { CoverSpineText } from "@/components/cover/CoverSpine";
import type { BackDesign } from "@/lib/book/cover-back";
import type { CoverTemplate } from "@/lib/book/covers";
import type { PhotoRef } from "@/lib/book/cover-kit";
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

export function CoverBackFace({ art, design, photos, brand, width, height, widthMm, heightMm }: { art: CoverArt; design: BackDesign; photos?: (PhotoRef | undefined)[]; brand: string; width: number; height: number; widthMm: number; heightMm: number }) {
  return (
    <div style={box(width, height)}>
      <div className="absolute inset-0" style={{ backgroundImage: art.back, backgroundSize: "100% 100%" }} />
      <CoverBackLayer design={design} widthMm={widthMm} heightMm={heightMm} photos={photos} brand={brand} />
    </div>
  );
}

export function CoverSpineFace({ template, art, title, names, width, height, widthMm, heightMm }: { template: CoverTemplate; art: CoverArt; title: string; names?: string; width: number; height: number; widthMm: number; heightMm: number }) {
  return (
    <div style={box(width, height)}>
      <div className="absolute inset-0" style={{ backgroundImage: art.spine, backgroundSize: "100% 100%" }} />
      <CoverSpineText template={template} title={title} names={names} widthMm={widthMm} heightMm={heightMm} />
    </div>
  );
}
