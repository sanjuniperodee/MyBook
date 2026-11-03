/**
 * Фон оборота и корешка для экрана — из той же развёртки, что PDF: свой фон лица и оборота (backFaceSvg) или рисунок
 * шаблона, обрезанный по нужному куску. Встроенный SVG (не картинка): так в нём грузятся снимки шаблона.
 */
import { cropSvg, getCoverTemplate, renderCoverSvg } from "@/lib/book/covers";
import type { PhotoRef } from "@/lib/book/covers/svg-kit";
import { backFaceSvg, ownSpreadArt, svgWindow, type CoverBack, type CoverDesign } from "@/lib/book/cover-design";
import { coverSpreadGeometry, getFormat, type CoverGeometry, type Rect } from "@/lib/book/formats";
import { coverPhotoUrl } from "@/lib/book/photo-cover";
import { PREVIEW_PAGES } from "./CoverBackPreview";

const sampleHref = (key: string) => coverPhotoUrl(key, 1000);

function templateSpread(templateId: string, g: CoverGeometry, uid: string, photos?: (PhotoRef | undefined)[]) {
  const template = getCoverTemplate(templateId);
  return renderCoverSvg(template, g, { uid, photos, sampleHref, imageHref: template.photo ? coverPhotoUrl(template.photo.photo.key, 1800) : undefined }, { noTexture: true });
}

/** Холст конструктора оборота: задняя крышка и вокруг неё wrap мм развёртки (слева загиб, справа шарнир и корешок). */
export function backCanvasSvg(templateId: string, formatId: string, front: CoverDesign | null, back: CoverBack | null, wrap: number, uid: string) {
  const g = coverSpreadGeometry(getFormat(formatId), PREVIEW_PAGES);
  const b = g.back!;
  const win: Rect = { x: b.x - wrap, y: b.y - wrap, w: b.w + wrap * 2, h: b.h + wrap * 2 };
  return backFaceSvg(front, back, g, win, uid) ?? cropSvg(templateSpread(templateId, g, uid), win, { w: g.width, h: g.height });
}

/** Корешок: свой фон (лица или оборота) или кусок рисунка шаблона. */
export function spineSvg(templateId: string, formatId: string, front: CoverDesign | null, back: CoverBack | null, uid: string, photos?: (PhotoRef | undefined)[]) {
  const g = coverSpreadGeometry(getFormat(formatId), PREVIEW_PAGES);
  const s = g.spine!;
  const own = ownSpreadArt(front, back, g, uid);
  if (own.over) return svgWindow(own.over, s);
  if (own.base !== null) return svgWindow(own.base, s);
  return cropSvg(templateSpread(templateId, g, uid, photos), s, { w: g.width, h: g.height });
}
