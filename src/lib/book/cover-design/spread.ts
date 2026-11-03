/**
 * Фон развёртки обложки там, где это не рисунок шаблона: свой фон лица из конструктора (на всю развёртку, градиент на
 * обороте — зеркально) и свой фон оборота поверх (задняя крышка с загибом и шарниром и корешок). Одни и те же фрагменты
 * рисуют PDF для типографии, 3D-книга, превью оборота в кабинете и холст конструктора — поэтому цвет оборота на экране
 * и в печати один.
 */
import { n } from "../covers/svg-kit";
import type { CoverGeometry, Rect } from "../formats";
import { backgroundArt, backOwnArt } from "./geometry";
import { backFill } from "./template";
import type { CoverBack, CoverBackground, CoverDesign } from "./types";

const own = (bg?: CoverBackground | null) => (bg && bg.kind !== "template" ? bg : null);

/**
 * Слои своего фона развёртки в мм: base — вместо рисунка шаблона (null — рисунок шаблона), over — поверх него и его
 * фактуры (свой фон оборота и корешка; "" — нет).
 */
export function ownSpreadArt(front: CoverDesign | null, back: CoverBack | null, g: CoverGeometry, uid: string): { base: string | null; over: string } {
  const f = own(front?.background);
  const b = own(back?.background);
  return { base: f ? backgroundArt(f, g, uid) : null, over: b ? backOwnArt(b, g, `${uid}k`) : "" };
}

/** Фрагмент развёртки в своём SVG с окном rect (мм). */
export const svgWindow = (body: string, r: Rect) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${n(r.x)} ${n(r.y)} ${n(r.w)} ${n(r.h)}" preserveAspectRatio="none">${body}</svg>`;

/**
 * Фон задней крышки (или окна вокруг неё) для экрана: SVG своего фона или null — тогда это рисунок оборота шаблона.
 * g — развёртка, rect — окно в её мм.
 */
export function backFaceSvg(front: CoverDesign | null, back: CoverBack | null, g: CoverGeometry, rect: Rect, uid: string): string | null {
  if (!backFill(front, back)) return null;
  const art = ownSpreadArt(front, back, g, uid);
  return svgWindow((art.base ?? "") + art.over, rect);
}
