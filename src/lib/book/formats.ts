/**
 * Форматы книг и технические параметры печати.
 * Значения по умолчанию подходят большинству типографий для твёрдого переплёта (7БЦ);
 * перед запуском уточните требования вашей типографии и поправьте print.* при необходимости.
 */

export type FormatId = "a5" | "square";

export interface BookFormat {
  id: FormatId;
  short: string;
  widthMm: number;
  heightMm: number;
}

export const formats: Record<FormatId, BookFormat> = {
  a5: { id: "a5", short: "A5", widthMm: 148, heightMm: 210 },
  square: { id: "square", short: "200×200", widthMm: 200, heightMm: 200 },
};

export function getFormat(id: string): BookFormat {
  return formats[id as FormatId] ?? formats.a5;
}

export const print = {
  /** Вылеты под обрез для страниц блока, мм. */
  bleedMm: 3,
  /** Минимальный объём блока (страниц). Недостающие страницы добавляются пустыми. */
  minPages: 24,
  /** Кратность количества страниц (тетради по 4 полосы). */
  pageMultiple: 4,
  /**
   * Толщина одного листа (2 полосы) бумаги блока, мм. Вместе с spineExtraMm подобрано под схему типографии (12.11.2026):
   * на развёртке книги в 104 полосы её корешок — 4 мм. Формулу для других объёмов типография ещё не прислала.
   */
  sheetThicknessMm: 0.06,
  cover: {
    /** Отступ по периметру развёртки до картона: загиб покровного материала (включает вылет), мм. */
    wrapMm: 20,
    /**
     * Крышка относительно блока: по ширине и по высоте, мм. По схеме типографии (12.11.2026) у A5 (148×210) крышка
     * 145×207 — по их линиям на нашем файле. Было 157×222 (замер готовой книги 09.11 не сошёлся со схемой) и 151×216.
     */
    boardExtraWidthMm: -3,
    boardExtraHeightMm: -3,
    /** Ширина шарнира — расстояние между сгибами корешка и крышки (расставы), мм. По схеме типографии — 7. */
    hingeMm: 7,
    /** Добавка к толщине блока для корешка: картон + отстав, мм. */
    spineExtraMm: 0.9,
  },
  /** Разрешение растрирования обложки и фото, dpi. */
  dpi: 300,
};

/** Перевод единиц: 1 pt = 1/72 дюйма = 25,4/72 мм. Единственное определение для PDF, HTML и раскладок. */
export const MM_TO_PT = 72 / 25.4;
export const PT_TO_MM = 25.4 / 72;
/** Миллиметры → пункты (единица react-pdf). */
export const mm = (v: number) => v * MM_TO_PT;

/** Округляет количество страниц до печатного: не меньше минимума и кратно pageMultiple. */
export function printablePageCount(rawPages: number): number {
  const n = Math.max(rawPages, print.minPages);
  return Math.ceil(n / print.pageMultiple) * print.pageMultiple;
}

export function spineWidthMm(pageCount: number): number {
  const block = (pageCount / 2) * print.sheetThicknessMm;
  return Math.round((block + print.cover.spineExtraMm) * 10) / 10;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CoverGeometry {
  /** Полный размер холста, мм. */
  width: number;
  height: number;
  front: Rect;
  back?: Rect;
  spine?: Rect;
  /** Линии реза/сгиба для техспецификации (x-координаты), мм. */
  folds?: number[];
}

/** Выступ крышки над обрезанным блоком (кант): с трёх сторон, мм. */
export const BOARD_OVERHANG_MM = 3;

/**
 * Блок после переплёта: типография обрезает его так, чтобы крышка выступала на кант. Пока крышка больше формата —
 * это сам формат; по схеме типографии крышка A5 145×207 меньше файла блока 148×210, значит блок режут до 142×201.
 * Нужен 3D-модели (страницы не должны торчать из-под крышки); точный обрез ещё ждём от типографии.
 */
export function trimmedBlockOf(format: Pick<BookFormat, "widthMm" | "heightMm">) {
  const b = boardOf(format);
  return { w: Math.min(format.widthMm, b.w - BOARD_OVERHANG_MM), h: Math.min(format.heightMm, b.h - BOARD_OVERHANG_MM * 2) };
}

/** Картон крышки (лицевой и задней) для формата блока, мм. */
export function boardOf(format: Pick<BookFormat, "widthMm" | "heightMm">) {
  return { w: format.widthMm + print.cover.boardExtraWidthMm, h: format.heightMm + print.cover.boardExtraHeightMm };
}

/** Геометрия развёртки твёрдой обложки: загиб | задняя крышка | шарнир | корешок | шарнир | передняя крышка | загиб. */
export function coverSpreadGeometry(format: BookFormat, pageCount: number): CoverGeometry {
  const { wrapMm, hingeMm } = print.cover;
  const { w: boardW, h: boardH } = boardOf(format);
  const spine = spineWidthMm(pageCount);
  const width = wrapMm * 2 + boardW * 2 + hingeMm * 2 + spine;
  const height = wrapMm * 2 + boardH;
  const backX = wrapMm;
  const spineX = backX + boardW + hingeMm;
  const frontX = spineX + spine + hingeMm;
  return {
    width,
    height,
    back: { x: backX, y: wrapMm, w: boardW, h: boardH },
    spine: { x: spineX, y: wrapMm, w: spine, h: boardH },
    front: { x: frontX, y: wrapMm, w: boardW, h: boardH },
    folds: [backX, backX + boardW, spineX, spineX + spine, frontX, frontX + boardW],
  };
}

export type CoverZoneKey = "wrapLeft" | "back" | "hingeLeft" | "spine" | "hingeRight" | "front" | "wrapRight";

export interface CoverZone {
  key: CoverZoneKey;
  x: number;
  w: number;
}

/** Зоны развёртки слева направо — для каркаса с размерами. Сумма ширин равна ширине развёртки. */
export function coverSpreadZones(format: BookFormat, pageCount: number): CoverZone[] {
  const g = coverSpreadGeometry(format, pageCount);
  const { wrapMm, hingeMm } = print.cover;
  const back = g.back!;
  const spine = g.spine!;
  return [
    { key: "wrapLeft", x: 0, w: wrapMm },
    { key: "back", x: back.x, w: back.w },
    { key: "hingeLeft", x: back.x + back.w, w: hingeMm },
    { key: "spine", x: spine.x, w: spine.w },
    { key: "hingeRight", x: spine.x + spine.w, w: hingeMm },
    { key: "front", x: g.front.x, w: g.front.w },
    { key: "wrapRight", x: g.front.x + g.front.w, w: wrapMm },
  ];
}

/** Геометрия только лицевой стороны (для превью на сайте). */
export function coverFrontGeometry(format: BookFormat): CoverGeometry {
  return {
    width: format.widthMm,
    height: format.heightMm,
    front: { x: 0, y: 0, w: format.widthMm, h: format.heightMm },
  };
}
