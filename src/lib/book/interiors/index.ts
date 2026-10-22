/**
 * Оформление страниц книги (блока) — каталог готовых дизайнов, как у обложек: шрифты, цвета,
 * виньетки, начальные полосы глав, заголовки вопросов, колонтитулы и колонцифры.
 *
 * Дизайн — только данные. Их одинаково читают PDF для типографии (react-pdf) и превью на сайте
 * (HTML), поэтому клиент видит в редакторе ту же книгу, что уедет в печать. Графика — виньетки,
 * рамки и рисунки на начальных полосах — строится по этим данным в interior-art/, кегли и отбивки —
 * в typesetting.ts.
 *
 * «classic», «modern» и «minimal» — прежние стили вёрстки. Заказанные с ними книги должны
 * печататься так, как клиент видел их в макете, поэтому облик этих дизайнов не меняем.
 */
export {
  interiorMoods,
  styleDirections,
  type InteriorId,
  type InteriorMood,
  type GlyphId,
  type OpenerArt,
  type FrameKind,
  type TextFace,
  type InteriorPalette,
  type InteriorDesign,
  type StyleDirection,
  type BodyText,
  type DropCap,
  type QuoteStyle,
  type TitleLayout,
  type DividerKind,
  type ChapterOverride,
  type TextAlign,
} from "./types";
export { applyInteriorStyle, chapterDesign, parseInteriorStyle, isEmptyStyle, fillPalette, luminance, isHexColor, fontRoles, interiorStyleOptions, LIMITS, MAX_STYLED_CHAPTERS, type InteriorStyle, type FontRole, type FontPick } from "./style";
export { PAPER, PHOTO_COLORS } from "./colors";
export { interiorDesigns, DEFAULT_INTERIOR, isInteriorId, getInteriorDesign, interiorsForCover, interiorDirection } from "./catalog";
export { bookInterior } from "./resolve";
export { romanNumeral, chapterMark } from "./chapter-mark";
