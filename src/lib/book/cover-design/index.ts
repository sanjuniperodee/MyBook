/**
 * Конструктор обложек: обложка из слоёв поверх шаблона. Типы — types.ts, проверка — parse.ts, геометрия, фигуры и
 * эффекты — geometry.ts, декор — decor.ts, снимки коллекции — stock.ts, перевод шаблона в слои — from-template.ts.
 */
export * from "./types";
export { COVER_LIMITS, coverDesignPhotoIds, dropCoverPhoto, emptyImageLayers, layerText, newLayerId, parseCoverDesign, printedLayers } from "./parse";
export { backgroundArt, backgroundBase, boardSize, canvasGeometry, COVER_SAFE, GRADIENT_FILL, gradientVector, inkOn, layerRect, OUTLINE_STEPS, safeArea, shapeElements, textCopies } from "./geometry";
export { templateForDesign } from "./template";
export { DECOR_IDS, decorDrawing, layerDrawing } from "./decor";
export { isStockPhoto, stockGroups, stockPhotos, type StockGroup } from "./stock";
export { designFromTemplate } from "./from-template";
export { coverLayouts, rawLayouts, type CoverLayout, type LayoutContext, type LayoutGenre } from "./layouts";
