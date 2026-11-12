/**
 * Библиотека макетов обложек: готовые композиции по жанрам — отправная точка, все слои потом редактируются.
 * Макет строит обложку из слоёв по тексту книги, формату и её фото (лучшие — первыми); пока своих фото нет —
 * снимки коллекции (stock.ts), их клиент заменяет своими.
 */
import type { BookFormat } from "../formats";
import { baseLayouts } from "./layout-library/base";
import { variantLayouts } from "./layout-library/variants";
import { boardSize, safeArea } from "./geometry";
import { layerText, parseCoverDesign } from "./parse";
import { styleTextHeight } from "./template-text";
import type { CoverDesign, CoverTexts, TextLayer } from "./types";

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

/** Макеты как написаны — для проверки, что разбор их не меняет (кроме округления). */
export const rawLayouts: CoverLayout[] = [...baseLayouts, ...variantLayouts];

const MIN_SCALE = 0.55;
const r4 = (v: number) => Math.round(v * 10000) / 10000;

/**
 * Надписи макета — внутри безопасной зоны крышки: длинное название не выходит из своей рамки (кегль меньше), а рамка
 * у края (квадратный формат, низ крышки) сдвигается внутрь. Иначе текст уходит под загиб.
 */
export function fitLayoutText(design: CoverDesign, texts: CoverTexts, format: BookFormat): CoverDesign {
  const board = boardSize(format);
  // Запас под выносные элементы букв: рамка надписи у края зоны, а «у», «р» и строка с отбивкой в PDF — до 3 мм ниже.
  const s0 = safeArea(format);
  const pad = 3 / board.h;
  const safe = { ...s0, y: s0.y + pad, h: s0.h - pad * 2 };
  const fit = (l: TextLayer): TextLayer => {
    if (l.hidden || l.rotate) return l;
    const text = layerText(l, texts);
    if (!text.trim()) return l;
    let size = l.style.size;
    const height = (sz: number) => styleTextHeight(text, l.style, sz, l.w * board.w, board.w);
    while (size > l.style.size * MIN_SCALE && height(size) > l.h * board.h * 0.9) size = r4(size * 0.96);
    const w = Math.min(l.w, safe.w);
    const h = Math.min(l.h, safe.h);
    const x = Math.min(Math.max(l.x, safe.x), safe.x + safe.w - w);
    const y = Math.min(Math.max(l.y, safe.y), safe.y + safe.h - h);
    return { ...l, x: r4(x), y: r4(y), w: r4(w), h: r4(h), style: { ...l.style, size } };
  };
  return { ...design, layers: design.layers.map((l) => (l.kind === "text" ? fit(l) : l)) };
}

/** Макеты: результат — через разбор, числа округлены так же, как при сохранении (редактор и база совпадают). */
export const coverLayouts: CoverLayout[] = rawLayouts.map((l) => ({ ...l, build: (ctx) => parseCoverDesign(fitLayoutText(parseCoverDesign(l.build(ctx))!, ctx.texts, ctx.format))! }));
