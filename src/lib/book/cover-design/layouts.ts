/**
 * Библиотека макетов обложек: готовые композиции по жанрам — отправная точка, все слои потом редактируются.
 * Макет строит обложку из слоёв по тексту книги, формату и её фото (лучшие — первыми); пока своих фото нет —
 * снимки коллекции (stock.ts), их клиент заменяет своими.
 */
import type { BookFormat } from "../formats";
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

export const coverLayouts: CoverLayout[] = [];
