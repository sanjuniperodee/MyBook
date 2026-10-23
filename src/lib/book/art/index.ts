/**
 * Рисунки ИИ-дизайнера: описание → фигуры (compile.ts, library.ts), безопасные данные (drawing.ts), пути и
 * преобразования (path.ts). Справочник для модели — reference.ts.
 */
export { ART_ITEMS, compileArt, type ArtResult } from "./compile";
export { DRAWING_LIMITS, drawingWeight, resolveDrawing, sanitizeDrawing } from "./drawing";
export { ART_LIMITS } from "./kit";
export { BORDERS, PATTERNS, SCENES } from "./library";
export { ART_EXAMPLES, ART_REFERENCE, artExamplesText, type ArtExample } from "./reference";
