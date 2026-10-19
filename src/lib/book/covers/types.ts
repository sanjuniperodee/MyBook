/** Типы шаблонов обложек: стили текста, настроения, сам шаблон. */
import type { CoverGeometry, Rect } from "../formats";
import type { FontKey } from "../fonts";
import type { PhotoLayout } from "../photo-cover";
import type { ArtContext } from "./svg-kit";

export type { ArtContext };

export interface CoverTextStyle {
  font: FontKey;
  /** Кегль как доля ширины лицевой стороны. */
  size: number;
  color: string;
  weight?: number;
  italic?: boolean;
  upper?: boolean;
  /** Трекинг в em. */
  tracking?: number;
  lineHeight?: number;
}

export type CoverMood = "romance" | "tender" | "classic" | "bright" | "photo";

export const coverMoods: CoverMood[] = ["romance", "tender", "classic", "bright", "photo"];

export interface CoverTemplate {
  id: string;
  /** Название из CRM (у встроенных — в словарях i18n, catalog.covers). */
  name?: { ru: string; kk: string };
  /** Обложка на снимке: раскладка снимка (src/lib/book/photo-cover.ts). */
  photo?: PhotoLayout;
  /** Шаблон из CRM и его версия — для сброса кэша картинок. */
  custom?: boolean;
  rev?: number;
  /** Не показывать в выборе (книги с этой обложкой печатаются как раньше). */
  hidden?: boolean;
  /** Настроение — для фильтра в выборе обложки. */
  mood: CoverMood;
  /** CSS-фон для миниатюры в выборе шаблона. */
  swatch: string;
  requiresPhoto?: boolean;
  /** Сколько фото в композиции (для шаблонов с фото; по умолчанию одно). */
  photoSlots?: number;
  /**
   * Снимки-примеры из коллекции (ключи assets/cover-photos) по местам: в каталоге и редакторе, пока клиент
   * не выбрал свои фото, обложка показана на настоящих снимках, а не на рисованном пейзаже.
   */
  samples?: string[];
  /** Фактура поверх графики. В PDF накладывается отдельно (быстрее, чем SVG-фильтр в 300 dpi). */
  texture?: { kind: "grain" | "linen"; opacity: number };
  art: (g: CoverGeometry, ctx: ArtContext) => string;
  /** Область текста в долях лицевой стороны. */
  textArea: Rect;
  justify: "center" | "start" | "end";
  /** Выключка текста в области: по центру (по умолчанию) или к краю — для журнальных раскладок. */
  align?: "center" | "left" | "right";
  /** Имена над названием, мелкой строкой-«шапкой» (как в журнале), а не под ним. */
  namesFirst?: boolean;
  title: CoverTextStyle;
  subtitle: CoverTextStyle;
  names: CoverTextStyle;
  ornament?: { kind: "line" | "heart" | "star" | "dots"; color: string };
  spine: { color: string; font: FontKey };
  /**
   * Задняя сторона. mirror — повторить композицию лица (плашку, рамку, марку): текст ложится туда же,
   * где на лице название. Иначе — свой спокойный фон из art, а текст — в области area (доли задней крышки).
   */
  back: { color: string; font: FontKey; mirror?: boolean; area?: Rect };
}

export interface CoverTextContent {
  title: string;
  subtitle: string;
  names: string;
}
