import type { CoverTemplate } from "../covers/types";
import { backgroundBase, inkOn } from "./geometry";
import type { CoverDesign } from "./types";

/**
 * Шаблон, по которому рисуются корешок и оборот обложки из конструктора. С фоном шаблона — сам шаблон; со своим цветом
 * или градиентом рисунка шаблона нет — оборот без повтора композиции лица, текст корешка и оборота — контрастным цветом.
 */
export function templateForDesign(template: CoverTemplate, design: CoverDesign | null): CoverTemplate {
  const base = design ? backgroundBase(design.background) : null;
  if (!base) return template;
  const ink = inkOn(base);
  return { ...template, back: { ...template.back, color: ink, mirror: false }, spine: { ...template.spine, color: ink }, texture: undefined, swatch: base };
}
