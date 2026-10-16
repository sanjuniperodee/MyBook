/** Помощники обложек на готовых снимках: шаблон по описанию (def), стили текста и области. */
import type { CoverTemplate, CoverTextStyle } from "../types";
import { photoTemplate, type PhotoLayout, type PhotoTemplateData } from "../../photo-cover";
import type { FontKey } from "../../fonts";

export type Def = Omit<PhotoTemplateData, "name" | "subtitle" | "names" | "spine" | "back" | "layout"> & {
  layout: Omit<PhotoLayout, "photo"> & { size: [number, number]; credit: string };
  /** Цвет имён и подзаголовка. */
  soft: string;
  subtitle?: Partial<CoverTextStyle>;
  names?: Partial<CoverTextStyle>;
  /** Шрифт оборота и корешка — по умолчанию как у названия. */
  font?: FontKey;
  back?: Partial<PhotoTemplateData["back"]>;
};

export const serifItalic = (color: string, size = 0.1): CoverTextStyle => ({ font: "cormorant", size, color, weight: 500, italic: true, lineHeight: 1.05 });

export const capsNames = (color: string): CoverTextStyle => ({ font: "montserrat", size: 0.024, color, weight: 500, upper: true, tracking: 0.28 });

export function def(d: Def): CoverTemplate {
  const { size, credit, ...layout } = d.layout;
  const font = d.font ?? d.title.font;
  return photoTemplate({
    id: d.id,
    // Названия встроенных обложек — в словарях i18n (catalog.covers).
    name: { ru: d.id, kk: d.id },
    mood: d.mood,
    layout: { ...layout, photo: { key: d.id, width: size[0], height: size[1], credit } },
    textArea: d.textArea,
    justify: d.justify,
    title: d.title,
    subtitle: { font, size: 0.045, color: d.soft, italic: true, ...d.subtitle },
    names: { ...capsNames(d.soft), ...d.names },
    ornament: d.ornament,
    spine: { color: d.title.color, font },
    back: { color: d.title.color, font, ...d.back },
  });
}

/** Текст сверху, над снимком. */
export const TOP = { x: 0.1, y: 0.08, w: 0.8, h: 0.28 };

/** Текст снизу. */
export const BOTTOM = { x: 0.1, y: 0.65, w: 0.8, h: 0.27 };

/** Область текста на обороте — та же, что на лице. */
export const backTop = { area: { x: 0.14, y: 0.1, w: 0.72, h: 0.3 } };

export const backBottom = { area: { x: 0.14, y: 0.6, w: 0.72, h: 0.3 } };

export const backMiddle = { area: { x: 0.14, y: 0.3, w: 0.72, h: 0.4 } };
