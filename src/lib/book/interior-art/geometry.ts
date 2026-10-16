/** Фигуры графики страниц (Shape, Drawing) и построения, общие для глифов, рамок и рисунков. */
import { n } from "../covers/svg-kit";

export type Shape =
  | { kind: "path"; d: string; fill?: string; stroke?: string; width?: number; opacity?: number; transform?: string; round?: boolean }
  | { kind: "circle"; cx: number; cy: number; r: number; fill: string; opacity?: number }
  | { kind: "rect"; x: number; y: number; w: number; h: number; fill?: string; stroke?: string; width?: number; opacity?: number };

/** Рисунок в собственной системе координат: viewBox 0 0 w h. */

export interface Drawing {
  w: number;
  h: number;
  shapes: Shape[];
}

export type Point = { x: number; y: number };

/**
 * Графика под обрез всегда строится с запасом OVER мм за линией реза — независимо от вылетов
 * конкретного файла. Поэтому звёзды и узоры лежат одинаково в превью, в печати и в читательском PDF.
 */
export const OVER = 3;

export const polygon = (pts: Point[]) => `M${pts.map((p) => `${n(p.x)},${n(p.y)}`).join(" L")}Z`;

export const lerp = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** Точки, повёрнутые на angle градусов вокруг начала координат и сдвинутые в (cx, cy). */
export function place(pts: Point[], cx: number, cy: number, angle: number): Point[] {
  const a = (angle * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return pts.map((p) => ({ x: cx + p.x * cos - p.y * sin, y: cy + p.x * sin + p.y * cos }));
}

/**
 * Волна от x0 до x1 на высоте y: полуволны — кубические кривые (react-pdf и браузер рисуют их
 * одинаково, в отличие от сокращённых q/t). phase — сдвиг в долях длины волны.
 */
export function wavePath(x0: number, x1: number, y: number, amp: number, len: number, phase: number) {
  const half = len / 2;
  let x = x0 - phase * len;
  let d = `M${n(x)},${n(y)}`;
  for (let up = true; x < x1; up = !up, x += half) {
    const c = y + (up ? -1 : 1) * amp * (4 / 3);
    d += ` C${n(x + half * 0.364)},${n(c)} ${n(x + half * 0.636)},${n(c)} ${n(x + half)},${n(y)}`;
  }
  return { d, end: x };
}

/**
 * Шаңырақ — венец юрты, как на гербе Казахстана: кольцо, крест-накрест по три кулдыка внутри
 * (рейки-полосы, по две линии) и уыки-лучи вокруг. width — толщина кольца.
 */
export function shanyrakMotif(cx: number, cy: number, R: number, colors: { ring: string; cross: string }, width: number, rays: number): Shape[] {
  const shapes: Shape[] = [];
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2;
    shapes.push({ kind: "path", d: `M${n(cx + Math.cos(a) * R * 1.14)},${n(cy + Math.sin(a) * R * 1.14)} L${n(cx + Math.cos(a) * R * 1.42)},${n(cy + Math.sin(a) * R * 1.42)}`, stroke: colors.ring, width: n(width * 0.45), round: true });
  }
  shapes.push({ kind: "path", d: circlePath(cx, cy, R), stroke: colors.ring, width: n(width) });
  shapes.push({ kind: "path", d: circlePath(cx, cy, R * 0.88), stroke: colors.ring, width: n(width * 0.4) });
  const r = R * 0.88;
  const strip = R * 0.07;
  for (const t of [-0.4, 0, 0.4])
    for (const side of [-1, 1]) {
      const d = t * r + (side * strip) / 2;
      const ext = Math.sqrt(r * r - d * d);
      shapes.push({ kind: "path", d: `M${n(cx + d)},${n(cy - ext)} L${n(cx + d)},${n(cy + ext)}`, stroke: colors.cross, width: n(width * 0.45) });
      shapes.push({ kind: "path", d: `M${n(cx - ext)},${n(cy + d)} L${n(cx + ext)},${n(cy + d)}`, stroke: colors.cross, width: n(width * 0.45) });
    }
  return shapes;
}

/** Лепесток длиной len от точки (x, y) под углом angle (градусы); повёрнут без transform. */
export function leaf(x: number, y: number, len: number, angle: number, width = 0.34) {
  const a = (angle * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const p = (u: number, v: number) => `${n(x + u * cos - v * sin)},${n(y + u * sin + v * cos)}`;
  const r = len;
  return `M${p(0, 0)} C${p(r * 0.35, -r * width)} ${p(r * 0.95, -r * width * 0.8)} ${p(r, 0)} C${p(r * 0.95, r * width * 0.8)} ${p(r * 0.35, r * width)} ${p(0, 0)}Z`;
}

export function offset(s: Shape, dx: number, dy: number): Shape {
  if (!dx && !dy) return s;
  if (s.kind === "circle") return { ...s, cx: s.cx + dx, cy: s.cy + dy };
  if (s.kind === "rect") return { ...s, x: s.x + dx, y: s.y + dy };
  return { ...s, transform: `translate(${n(dx)},${n(dy)})${s.transform ? ` ${s.transform}` : ""}` };
}

export function circlePath(cx: number, cy: number, r: number) {
  return `M${n(cx - r)},${n(cy)} A${n(r)},${n(r)} 0 1 0 ${n(cx + r)},${n(cy)} A${n(r)},${n(r)} 0 1 0 ${n(cx - r)},${n(cy)}Z`;
}
