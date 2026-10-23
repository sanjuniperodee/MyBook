/**
 * Лицевая сторона обложки из конструктора: фон (рисунок шаблона с фото клиента, свой цвет или градиент) и слои.
 * Пропорции — как у крышки в развёртке для типографии (картон на кант больше блока), поэтому превью совпадает с печатью.
 * wrap — сколько миллиметров загиба показать вокруг крышки (редактор); в превью — 0.
 */
import { getCoverTemplate, renderCoverSvg } from "@/lib/book/covers";
import type { PhotoRef } from "@/lib/book/covers/svg-kit";
import { backgroundArt, boardSize, canvasGeometry, type CoverDesign, type CoverTexts } from "@/lib/book/cover-design";
import { getFormat } from "@/lib/book/formats";
import { coverPhotoUrl } from "@/lib/book/photo-cover";
import { n } from "@/lib/book/covers/svg-kit";
import { photoUrl } from "@/lib/urls";
import { cn } from "@/lib/class-names";
import { CoverLayers, type CoverLayersProps } from "./CoverLayers";

const samplePhotoHref = (key: string) => coverPhotoUrl(key, 1000);

/** Фон холста: рисунок шаблона (с фото клиента в его местах) или свой цвет/градиент — SVG в мм. */
export function designBackgroundSvg(templateId: string, formatId: string, design: CoverDesign, opts: { wrap?: number; uid: string; photos?: (PhotoRef | undefined)[]; lite?: boolean }) {
  const format = getFormat(formatId);
  const g = canvasGeometry(format, opts.wrap ?? 0);
  if (design.background.kind !== "template")
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(g.width)} ${n(g.height)}" preserveAspectRatio="xMidYMid slice">${backgroundArt(design.background, g, opts.uid)}</svg>`;
  const template = getCoverTemplate(templateId);
  return renderCoverSvg(
    template,
    g,
    { uid: opts.uid, photos: opts.photos, sampleHref: samplePhotoHref, imageHref: template.photo ? coverPhotoUrl(template.photo.photo.key, opts.lite ? 900 : 1800) : undefined },
    { noTexture: opts.lite },
  );
}

export interface DesignedCoverProps extends Partial<Pick<CoverLayersProps, "placeholders" | "layerProps">> {
  template: string;
  format?: string;
  design: CoverDesign;
  texts: CoverTexts;
  /** Фото клиента в местах шаблона (фон «шаблон»). */
  photos?: (PhotoRef | undefined)[];
  wrap?: number;
  uid?: string;
  lite?: boolean;
  className?: string;
  /** Поверх слоёв (рамка выделения, направляющие) — в координатах крышки. */
  overlay?: React.ReactNode;
  /** Ref элемента крышки — редактор считает по нему координаты. */
  boardRef?: React.Ref<HTMLDivElement>;
}

export function DesignedCover({ template, format: formatId = "a5", design, texts, photos, wrap = 0, uid = "dc", lite, className, overlay, boardRef, placeholders, layerProps }: DesignedCoverProps) {
  const format = getFormat(formatId);
  const board = boardSize(format);
  const g = canvasGeometry(format, wrap);
  const svg = designBackgroundSvg(template, format.id, design, { wrap, uid, photos, lite });
  return (
    <div className={cn("relative overflow-hidden select-none", className)} style={{ aspectRatio: `${g.width} / ${g.height}`, background: "#EEE8E0" }}>
      <div className="absolute inset-0 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
      <div
        ref={boardRef}
        className="absolute"
        style={{ left: `${(g.front.x / g.width) * 100}%`, top: `${(g.front.y / g.height) * 100}%`, width: `${(board.w / g.width) * 100}%`, height: `${(board.h / g.height) * 100}%`, containerType: "inline-size" }}
      >
        <CoverLayers
          design={design}
          texts={texts}
          board={board}
          photoSrc={(id) => photoUrl(id, lite ? "thumb" : "view")}
          stockSrc={(key) => coverPhotoUrl(key, lite ? 900 : 1600)}
          placeholders={placeholders}
          layerProps={layerProps}
          uid={uid}
        />
        {overlay}
      </div>
    </div>
  );
}
