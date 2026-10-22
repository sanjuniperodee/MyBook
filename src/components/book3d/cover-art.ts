import { cropSvg, renderCoverSvg, type CoverTemplate } from "@/lib/book/covers";
import { backgroundArt, type CoverDesign } from "@/lib/book/cover-design";
import type { PhotoRef } from "@/lib/book/covers/svg-kit";

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
 * пока снимок грузится — подложка); plainBack — оборот без повтора композиции лица (под «Полароидами»);
 * samples — снимки-примеры обложки с фото клиента (data-URL по ключу) для пустых мест.
 */
export function buildCoverArt(
  template: CoverTemplate,
  format: BookFormat,
  pageCount: number,
  dims: BookDims,
  opts: { photos?: (PhotoRef | undefined)[]; imageHref?: string; plainBack?: boolean; samples?: Record<string, string>; /** Обложка из конструктора. */ design?: CoverDesign | null } = {},
): CoverArt {
  const g = coverSpreadGeometry(format, pageCount);
  const uid = `bo${template.id}${format.id}`;
  // Свой фон конструктора — цвет или градиент на всю развёртку, рисунка шаблона нет (слои кладёт лицевая сторона).
  const own = opts.design && opts.design.background.kind !== "template" ? opts.design.background : null;
  if (own) {
    const flat = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${g.width} ${g.height}" preserveAspectRatio="none">${backgroundArt(own, g, uid)}</svg>`;
    const { front, back, spine } = dims.rects;
    return { frontInline: null, front: svgUrl(cropSvg(flat, front, dims.spread)), back: svgUrl(cropSvg(flat, back, dims.spread)), spine: svgUrl(cropSvg(flat, spine, dims.spread)) };
  }
  const { photos, plainBack = false, samples } = opts;
  // Снимки-примеры (data-URL) — в пустые места под фото; без них рисуется пейзаж.
  const sampleHref = samples ? (k: string) => samples[k] ?? "" : undefined;
  const flat = renderCoverSvg(template, g, { uid, imageHref: opts.imageHref ?? (template.photo ? "data:," : undefined), sampleHref }, { plainBack });
  const photo = template.requiresPhoto && photos?.some(Boolean) ? renderCoverSvg(template, g, { uid: `${uid}p`, photos, sampleHref }) : null;
  const { front, back, spine } = dims.rects;
  return {
    frontInline: photo ? cropSvg(photo, front, dims.spread) : null,
    front: svgUrl(cropSvg(flat, front, dims.spread)),
    back: svgUrl(cropSvg(flat, back, dims.spread)),
    spine: svgUrl(cropSvg(flat, spine, dims.spread)),
  };
}
