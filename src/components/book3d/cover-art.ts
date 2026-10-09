import { cropSvg, renderCoverSvg, type CoverTemplate } from "@/lib/book/covers";

export { cropSvg };
import { coverSpreadGeometry, type BookFormat } from "@/lib/book/formats";
import type { BookDims } from "@/lib/book/book-model";

export const svgUrl = (svg: string) => `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;

export interface CoverArt {
  /** Лицо с фото клиента: SVG встраивается как есть (картинка-SVG не грузит чужие файлы). */
  frontInline: string | null;
  /** Фоны сторон — CSS `url(...)` с картинкой-SVG. */
  front: string;
  back: string;
  spine: string;
}

/**
 * Арт обложки по сторонам: из одной развёртки, обрезанной под лицо, оборот и корешок. photos — data-URL фото клиента
 * по местам шаблона; imageHref — data-URL снимка обложки на готовом снимке (картинка-SVG не загружает внешние файлы;
 * пока снимок грузится — подложка); plainBack — оборот без повтора композиции лица (под «Полароидами»).
 */
export function buildCoverArt(
  template: CoverTemplate,
  format: BookFormat,
  pageCount: number,
  dims: BookDims,
  opts: { photos?: (string | undefined)[]; imageHref?: string; plainBack?: boolean } = {},
): CoverArt {
  const g = coverSpreadGeometry(format, pageCount);
  const uid = `bo${template.id}${format.id}`;
  const { photos, plainBack = false } = opts;
  const flat = renderCoverSvg(template, g, { uid, imageHref: opts.imageHref ?? (template.photo ? "data:," : undefined) }, { plainBack });
  const photo = template.requiresPhoto && photos?.some(Boolean) ? renderCoverSvg(template, g, { uid: `${uid}p`, photos }) : null;
  const { front, back, spine } = dims.rects;
  return {
    frontInline: photo ? cropSvg(photo, front, dims.spread) : null,
    front: svgUrl(cropSvg(flat, front, dims.spread)),
    back: svgUrl(cropSvg(flat, back, dims.spread)),
    spine: svgUrl(cropSvg(flat, spine, dims.spread)),
  };
}
