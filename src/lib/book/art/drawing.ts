/**
 * Рисунок как данные: тот же Drawing (простые фигуры в своей системе координат), что рисуют декор обложки и графика
 * страниц, — но с цветами-ролями. «main» и «accent» подставляются при показе (цвет слоя обложки, цвета оформления
 * страниц), поэтому рисунок перекрашивается одним выбором цвета. Всё, что приходит из базы или от модели, проходит
 * через sanitizeDrawing: в книге остаются только допустимые фигуры в разумных пределах.
 */
import type { Drawing, Shape } from "../interior-art";

export const DRAWING_LIMITS = {
  size: [10, 2000],
  shapes: 300,
  pathChars: 16_000,
  totalChars: 90_000,
  coord: 20_000,
  width: 200,
} as const;

/** Цвет фигуры: «#RRGGBB» или роль — main (основной цвет рисунка), accent (второй). */
const COLOR = /^(?:#[0-9a-fA-F]{6}|main|accent)$/;
const PATH_CHARS = /^[MmLlHhVvCcSsQqTtAaZz0-9eE+\-.,\s]+$/;

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);
const finite = (v: unknown, lim: number): v is number => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= lim;
const round = (v: number) => Math.round(v * 100) / 100;
const paint = (v: unknown): string | undefined => (typeof v === "string" && COLOR.test(v) ? (v.startsWith("#") ? v.toUpperCase() : v) : undefined);

function shapeOf(raw: unknown): Shape | null {
  const o = obj(raw);
  if (!o) return null;
  const L = DRAWING_LIMITS;
  const opacity = finite(o.opacity, 1) && o.opacity >= 0 ? (o.opacity === 1 ? undefined : round(o.opacity)) : undefined;
  const width = finite(o.width, L.width) && o.width >= 0 ? round(o.width) : undefined;
  const fill = paint(o.fill);
  const stroke = paint(o.stroke);
  const clean = <T extends Shape>(s: T): T => Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined)) as T;
  switch (o.kind) {
    case "path": {
      if (typeof o.d !== "string" || !o.d || o.d.length > L.pathChars || !PATH_CHARS.test(o.d)) return null;
      if (!fill && !stroke) return null;
      return clean({ kind: "path", d: o.d, fill, stroke, width: stroke ? (width ?? 1) : undefined, opacity, round: o.round === true ? true : undefined });
    }
    case "circle": {
      if (!finite(o.cx, L.coord) || !finite(o.cy, L.coord) || !finite(o.r, L.coord) || o.r <= 0) return null;
      return clean({ kind: "circle", cx: round(o.cx), cy: round(o.cy), r: round(o.r), fill: fill ?? "main", opacity });
    }
    case "rect": {
      if (![o.x, o.y, o.w, o.h].every((v) => finite(v, L.coord)) || (o.w as number) <= 0 || (o.h as number) <= 0) return null;
      if (!fill && !stroke) return null;
      return clean({ kind: "rect", x: round(o.x as number), y: round(o.y as number), w: round(o.w as number), h: round(o.h as number), fill, stroke, width: stroke ? (width ?? 1) : undefined, opacity });
    }
    default:
      return null;
  }
}

/** Рисунок из базы или запроса; не рисунок или пустой — null. Лишнее отбрасывается, лимиты не превышаются. */
export function sanitizeDrawing(raw: unknown): Drawing | null {
  const o = obj(raw);
  const L = DRAWING_LIMITS;
  if (!o || !finite(o.w, L.size[1]) || !finite(o.h, L.size[1]) || o.w < L.size[0] || o.h < L.size[0] || !Array.isArray(o.shapes)) return null;
  const shapes: Shape[] = [];
  let chars = 0;
  for (const s of o.shapes.slice(0, L.shapes)) {
    const shape = shapeOf(s);
    if (!shape) continue;
    chars += shape.kind === "path" ? shape.d.length : 40;
    if (chars > L.totalChars) break;
    shapes.push(shape);
  }
  return shapes.length ? { w: round(o.w), h: round(o.h), shapes } : null;
}

/** Рисунок с подставленными цветами ролей: main и accent → цвета книги. */
export function resolveDrawing(d: Drawing, main: string, accent: string = main): Drawing {
  const c = (v: string | undefined) => (v === "main" ? main : v === "accent" ? accent : v);
  return {
    w: d.w,
    h: d.h,
    shapes: d.shapes.map((s): Shape => {
      if (s.kind === "circle") return { ...s, fill: c(s.fill) ?? main };
      return { ...s, fill: c(s.fill), stroke: c(s.stroke) };
    }),
  };
}

/** Сколько знаков занимает рисунок в базе (для общего потолка на обложку). */
export const drawingWeight = (d: Drawing) => d.shapes.reduce((n, s) => n + (s.kind === "path" ? s.d.length : 40), 0);
