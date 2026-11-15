/** Общие части сборки рисунка: чтение полей описания, краска, преобразования фигур, ломаные и сглаженные пути. */
import { n } from "../covers/svg-kit";
import type { Grad, Shape } from "../interior-art";
import { apply, parsePath, scaleOf, transformSegs, writePath, type Mat } from "./path";

/** Описание не собралось: сообщение уходит модели, чтобы она исправила именно это. */
export class ArtError extends Error {}

export const ART_LIMITS = {
  items: 120,
  depth: 4,
  shapes: 300,
  repeat: 80,
  cells: 240,
  size: [20, 1000],
} as const;

type Obj = Record<string, unknown>;
export const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

/** Холст и счётчики одной сборки. */
export interface Ctx {
  w: number;
  h: number;
  /** Крупная сторона холста: от неё считаются толщины линий и размеры по умолчанию. */
  unit: number;
  shapes: number;
}

export type Paint = string | null;

const PAINT = /^(?:#[0-9a-fA-F]{6}|main|accent)$/;

/** Стиль фигуры после разбора: заливка и обводка (null — нет), толщина, прозрачность. */
export interface Style {
  fill: Paint;
  stroke: Paint;
  width: number;
  opacity?: number;
  round?: boolean;
  /** Плавная заливка вместо fill (fill — запасной цвет). */
  grad?: Grad;
}

/** Поля одного элемента описания: числа, краски и строки с понятными ошибками. */
export class Fields {
  constructor(
    readonly o: Obj,
    readonly t: string,
    readonly ctx: Ctx,
  ) {}

  has(k: string) {
    return this.o[k] !== undefined && this.o[k] !== null;
  }

  num(k: string, def?: number, lo = -5000, hi = 5000): number {
    const v = this.o[k];
    if (v === undefined || v === null) {
      if (def === undefined) throw new ArtError(`${this.t}: нужно поле ${k}`);
      return def;
    }
    if (typeof v !== "number" || !Number.isFinite(v)) throw new ArtError(`${this.t}: ${k} — число`);
    return Math.min(hi, Math.max(lo, v));
  }

  int(k: string, def: number, lo: number, hi: number): number {
    return Math.round(this.num(k, def, lo, hi));
  }

  str<T extends string>(k: string, list: readonly T[], def?: T): T {
    const v = this.o[k];
    if (v === undefined || v === null) {
      if (def === undefined) throw new ArtError(`${this.t}: нужно поле ${k} (${list.join(", ")})`);
      return def;
    }
    if (!list.includes(v as T)) throw new ArtError(`${this.t}: ${k} — одно из ${list.join(", ")}`);
    return v as T;
  }

  paint(k: string): Paint | undefined {
    const v = this.o[k];
    if (v === undefined) return undefined;
    if (v === null || v === "none") return null;
    if (typeof v !== "string" || !PAINT.test(v)) throw new ArtError(`${this.t}: ${k} — "#RRGGBB", "main", "accent" или "none"`);
    return v.startsWith("#") ? v.toUpperCase() : v;
  }

  /** Стиль замкнутой фигуры: без fill и stroke — заливка main; только stroke — без заливки; grad — плавная заливка. */
  closed(defWidth = this.ctx.unit * 0.012, circle = false): Style {
    const grad = this.grad(circle);
    const fill = this.paint("fill");
    const stroke = this.paint("stroke");
    const st = this.finish({ fill: fill !== undefined ? fill : stroke && !grad ? null : "main", stroke: stroke ?? null }, defWidth);
    return grad && st.fill ? { ...st, grad } : st;
  }

  /**
   * Градиент фигуры: {"type":"linear","angle":90,"stops":[[0,"#RRGGBB",1],[1,"main",0]]} — угол как у фона обложки
   * (0 — слева направо, 90 — сверху вниз); {"type":"radial","cx":0.5,"cy":0.5,"r":0.5,"fx","fy","stops":[…]} — только
   * у circle. Точки остановки — [доля 0–1, цвет, непрозрачность 0–1].
   */
  grad(circle = false): Grad | undefined {
    const g = this.o.grad;
    if (g === undefined || g === null) return undefined;
    if (!isObj(g)) throw new ArtError(`${this.t}: grad — объект {type, stops}`);
    const stops = g.stops;
    if (!Array.isArray(stops) || stops.length < 2 || stops.length > 8) throw new ArtError(`${this.t}: grad.stops — 2–8 точек [доля, цвет, непрозрачность]`);
    const list = stops.map((st, i): [number, string, number] => {
      if (!Array.isArray(st) || st.length !== 3 || typeof st[0] !== "number" || typeof st[2] !== "number" || typeof st[1] !== "string" || !PAINT.test(st[1])) throw new ArtError(`${this.t}: grad.stops[${i}] — [доля 0–1, "#RRGGBB"|"main"|"accent", непрозрачность 0–1]`);
      return [Math.min(1, Math.max(0, st[0])), st[1].startsWith("#") ? st[1].toUpperCase() : st[1], Math.min(1, Math.max(0, st[2]))];
    });
    const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
    if (g.type === "radial") {
      if (!circle) throw new ArtError(`${this.t}: радиальный grad бывает только у circle (у остальных — linear)`);
      return { type: "radial", cx: num(g.cx, 0.5), cy: num(g.cy, 0.5), r: num(g.r, 0.5), ...(g.fx !== undefined || g.fy !== undefined ? { fx: num(g.fx, num(g.cx, 0.5)), fy: num(g.fy, num(g.cy, 0.5)) } : {}), stops: list };
    }
    if (g.type !== "linear") throw new ArtError(`${this.t}: grad.type — "linear" или "radial"`);
    const a = (num(g.angle, 90) * Math.PI) / 180;
    const [c, s] = [Math.cos(a) / 2, Math.sin(a) / 2];
    const r = (v: number) => Math.round(v * 1000) / 1000;
    return { type: "linear", x1: r(0.5 - c), y1: r(0.5 - s), x2: r(0.5 + c), y2: r(0.5 + s), stops: list };
  }

  /** Стиль линии: stroke по умолчанию main, заливки нет. */
  open(defWidth = this.ctx.unit * 0.005): Style {
    return this.finish({ fill: null, stroke: this.paint("stroke") ?? this.paint("fill") ?? "main" }, defWidth);
  }

  private finish(s: { fill: Paint; stroke: Paint }, defWidth: number): Style {
    const opacity = this.num("opacity", 1, 0, 1);
    return { ...s, width: n(this.num("width", defWidth, 0.01, 200)), ...(opacity < 1 ? { opacity } : {}), round: this.o.sharp === true ? undefined : true };
  }
}

/** Фигура-путь по стилю. */
export function shape(d: string, st: Style): Shape {
  return { kind: "path", d, ...(st.fill ? { fill: st.fill } : {}), ...(st.fill && st.grad && st.grad.type === "linear" ? { grad: st.grad } : {}), ...(st.stroke ? { stroke: st.stroke, width: st.width } : {}), ...(st.opacity !== undefined ? { opacity: st.opacity } : {}), ...(st.round && st.stroke ? { round: true } : {}) } as Shape;
}

export function circleShape(cx: number, cy: number, r: number, st: Style): Shape {
  if (!st.stroke) return { kind: "circle", cx: n(cx), cy: n(cy), r: n(r), fill: st.fill ?? "main", ...(st.grad ? { grad: st.grad } : {}), ...(st.opacity !== undefined ? { opacity: st.opacity } : {}) };
  return shape(`M${n(cx - r)},${n(cy)} A${n(r)},${n(r)} 0 1 0 ${n(cx + r)},${n(cy)} A${n(r)},${n(r)} 0 1 0 ${n(cx - r)},${n(cy)}Z`, st);
}

export interface Pt {
  x: number;
  y: number;
}

/** Ломаная по точкам; close — замкнуть. */
export const poly = (pts: Pt[], close = true) => `M${pts.map((p) => `${n(p.x)},${n(p.y)}`).join(" L")}${close ? "Z" : ""}`;

/** Точка на окружности: угол в градусах, 0 — вверх, по часовой. */
export const onCircle = (cx: number, cy: number, r: number, deg: number): Pt => {
  const a = (deg * Math.PI) / 180;
  return { x: cx + Math.sin(a) * r, y: cy - Math.cos(a) * r };
};

/** Плавная кривая через точки (Catmull–Rom в кубических кривых); open — без замыкания. */
export function smooth(pts: Pt[], tension = 0.5): string {
  if (pts.length < 3) return poly(pts, false);
  let d = `M${n(pts[0].x)},${n(pts[0].y)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const k = tension / 3;
    d += ` C${n(p1.x + (p2.x - p0.x) * k)},${n(p1.y + (p2.y - p0.y) * k)} ${n(p2.x - (p3.x - p1.x) * k)},${n(p2.y - (p3.y - p1.y) * k)} ${n(p2.x)},${n(p2.y)}`;
  }
  return d;
}

/** Фигура после преобразования подобия: числа пересчитаны, transform не нужен. */
export function transformShape(s: Shape, m: Mat): Shape | null {
  const k = scaleOf(m);
  if (s.kind === "circle") {
    const [cx, cy] = apply(m, s.cx, s.cy);
    return { ...s, cx: n(cx), cy: n(cy), r: n(s.r * k) };
  }
  if (s.kind === "rect") {
    const axisAligned = Math.abs(m.b) < 1e-9 && Math.abs(m.c) < 1e-9 && m.a > 0 && m.d > 0;
    if (axisAligned) {
      const [x, y] = apply(m, s.x, s.y);
      return { ...s, x: n(x), y: n(y), w: n(s.w * m.a), h: n(s.h * m.d), ...(s.width !== undefined ? { width: n(s.width * k) } : {}) };
    }
    const corners = [apply(m, s.x, s.y), apply(m, s.x + s.w, s.y), apply(m, s.x + s.w, s.y + s.h), apply(m, s.x, s.y + s.h)].map(([x, y]) => ({ x, y }));
    return { kind: "path", d: poly(corners), fill: s.fill, stroke: s.stroke, width: s.width !== undefined ? n(s.width * k) : undefined, opacity: s.opacity, grad: s.grad };
  }
  const segs = parsePath(s.d);
  if (!segs) return null;
  return { ...s, d: writePath(transformSegs(segs, m)), ...(s.width !== undefined ? { width: n(s.width * k) } : {}) };
}

export function transformAll(shapes: Shape[], m: Mat, opacity = 1): Shape[] {
  const out: Shape[] = [];
  for (const s of shapes) {
    const t = transformShape(s, m);
    if (!t) continue;
    out.push(opacity < 1 ? { ...t, opacity: Math.round((t.opacity ?? 1) * opacity * 100) / 100 } : t);
  }
  return out;
}
