import { design_cover } from "./design-cover";
import { design_layouts } from "./design-layouts";
import { design_pages } from "./design-pages";
import { design_ui } from "./design-ui";

/**
 * Дизайнер книги: оформление страниц (pages — стили, шрифты, текст, элементы, главы), конструктор обложки из слоёв
 * (cover) и библиотека макетов обложек (layouts). Каждая часть — свой файл.
 */
export const design = {
  readiness: {
    coverLayers: (n: number) => (n === 1 ? "На обложке есть место под фото без снимка." : `На обложке ${n} места под фото без снимка.`),
  },
  cover: design_cover,
  layouts: design_layouts,
  pages: design_pages,
  ui: design_ui,
};
