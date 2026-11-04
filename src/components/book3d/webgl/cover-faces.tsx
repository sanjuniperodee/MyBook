import type { CSSProperties } from "react";
import { CoverText } from "@/components/cover/CoverPreview";
import { CoverLayers } from "@/components/cover/CoverLayers";
import { boardSize, type CoverDesign } from "@/lib/book/cover-design";
import { getFormat } from "@/lib/book/formats";
import { coverPhotoUrl } from "@/lib/book/photo-cover";
import { photoUrl } from "@/lib/urls";
import { CoverBackLayer } from "@/components/cover/CoverBack";
import { CoverSpineText } from "@/components/cover/CoverSpine";
import type { BackDesign } from "@/lib/book/cover-back";
import type { CoverTemplate } from "@/lib/book/covers";
import type { PhotoRef } from "@/lib/book/covers/svg-kit";
import type { CoverArt } from "../cover-art";

/**
 * Стороны обложки как обычная вёрстка — из неё растеризуются текстуры. Размеры текста — в cqw от ширины стороны:
 * те же пропорции, что у PDF обложки. Блика и теней здесь нет: ими занимается освещение сцены.
 */
const box = (width: number, height: number): CSSProperties => ({ position: "relative", width, height, overflow: "hidden", containerType: "inline-size" });

/** Слои обложки из конструктора на стороне 3D-книги: на лице — вместо текста шаблона, на обороте — вместо варианта. */
export function DesignFace({ design, format, title, subtitle, names, uid = "b3" }: { design: Pick<CoverDesign, "layers">; format?: string; title: string; subtitle?: string; names?: string; uid?: string }) {
  return (
    <CoverLayers
      design={design}
      texts={{ title, subtitle: subtitle ?? "", names: names ?? "" }}
      board={boardSize(getFormat(format ?? "a5"))}
      photoSrc={(id) => photoUrl(id, "view")}
      stockSrc={(key) => coverPhotoUrl(key, 1400)}
      uid={uid}
    />
  );
}

export function CoverFrontFace({ template, art, title, subtitle, names, titlePlaceholder, width, height, widthMm, design, format }: { template: CoverTemplate; art: CoverArt; title: string; subtitle?: string; names?: string; titlePlaceholder?: string; width: number; height: number; widthMm: number; design?: CoverDesign | null; format?: string }) {
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
      {design ? <DesignFace design={design} format={format} title={title || titlePlaceholder || ""} subtitle={subtitle} names={names} /> : <CoverText template={template} title={title} subtitle={subtitle} names={names} titlePlaceholder={titlePlaceholder} />}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{ background: `linear-gradient(90deg, rgba(0,0,0,.2) 0, rgba(0,0,0,0) 1%, rgba(0,0,0,.18) ${hingePct.toFixed(2)}%, rgba(255,255,255,.08) ${(hingePct + 0.7).toFixed(2)}%, rgba(0,0,0,0) ${(hingePct + 3.5).toFixed(2)}%)` }}
      />
    </div>
  );
}

export function CoverBackFace({
  art,
  design,
  layers,
  underlay,
  texts,
  format,
  photos,
  brand,
  width,
  height,
  widthMm,
  heightMm,
}: {
  art: CoverArt;
  design: BackDesign;
  /** Оборот из конструктора: его слои (вместо варианта оборота). */
  layers?: CoverDesign["layers"];
  /** «Как спереди»: фото, фигуры и украшения лица под текстом оборота. */
  underlay?: CoverDesign["layers"];
  texts?: { title: string; subtitle: string; names: string };
  format?: string;
  photos?: (PhotoRef | undefined)[];
  brand: string;
  width: number;
  height: number;
  widthMm: number;
  heightMm: number;
}) {
  return (
    <div style={box(width, height)}>
      <div className="absolute inset-0" style={{ backgroundImage: art.back, backgroundSize: "100% 100%" }} />
      {underlay?.length ? <DesignFace design={{ layers: underlay }} format={format} title="" uid="b3r" /> : null}
      {layers ? <DesignFace design={{ layers }} format={format} title={texts?.title ?? ""} subtitle={texts?.subtitle} names={texts?.names} uid="b3b" /> : null}
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
