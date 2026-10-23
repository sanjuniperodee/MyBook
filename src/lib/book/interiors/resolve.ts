import { getInteriorDesign } from "./catalog";
import { applyInteriorStyle, parseInteriorStyle } from "./style";
import type { InteriorDesign } from "./types";

/**
 * Оформление книги: стиль из каталога с её настройками дизайнера (books.interior_style). Одно место для PDF,
 * превью и оценки объёма: что клиент видит в редакторе, то и печатается.
 */
export function bookInterior(book: { interior: string; interiorStyle?: unknown }): InteriorDesign {
  return applyInteriorStyle(getInteriorDesign(book.interior), parseInteriorStyle(book.interiorStyle));
}
