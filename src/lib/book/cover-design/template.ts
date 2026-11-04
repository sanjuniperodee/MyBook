import type { CoverTemplate } from "../covers/types";
import { backgroundMid, inkOn } from "./geometry";
import type { CoverBack, CoverBackground, CoverDesign, CoverLayer } from "./types";

type OwnBackground = Exclude<CoverBackground, { kind: "template" }>;

const own = (bg?: CoverBackground | null): OwnBackground | null => (bg && bg.kind !== "template" ? bg : null);

/**
 * Чем залит оборот: свой фон оборота, иначе фон лица из конструктора (градиент — зеркально), иначе null — рисунок
 * оборота шаблона. Одно правило для PDF, 3D-книги, превью в кабинете и холста конструктора.
 */
export function backFill(front: CoverDesign | null, back: CoverBack | null): { bg: OwnBackground; mirror: boolean } | null {
  const b = own(back?.background);
  if (b) return { bg: b, mirror: false };
  const f = own(front?.background);
  return f ? { bg: f, mirror: true } : null;
}

/**
 * Что из лица повторяется на обороте «как спереди»: фото, фигуры и украшения на тех же местах — без надписей (на
 * обороте свой текст). Как у шаблонов, которые повторяют композицию лица на задней крышке. Со своим фоном оборота — ничего.
 */
export function repeatedFrontLayers(front: CoverDesign | null, back: CoverBack | null): CoverLayer[] {
  if (!front || own(back?.background)) return [];
  return front.layers.filter((l) => !l.hidden && l.kind !== "text" && (l.kind !== "image" || !!(l.photoId || l.stock)));
}

/** Корешок — в цвет оборота, если у оборота свой фон, иначе в цвет лица; null — корешок шаблона. */
export function spineFill(front: CoverDesign | null, back: CoverBack | null): OwnBackground | null {
  return own(back?.background) ?? own(front?.background);
}

/**
 * Шаблон, по которому рисуются корешок и оборот: цвета надписей — контрастные фону, который на них на самом деле
 * лежит. С фоном шаблона — сам шаблон; со своим фоном лица или оборота рисунка шаблона там нет — оборот без повтора
 * композиции лица, текст корешка и оборота — светлый или тёмный по фону.
 */
export function templateForCover(template: CoverTemplate, front: CoverDesign | null, back: CoverBack | null = null): CoverTemplate {
  const fill = backFill(front, back);
  const spine = spineFill(front, back);
  const frontOwn = own(front?.background);
  if (!fill && !spine) return template;
  const out: CoverTemplate = { ...template };
  if (fill) out.back = { ...template.back, color: inkOn(backgroundMid(fill.bg)), mirror: false };
  if (spine) out.spine = { ...template.spine, color: inkOn(backgroundMid(spine)) };
  // Свой фон лица: рисунка шаблона нет вовсе — ни фактуры, ни образца шаблона.
  if (frontOwn) {
    out.texture = undefined;
    out.swatch = backgroundMid(frontOwn);
  }
  return out;
}
