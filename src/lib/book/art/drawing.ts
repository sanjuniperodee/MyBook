/**
 * Рисунок как данные: тот же Drawing (простые фигуры в своей системе координат), что рисуют декор обложки и графика
 * страниц, — но с цветами-ролями. «main» и «accent» подставляются при показе (цвет слоя обложки, цвета оформления
 * страниц), поэтому рисунок перекрашивается одним выбором цвета. Всё, что приходит из базы или от модели, проходит
 * через sanitizeDrawing: в книге остаются только допустимые фигуры в разумных пределах.
 */
import type { Drawing, Grad, Shape } from "../interior-art";

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

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const inRange = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;

/** Градиент фигуры: 2–8 опорных точек, координаты — доли рамки фигуры; радиальный — только у круга. */
function gradOf(raw: unknown, kind: Shape["kind"]): Grad | undefined {
  const o = obj(raw);
  if (!o || !Array.isArray(o.stops) || o.stops.length < 2 || o.stops.length > 8) return undefined;
  const stops: Grad["stops"] = [];
  for (const st of o.stops) {
    if (!Array.isArray(st) || st.length !== 3 || !inRange(st[0], 0, 1) || !inRange(st[2], 0, 1)) return undefined;
    const c = paint(st[1]);
    if (!c) return undefined;
    stops.push([r3(st[0]), c, r3(st[2])]);
  }
  stops.sort((a, b) => a[0] - b[0]);
  if (o.type === "linear" && [o.x1, o.y1, o.x2, o.y2].every((v) => inRange(v, -2, 3))) return { type: "linear", x1: r3(o.x1 as number), y1: r3(o.y1 as number), x2: r3(o.x2 as number), y2: r3(o.y2 as number), stops };
  if (o.type === "radial" && kind === "circle" && inRange(o.cx, -1, 2) && inRange(o.cy, -1, 2) && inRange(o.r, 0.01, 3)) {
    const fx = inRange(o.fx, -1, 2) ? r3(o.fx) : undefined;
    const fy = inRange(o.fy, -1, 2) ? r3(o.fy) : undefined;
    return { type: "radial", cx: r3(o.cx), cy: r3(o.cy), r: r3(o.r), ...(fx !== undefined && fy !== undefined ? { fx, fy } : {}), stops };
  }
  return undefined;
}

/** Фигура с градиентом: он заменяет заливку, а fill остаётся запасным цветом — без fill градиента нет. */
function shapeOf(raw: unknown): Shape | null {
  const s = baseShape(raw);
  if (!s || !s.fill) return s;
  const grad = gradOf(obj(raw)?.grad, s.kind);
  return grad ? { ...s, grad } : s;
}

function baseShape(raw: unknown): Shape | null {
  const o = obj(raw);
  if (!o) return null;
  const L = DRAWING_LIMITS;
  const opacity = finite(o.opacity, 1) && o.opacity >= 0 ? (o.opacity === 1 ? undefined : round(o.opacity)) : undefined;
  // Невидимая фигура (прозрачность округлилась до нуля) не хранится: react-pdf принял бы fillOpacity 0 за «нет» и залил
  // бы её сплошным цветом.
  if (opacity === 0) return null;
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
  const g = (grad: Grad | undefined) => (grad ? { grad: { ...grad, stops: grad.stops.map(([o, col, a]): Grad["stops"][number] => [o, c(col) ?? main, a]) } } : {});
  return {
    w: d.w,
    h: d.h,
    shapes: d.shapes.map((s): Shape => {
      if (s.kind === "circle") return { ...s, fill: c(s.fill) ?? main, ...g(s.grad) };
      return { ...s, fill: c(s.fill), stroke: c(s.stroke), ...g(s.grad) };
    }),
  };
}

/** Сколько знаков занимает рисунок в базе (для общего потолка на обложку). */
export const drawingWeight = (d: Drawing) => d.shapes.reduce((n, s) => n + (s.kind === "path" ? s.d.length : 40) + (s.grad ? 40 + s.grad.stops.length * 24 : 0), 0);
