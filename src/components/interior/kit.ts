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
}

export function pageKit(design: InteriorDesign, format: BookFormat, u: PageUnits, language: Locale): PageKit {
  return { design, format, sizes: interiorSizes(design, interiorMetrics[format.id].scale), u, language };
}

export const metricsOf = (kit: PageKit) => interiorMetrics[kit.format.id];
