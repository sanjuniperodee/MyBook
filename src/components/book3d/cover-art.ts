import { renderCoverSvg, type CoverTemplate } from "@/lib/book/covers";
import { coverSpreadGeometry, type BookFormat, type Rect } from "@/lib/book/formats";
import type { BookDims } from "@/lib/book/book-model";

/**
 * Обрезает развёртку обложки до нужной стороны, чтобы браузер растрировал только её.
 * Фильтры фактуры заданы как «100% области просмотра» — после обрезки это размер стороны, а не развёртки,
 * и фактура пропадает на куске справа и снизу, поэтому размер области фильтра задаётся явно.
 */
export function cropSvg(svg: string, r: Rect, spread: { w: number; h: number }) {
  return svg
    .replace(/viewBox="[^"]*"/, `viewBox="${r.x} ${r.y} ${r.w} ${r.h}"`)
    .replace(/preserveAspectRatio="[^"]*"/, 'preserveAspectRatio="none"')
    .replace(/(<filter [^>]*?)width="100%" height="100%"/g, `$1width="${spread.w}" height="${spread.h}"`);
}

export const svgUrl = (svg: string) => `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;

export interface CoverArt {
  /** Лицо с фото клиента: SVG встраивается как есть (картинка-SVG не грузит чужие файлы). */
  frontInline: string | null;
  /** Фоны сторон — CSS `url(...)` с картинкой-SVG. */
  front: string;
  back: string;
  spine: string;
}

/** Арт обложки по сторонам: из одной развёртки, обрезанной под лицо, оборот и корешок. photoHref — data-URL фото клиента. */
export function buildCoverArt(template: CoverTemplate, format: BookFormat, pageCount: number, dims: BookDims, photoHref?: string): CoverArt {
  const g = coverSpreadGeometry(format, pageCount);
  const uid = `bo${template.id}${format.id}`;
  const flat = renderCoverSvg(template, g, { uid });
  const photo = template.requiresPhoto && photoHref ? renderCoverSvg(template, g, { uid: `${uid}p`, photoHref }) : null;
  const { front, back, spine } = dims.rects;
  return {
    frontInline: photo ? cropSvg(photo, front, dims.spread) : null,
    front: svgUrl(cropSvg(flat, front, dims.spread)),
    back: svgUrl(cropSvg(flat, back, dims.spread)),
    spine: svgUrl(cropSvg(flat, spine, dims.spread)),
  };
}
