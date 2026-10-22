/**
 * Библиотека макетов обложек: готовые композиции по жанрам — отправная точка, все слои потом редактируются.
 * Макет строит обложку из слоёв по тексту книги, формату и её фото (лучшие — первыми); пока своих фото нет —
 * снимки коллекции (stock.ts), их клиент заменяет своими.
 */
import type { BookFormat } from "../formats";
import { baseLayouts } from "./layout-library/base";
import { variantLayouts } from "./layout-library/variants";
import { parseCoverDesign } from "./parse";
import type { CoverDesign, CoverTexts } from "./types";

export type LayoutGenre = "romance" | "family" | "kids" | "biography" | "gift" | "photo" | "fiction" | "premium" | "minimal" | "bigphoto" | "collage" | "art";

export interface LayoutContext {
  texts: CoverTexts;
  format: BookFormat;
  /** Фото книги по порядку: id и размеры. */
  photos: { id: string; width: number; height: number }[];
}

export interface CoverLayout {
  id: string;
  genre: LayoutGenre;
  /** Макет на рисунке шаблона — какой шаблон поставить фоном; нет — у макета свой фон. */
  template?: string;
  build: (ctx: LayoutContext) => CoverDesign;
}

/** Макеты как написаны — для проверки, что разбор их не меняет (кроме округления). */
export const rawLayouts: CoverLayout[] = [...baseLayouts, ...variantLayouts];

/** Макеты: результат — через разбор, числа округлены так же, как при сохранении (редактор и база совпадают). */
export const coverLayouts: CoverLayout[] = rawLayouts.map((l) => ({ ...l, build: (ctx) => parseCoverDesign(l.build(ctx))! }));
