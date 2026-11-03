/**
 * Конструктор обложек: обложка из слоёв поверх шаблона. Типы — types.ts, проверка — parse.ts, геометрия, фигуры и
 * эффекты — geometry.ts, декор — decor.ts, снимки коллекции — stock.ts, перевод шаблона в слои — from-template.ts,
 * оборот: фон развёртки — spread.ts, вариант оборота в слои — back-layers.ts.
 */
export * from "./types";
export { COVER_LIMITS, coverDesignPhotoIds, dropCoverPhoto, emptyImageLayers, layerText, newLayerId, parseCoverBack, parseCoverDesign, printedLayers, printedLayerText } from "./parse";
export { backgroundArt, backgroundBase, backgroundMid, backOwnArt, boardSize, canvasGeometry, COVER_SAFE, GRADIENT_FILL, gradientVector, inkOn, layerRect, mirrorAngle, mixColor, OUTLINE_STEPS, safeArea, shapeElements, spreadPanels, textCopies } from "./geometry";
export { backFill, spineFill, templateForCover } from "./template";
export { backFaceSvg, ownSpreadArt, svgWindow } from "./spread";
export { backLayersFromLayout } from "./back-layers";
export { DECOR_IDS, decorDrawing, layerDrawing } from "./decor";
export { isStockPhoto, stockGroups, stockPhotos, type StockGroup } from "./stock";
export { designFromTemplate } from "./from-template";
export { coverLayouts, rawLayouts, type CoverLayout, type LayoutContext, type LayoutGenre } from "./layouts";
