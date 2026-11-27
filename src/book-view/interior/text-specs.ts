/**
 * Начертания и ширины блоков текста — как у PDF (pdf/interior/text-block.tsx, entry.tsx, inline-rows.tsx): по ним
 * превью ломает строки так же (line-breaker.ts). Ширины — pt, из полосы набора формата за вычетом полей блока.
 */
import { MM_TO_PT } from "@/lib/book/formats";
import { textArea } from "@/lib/book/page-geometry";
import { bodyWeight, headingFace, LEAD_IN, measureInsets, quoteFace, trackingPt } from "@/lib/book/typesetting";
import type { TextFace } from "@/lib/book/interiors";
import type { TextSpec } from "./line-breaker";
import type { PageKit } from "./kit";

/** Основной текст (kit.body у PDF). */
export function bodySpec(kit: PageKit): TextSpec {
  const { design, sizes: S } = kit;
  return { font: design.type.body, weight: bodyWeight(design), size: S.body, tracking: design.text?.tracking ? design.text.tracking * S.body : 0 };
}

/** Капитель начальных слов главы (leadInStyle у PDF). */
export function leadSpec(kit: PageKit): TextSpec {
  const { design, sizes: S } = kit;
  return { font: design.type.body, weight: 400, size: S.body * LEAD_IN.size, tracking: S.body * LEAD_IN.tracking, upper: true };
}

/** Начертание из дизайна (textFace у PDF): шрифт, прописные и разрядка от кегля. */
export const faceSpec = (f: TextFace, size: number): TextSpec => ({ font: f.font, weight: f.weight, italic: !!f.italic, size, upper: !!f.upper, tracking: f.tracking ? trackingPt(f, size) : 0 });

/** Курсив цитат, лида и подписей (italicBody у PDF): без разрядки, прописные — по дизайну. */
export function italicSpec(kit: PageKit, size: number): TextSpec {
  const q = quoteFace(kit.design);
  return { font: q.font, weight: q.weight, italic: !!q.italic, size, upper: !!q.upper };
}

/** Заголовок вопроса: своё начертание дизайнера — с прописными и разрядкой, иначе — шрифт заголовков. */
export function headingSpec(kit: PageKit, size: number): TextSpec {
  const { design } = kit;
  if (design.heading.face) return faceSpec(headingFace(design), size);
  return { font: design.type.heading, weight: design.type.headingWeight, italic: !!design.type.headingItalic, size };
}

/** Полоса набора, pt. */
export const textWidthPt = (kit: PageKit) => textArea(kit.format).w * MM_TO_PT;

/** Ширина блока с узкой колонкой дизайна (kit.measure у PDF), pt. */
export function measureWidthPt(kit: PageKit) {
  const inset = measureInsets(kit.design);
  return textWidthPt(kit) * (1 - inset.left - inset.right);
}
