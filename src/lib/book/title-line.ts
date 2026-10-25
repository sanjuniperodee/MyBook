import type { InteriorDesign } from "./interiors";
import { printableText } from "./layout";

/** Сколько знаков помещается в свою строку на титульном листе. */
export const TITLE_LINE_MAX = 80;

/**
 * Строка под названием на титульном листе: свой текст автора (titlePage.line, «Для любимой мамы», «Алматы, 2026»), иначе
 * имя автора; имя можно убрать совсем (titlePage.author = false). Свой текст показывается всегда — его вписывают ради
 * того, чтобы он там стоял. Эмодзи убираются, как и в остальном тексте книги: в книжных шрифтах их нет.
 */
export function titleLineText(design: Pick<InteriorDesign, "titlePage">, author: string): string {
  const own = design.titlePage?.line?.trim();
  if (own) return printableText(own);
  return design.titlePage?.author === false ? "" : author;
}
