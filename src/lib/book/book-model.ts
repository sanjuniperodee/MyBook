/**
 * Геометрия и освещение объёмной модели книги (3D-осмотр со всех сторон).
 * Размеры берутся из тех же печатных параметров, что и PDF обложки (formats.ts), поэтому толщина
 * корешка и выступ крышек на экране совпадают с тем, что получится в типографии. Единица — миллиметр.
 * Чистые функции без React и DOM — проверяются юнит-тестами.
 */
import { coverSpreadGeometry, print, type BookFormat, type Rect } from "./formats";

/** Толщина картонной крышки, мм (картон + покровный материал; вместе с отставом даёт spineExtraMm). */
export const BOARD_MM = print.cover.spineExtraMm / 2;

export interface BookDims {
  /** Крышки: ширина и высота (с выступом над блоком), мм. */
  w: number;
  h: number;
  /** Полная толщина книги = ширина корешка, мм. */
  d: number;
  /** Блок страниц: размер обреза и толщина между крышками. */
  block: { w: number; h: number; d: number };
  /** Прямоугольники арта в развёртке обложки, мм: лицо, оборот и корешок. */
  rects: { front: Rect; back: Rect; spine: Rect };
  /** Размер развёртки целиком, мм. */
  spread: { w: number; h: number };
}

export function bookDims(format: BookFormat, pageCount: number): BookDims {
  const g = coverSpreadGeometry(format, pageCount);
  const { front, back, spine } = g;
  if (!front || !back || !spine) throw new Error("coverSpreadGeometry returned no cover sides");
  return {
    w: front.w,
    h: front.h,
    d: spine.w,
    block: { w: format.widthMm, h: format.heightMm, d: Math.max(0.5, spine.w - BOARD_MM * 2) },
    rects: { front, back, spine },
    spread: { w: g.width, h: g.height },
  };
}

/** Наибольший поперечник модели: по нему подбирается масштаб, чтобы книга не вылезала за кадр при вращении. */
export const modelExtent = (d: BookDims) => Math.hypot(d.w, d.h, d.d);

export type FaceId = "front" | "back" | "spine" | "edge" | "top" | "bottom";

/** Нормали граней в осях CSS (x вправо, y вниз, z к зрителю), когда книга повёрнута лицом к зрителю. */
export const FACE_NORMALS: Record<FaceId, readonly [number, number, number]> = {
  front: [0, 0, 1],
  back: [0, 0, -1],
  spine: [-1, 0, 0],
  edge: [1, 0, 0],
  top: [0, -1, 0],
  bottom: [0, 1, 0],
};

/** Поворот книги в градусах: сначала вокруг вертикальной оси (ry), затем наклон (rx) — как `rotateX(rx) rotateY(ry)`. */
export interface Orientation {
  rx: number;
  ry: number;
}

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Нормаль грани в системе зрителя после поворота книги. */
export function rotateNormal([x, y, z]: readonly [number, number, number], { rx, ry }: Orientation): [number, number, number] {
  const cy = Math.cos(rad(ry));
  const sy = Math.sin(rad(ry));
  const x1 = x * cy + z * sy;
  const z1 = -x * sy + z * cy;
  const cx = Math.cos(rad(rx));
  const sx = Math.sin(rad(rx));
  return [x1, y * cx - z1 * sx, y * sx + z1 * cx];
}

/** Свет сверху-слева, почти из-за спины зрителя (нормированный вектор «на источник»): обращённые к зрителю грани светлые. */
const LIGHT: readonly [number, number, number] = (() => {
  const v = [-0.3, -0.4, 0.86];
  const len = Math.hypot(...v);
  return [v[0] / len, v[1] / len, v[2] / len] as const;
})();

/** Освещённость в тени: бумага не должна уходить в серый даже на боковых гранях. */
const AMBIENT = 0.55;

/**
 * Освещённость грани: 0.55 в тени и до 1 лицом к свету. Грань, отвёрнутая от зрителя, не важна — она скрыта.
 * leafAngle — на сколько градусов грань уже повёрнута вместе с листом вокруг корешка (0 — лежит справа).
 */
export function faceLight(face: FaceId, o: Orientation, leafAngle = 0): number {
  const n = rotateNormal(leafAngle ? rotateNormal(FACE_NORMALS[face], { rx: 0, ry: -leafAngle }) : FACE_NORMALS[face], o);
  const dot = n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2];
  return AMBIENT + (1 - AMBIENT) * Math.max(0, dot);
}

/** Непрозрачность чёрной плёнки поверх грани: чем меньше света, тем темнее. */
export const shadeOpacity = (light: number) => (1 - light) * 0.6;

/** Разность углов по кратчайшему пути: −180…180. */
export function shortestDelta(from: number, to: number) {
  return ((((to - from) % 360) + 540) % 360) - 180;
}

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export const ZOOM = { min: 0.55, max: 2.4, step: 1.25 } as const;
export const TILT_LIMIT = 90;

/** Ракурсы осмотра: какая сторона смотрит на зрителя. */
export const VIEWS: Record<"front" | "spine" | "back" | "edge" | "top" | "bottom", Orientation> = {
  front: { rx: 0, ry: 0 },
  spine: { rx: 0, ry: 90 },
  back: { rx: 0, ry: 180 },
  edge: { rx: 0, ry: -90 },
  top: { rx: -90, ry: 0 },
  bottom: { rx: 90, ry: 0 },
};

/** Положение, с которого книга показывается впервые: чуть сбоку и сверху, видны лицо, корешок и верхний срез. */
export const INITIAL_VIEW: Orientation = { rx: -14, ry: 28 };

/** Максимальная ширина шрифта корешка, мм: 11 pt, как в PDF обложки. */
export const SPINE_FONT_MAX_MM = (11 * 25.4) / 72;

/** Размер шрифта надписи на корешке, мм; null — корешок слишком узкий для текста (как в PDF: меньше 5 мм). */
export function spineFontMm(spineWidth: number): number | null {
  return spineWidth >= 5 ? Math.min(spineWidth * 0.42, SPINE_FONT_MAX_MM) : null;
}

/** Ракурс для чтения раскрытой книги: почти сверху, корешок по центру. */
export const READ_VIEW: Orientation = { rx: -22, ry: 0 };
/** Масштаб при чтении: раскрытая книга крупнее, чем закрытая, чтобы текст читался. */
export const READ_ZOOM = 1.3;

/** Поперечник раскрытой книги: два блока рядом. */
export const openExtent = (d: BookDims) => Math.hypot(d.block.w * 2, d.h, d.d);

/** Во сколько раз уменьшить модель, чтобы раскрытая книга помещалась в кадр так же, как закрытая (openness 0…1). */
export function fitScale(d: BookDims, openness: number) {
  const k = modelExtent(d) / openExtent(d);
  return 1 + (k - 1) * clamp(openness, 0, 1);
}

/** Угол поворота листа вокруг корешка: 0 — лежит справа, 180 — перевёрнут налево. */
export const leafAngle = (pos: number, index: number) => clamp(pos - index, 0, 1) * 180;

/** Высота листа блока над серединой книги, мм: первый лист — сверху, последний — у задней крышки. index с 1, всего sheets листов. */
export function leafZ(index: number, sheets: number, blockDepth: number) {
  return blockDepth / 2 - (index - 0.5) * (blockDepth / sheets);
}

export interface PileState {
  /** Сколько листов лежит справа (угол ≤ 90°) и слева. */
  right: number;
  left: number;
  /** Положение центра и сжатие по толщине у каждой стопки. */
  rightZ: number;
  leftZ: number;
  rightScale: number;
  leftScale: number;
}

/**
 * Две стопки страниц: правая убывает, левая растёт по мере листания. Обе лежат на «столе» — на крышках,
 * поэтому растут вверх от −blockDepth/2. Лист переходит из правой стопки в левую, когда повёрнут больше чем на 90°.
 */
export function pileState(pos: number, sheets: number, blockDepth: number): PileState {
  const left = clamp(Math.ceil(pos - 0.5) - 1, 0, sheets);
  const right = sheets - left;
  const thickness = (n: number) => (n / sheets) * blockDepth;
  return {
    right,
    left,
    rightZ: -blockDepth / 2 + thickness(right) / 2,
    leftZ: -blockDepth / 2 + thickness(left) / 2,
    rightScale: Math.max(0.0001, right / sheets),
    leftScale: Math.max(0.0001, left / sheets),
  };
}

export interface WindowPile {
  /** Сколько листов в стопке и на какой высоте её верхняя грань (низ — всегда −blockDepth/2). */
  count: number;
  top: number;
}

/**
 * Стопки страниц для сцены с настоящими объёмами. Листы возле текущей позиции (окно ±window) рисуются отдельно,
 * а всё остальное заменяют две стопки. Верх стопки лежит ровно под нижним отрисованным листом: будь он выше,
 * закрытая грань стопки перекрыла бы листы с текстом.
 * Пока книга закрыта, листы не рисуются — вся книга одна стопка справа.
 */
export function windowPiles(pos: number, sheets: number, blockDepth: number, window: number): { right: WindowPile; left: WindowPile; first: number; last: number } {
  const thickness = blockDepth / sheets;
  if (pos <= 0.001) return { right: { count: sheets, top: blockDepth / 2 }, left: { count: 0, top: -blockDepth / 2 }, first: 1, last: 0 };
  const last = Math.min(sheets, Math.floor(pos + window));
  const first = Math.max(1, Math.ceil(pos - window));
  const rightCount = Math.max(0, sheets - last);
  const leftCount = Math.max(0, Math.min(sheets, first - 1));
  return {
    right: { count: rightCount, top: -blockDepth / 2 + rightCount * thickness },
    left: { count: leftCount, top: -blockDepth / 2 + leftCount * thickness },
    first,
    last,
  };
}
