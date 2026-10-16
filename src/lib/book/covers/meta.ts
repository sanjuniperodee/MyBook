import type { CoverTemplate } from "./types";

/**
 * Шаблон без рисунка: всё, что нужно обложке с фоном-картинкой (/api/covers) и текстом поверх. Это данные —
 * сервер передаёт их в браузер, и странице не нужно грузить весь каталог с рисунками ради пары обложек.
 */
export type CoverMeta = Omit<CoverTemplate, "art">;

export function coverMeta(template: CoverTemplate): CoverMeta {
  const { art, ...meta } = template;
  void art;
  return meta;
}
