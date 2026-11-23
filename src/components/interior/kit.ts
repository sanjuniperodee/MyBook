import type { Locale } from "@/i18n/config";
import type { BookFormat } from "@/lib/book/formats";
import type { InteriorDesign } from "@/lib/book/interiors";
import { interiorMetrics } from "@/lib/book/page-geometry";
import { interiorSizes, type InteriorSizes } from "@/lib/book/typesetting";
import type { PageUnits } from "./units";
import type { LineBreaker } from "./line-breaker";

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
  /** Строки текста, как у PDF (line-breaker.ts); нет — строки ставит браузер. */
  breaker?: LineBreaker;
  /**
   * Превью само делает доводку вёрстки, как PDF (flow-decisions): заголовок с текстом не держится браузером
   * (break-after: avoid) — висящий заголовок переносит правило, как у react-pdf. Нет — держит браузер (миниатюры).
   */
  decides?: boolean;
  /**
   * Разрывы полос, как у PDF (lib/book/paginate.ts): пометка блока → номера строк, перед которыми новая полоса
   * (0 — перед самим блоком). Нет — полосы ставит браузер.
   */
  breaks?: ReadonlyMap<string, readonly number[]>;
  /** Где продолжается абзац под опущенной буквицей (знаков после буквы), как у PDF (flow.dropSplit); нет — оценка. */
  dropSplit?: ReadonlyMap<string, number>;
  /** Версия набора (догрузились шрифты — строки другие): по ней превью пересчитывает доводку вёрстки. */
  version?: number;
}

export function pageKit(design: InteriorDesign, format: BookFormat, u: PageUnits, language: Locale, hyphenate?: (text: string) => string, breaker?: LineBreaker): PageKit {
  return { design, format, sizes: interiorSizes(design, interiorMetrics[format.id].scale), u, language, ...(hyphenate ? { hyphenate } : {}), ...(breaker ? { breaker } : {}) };
}

export const metricsOf = (kit: PageKit) => interiorMetrics[kit.format.id];
