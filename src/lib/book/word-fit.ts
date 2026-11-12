import { fontFaces, type FontKey } from "./fonts";
import { FONT_WIDTHS } from "./font-widths";
import { WIDTH_CHARS } from "./word-fit-chars";

/**
 * Длинное слово в крупном наборе (обложка, титул, начальная полоса): «ОТБАСЫМЫЗДЫҢ» прописными с разрядкой шире
 * строки. Браузер рвал такое слово по буквам («…ДЫ / Ң»), PDF — выпускал за рамку или обрезал. Теперь кегль
 * уменьшается, пока самое длинное слово не встанет в строку, — одним расчётом по ширинам знаков шрифта
 * (font-widths.ts, из тех же файлов), поэтому превью и печать совпадают.
 */

const INDEX = new Map([...WIDTH_CHARS].map((ch, i) => [ch, i]));
/** Запас на кернинг и округление браузера: слово, вписанное впритык, браузер всё равно мог бы перенести. */
const MARGIN = 0.96;
/** Не мельче этой доли исходного кегля: дальше слово всё же переносится (HTML) или выходит за рамку (PDF). */
const MIN_SCALE = 0.4;

export interface WordFitFace {
  font: FontKey;
  upper?: boolean;
  /** Разрядка, доли кегля (letter-spacing — после каждого знака, как в CSS и react-pdf). */
  tracking?: number;
}

/** Ширина слова (без пробелов), в кеглях — по ширинам знаков шрифта. */
export function wordWidthEm(word: string, face: WordFitFace): number {
  const widths = FONT_WIDTHS[face.font];
  const avg = (fontFaces[face.font].width ?? 0.55) * 1000;
  const tracking = face.tracking ?? 0;
  let w = 0;
  for (const ch of face.upper ? word.toUpperCase() : word) {
    const i = INDEX.get(ch);
    w += ((i === undefined ? 0 : widths[i]) || avg) / 1000 + tracking;
  }
  return w;
}

/** Сколько строк займёт текст в ширину width (в кеглях): перенос по словам, абзацы сохраняются, запас как у MARGIN. */
export function countLinesEm(text: string, face: WordFitFace, width: number): number {
  const space = wordWidthEm(" ", face) || 0.25;
  const room = width * MARGIN;
  let lines = 0;
  for (const para of text.split("\n")) {
    const words = para.trim().split(/\s+/).filter(Boolean);
    lines += 1;
    let line = 0;
    for (const word of words) {
      const w = wordWidthEm(word, face);
      if (line > 0 && line + space + w > room) {
        lines += 1;
        line = w;
      } else line += (line > 0 ? space : 0) + w;
    }
  }
  return lines;
}

/** Ширина самого длинного слова, в кеглях. */
export function longestWordEm(text: string, face: WordFitFace): number {
  const widths = FONT_WIDTHS[face.font];
  const avg = (fontFaces[face.font].width ?? 0.55) * 1000;
  const tracking = face.tracking ?? 0;
  let max = 0;
  for (const word of (face.upper ? text.toUpperCase() : text).split(/[\s\-–—/]+/)) {
    let w = 0;
    for (const ch of word) {
      const i = INDEX.get(ch);
      w += ((i === undefined ? 0 : widths[i]) || avg) / 1000 + tracking;
    }
    max = Math.max(max, w);
  }
  return max;
}

/** Кегль, при котором самое длинное слово помещается в ширину width (те же единицы, что size); не больше size. */
export function fitWordSize(text: string, face: WordFitFace, size: number, width: number): number {
  const em = longestWordEm(text, face);
  if (!em || em * size <= width * MARGIN) return size;
  return Math.max(size * MIN_SCALE, (width * MARGIN) / em);
}
