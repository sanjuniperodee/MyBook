/**
 * Графика страниц книги: глифы и виньетки, рамки парадных полос и рисунки на начальных полосах глав.
 * Всё описано простыми фигурами (Shape), которые без потерь переводятся и в react-pdf <Svg>, и в
 * HTML <svg>, — поэтому превью на сайте и файл для типографии рисуются одним кодом.
 *
 * Единицы: глифы и виньетки — в пунктах (стоят в строке текста), рамки и рисунки — в миллиметрах
 * от левого верхнего угла обрезного формата; отрицательные координаты и выход за формат — вылеты.
 */
export type { Shape, Drawing } from "./geometry";
export { glyphDrawing, vignetteDrawing, dividerDrawing } from "./glyphs";
export { frameShapes, type PageBox } from "./frames";
export { openerArtShapes, type ArtContext } from "./opener-art";
export { openerEmblemShapes, titleEmblemShapes } from "./emblem";
