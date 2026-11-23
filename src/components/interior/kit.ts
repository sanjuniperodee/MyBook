import type { Locale } from "@/i18n/config";
import type { BookFormat } from "@/lib/book/formats";
import type { InteriorDesign } from "@/lib/book/interiors";
import { interiorMetrics } from "@/lib/book/page-geometry";
import { interiorSizes, type InteriorSizes } from "@/lib/book/typesetting";
import type { PageUnits } from "./units";

/** Всё, что нужно странице: дизайн, формат, кегли и единицы измерения. */
export interface PageKit {
  design: InteriorDesign;
  format: BookFormat;
  sizes: InteriorSizes;
  u: PageUnits;
  /** Язык книги: на нём «Глава N», «Содержание» и переносы. */
  language: Locale;
  /**
   * Переносы, как в PDF (lib/book/hyphenate.ts: softHyphenate): основной текст с мягкими переносами в тех же местах,
   * переносы браузера выключены. Нет (модуль ещё грузится, миниатюры) — переносы браузера.
   */
  hyphenate?: (text: string) => string;
}

export function pageKit(design: InteriorDesign, format: BookFormat, u: PageUnits, language: Locale, hyphenate?: (text: string) => string): PageKit {
  return { design, format, sizes: interiorSizes(design, interiorMetrics[format.id].scale), u, language, ...(hyphenate ? { hyphenate } : {}) };
}

export const metricsOf = (kit: PageKit) => interiorMetrics[kit.format.id];
