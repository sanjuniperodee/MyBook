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
  /** Толщина одного листа (2 полосы) бумаги блока, мм. 150 г/м² мелованная матовая ≈ 0,13 мм. */
  sheetThicknessMm: 0.13,
  cover: {
    /** Отступ по периметру развёртки до картона: загиб покровного материала (включает вылет), мм. */
    wrapMm: 20,
    /** Выступ картона крышки над блоком (кант), мм. */
    boardOverhangMm: 3,
    /** Ширина шарнира — расстояние между сгибами корешка и крышки (расставы), мм. */
    hingeMm: 8,
    /** Добавка к толщине блока для корешка: картон + отстав, мм. */
    spineExtraMm: 4,
  },
  /** Разрешение растрирования обложки и фото, dpi. */
  dpi: 300,
};

export const MM_TO_PT = 72 / 25.4;
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

/** Геометрия развёртки твёрдой обложки: загиб | задняя крышка | шарнир | корешок | шарнир | передняя крышка | загиб. */
export function coverSpreadGeometry(format: BookFormat, pageCount: number): CoverGeometry {
  const { wrapMm, boardOverhangMm, hingeMm } = print.cover;
  const boardW = format.widthMm + boardOverhangMm; // крышка выступает за блок с трёх сторон, у корешка — шарнир
  const boardH = format.heightMm + boardOverhangMm * 2;
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
