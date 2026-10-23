/**
 * Разбор и преобразование SVG-путей. Нужны, чтобы повторы, зеркала и повороты рисунка ИИ-дизайнера получались готовыми
 * координатами, а не атрибутом transform: тогда HTML и react-pdf рисуют их одинаково, а в базе нет ничего, кроме
 * простых фигур. Поддерживаются преобразования подобия (сдвиг, поворот, одинаковый масштаб, зеркало) — этого хватает.
 */
import { n } from "../covers/svg-kit";

export type Seg =
  | ["M" | "L", number, number]
  | ["C", number, number, number, number, number, number]
  | ["Q", number, number, number, number]
  | ["A", number, number, number, 0 | 1, 0 | 1, number, number]
  | ["Z"];

/** Матрица преобразования: x' = a·x + c·y + e, y' = b·x + d·y + f. */
export interface Mat {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export const IDENTITY: Mat = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

/** Сначала m2, потом m1. */
export const compose = (m1: Mat, m2: Mat): Mat => ({
  a: m1.a * m2.a + m1.c * m2.b,
  b: m1.b * m2.a + m1.d * m2.b,
  c: m1.a * m2.c + m1.c * m2.d,
  d: m1.b * m2.c + m1.d * m2.d,
  e: m1.a * m2.e + m1.c * m2.f + m1.e,
  f: m1.b * m2.e + m1.d * m2.f + m1.f,
});

export const translateM = (dx: number, dy: number): Mat => ({ ...IDENTITY, e: dx, f: dy });
export const scaleM = (s: number, cx = 0, cy = 0): Mat => ({ a: s, b: 0, c: 0, d: s, e: cx - s * cx, f: cy - s * cy });
/** Поворот на deg градусов по часовой стрелке (ось y вниз) вокруг (cx, cy). */
export function rotateM(deg: number, cx = 0, cy = 0): Mat {
  const r = (deg * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return { a: cos, b: sin, c: -sin, d: cos, e: cx - cos * cx + sin * cy, f: cy - sin * cx - cos * cy };
}
/** Зеркало относительно вертикальной (axis "x": x = at) или горизонтальной (axis "y": y = at) прямой. */
export const mirrorM = (axis: "x" | "y", at: number): Mat => (axis === "x" ? { a: -1, b: 0, c: 0, d: 1, e: 2 * at, f: 0 } : { a: 1, b: 0, c: 0, d: -1, e: 0, f: 2 * at });

export const apply = (m: Mat, x: number, y: number): [number, number] => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
/** Масштаб преобразования (длина образа единичного вектора). */
export const scaleOf = (m: Mat) => Math.hypot(m.a, m.b);
const det = (m: Mat) => m.a * m.d - m.b * m.c;

// ─── разбор ────────────────────────────────────────────────────────────────

const ARGS: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
const NUMBER = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;

/** Путь → абсолютные сегменты M, L, C, Q, A, Z. Некорректный путь — null. */
export function parsePath(d: string): Seg[] | null {
  const segs: Seg[] = [];
  let i = 0;
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let prevC: [number, number] | null = null;
  let prevQ: [number, number] | null = null;
  const skip = () => {
    while (i < d.length && (d[i] === " " || d[i] === "," || d[i] === "\n" || d[i] === "\t" || d[i] === "\r")) i++;
  };
  const num = (): number | null => {
    skip();
    NUMBER.lastIndex = i;
    const m = NUMBER.exec(d);
    if (!m) return null;
    i += m[0].length;
    const v = parseFloat(m[0]);
    return Number.isFinite(v) ? v : null;
  };
  const flag = (): 0 | 1 | null => {
    skip();
    const c = d[i];
    if (c !== "0" && c !== "1") return null;
    i++;
    return c === "1" ? 1 : 0;
  };
  let cmd = "";
  for (;;) {
    skip();
    if (i >= d.length) break;
    const ch = d[i];
    if (/[A-Za-z]/.test(ch)) {
      if (!(ch.toUpperCase() in ARGS)) return null;
      cmd = ch;
      i++;
      if (ch === "Z" || ch === "z") {
        segs.push(["Z"]);
        cx = sx;
        cy = sy;
        prevC = prevQ = null;
        continue;
      }
    } else if (!cmd || cmd === "Z" || cmd === "z") return null;
    const up = cmd.toUpperCase();
    const rel = cmd !== up;
    const args: number[] = [];
    for (let k = 0; k < ARGS[up]; k++) {
      const v = up === "A" && (k === 3 || k === 4) ? flag() : num();
      if (v === null) return null;
      args.push(v);
    }
    const ox = rel ? cx : 0;
    const oy = rel ? cy : 0;
    switch (up) {
      case "M": {
        cx = args[0] + ox;
        cy = args[1] + oy;
        sx = cx;
        sy = cy;
        segs.push(["M", cx, cy]);
        cmd = rel ? "l" : "L";
        prevC = prevQ = null;
        break;
      }
      case "L":
        cx = args[0] + ox;
        cy = args[1] + oy;
        segs.push(["L", cx, cy]);
        prevC = prevQ = null;
        break;
      case "H":
        cx = args[0] + ox;
        segs.push(["L", cx, cy]);
        prevC = prevQ = null;
        break;
      case "V":
        cy = args[0] + oy;
        segs.push(["L", cx, cy]);
        prevC = prevQ = null;
        break;
      case "C": {
        const [x1, y1, x2, y2, x, y] = [args[0] + ox, args[1] + oy, args[2] + ox, args[3] + oy, args[4] + ox, args[5] + oy];
        segs.push(["C", x1, y1, x2, y2, x, y]);
        prevC = [x2, y2];
        prevQ = null;
        cx = x;
        cy = y;
        break;
      }
      case "S": {
        const [x2, y2, x, y] = [args[0] + ox, args[1] + oy, args[2] + ox, args[3] + oy];
        const pc = prevC as [number, number] | null;
        const x1 = pc ? 2 * cx - pc[0] : cx;
        const y1 = pc ? 2 * cy - pc[1] : cy;
        segs.push(["C", x1, y1, x2, y2, x, y]);
        prevC = [x2, y2];
        prevQ = null;
        cx = x;
        cy = y;
        break;
      }
      case "Q": {
        const [x1, y1, x, y] = [args[0] + ox, args[1] + oy, args[2] + ox, args[3] + oy];
        segs.push(["Q", x1, y1, x, y]);
        prevQ = [x1, y1];
        prevC = null;
        cx = x;
        cy = y;
        break;
      }
      case "T": {
        const [x, y] = [args[0] + ox, args[1] + oy];
        const pq = prevQ as [number, number] | null;
        const x1 = pq ? 2 * cx - pq[0] : cx;
        const y1 = pq ? 2 * cy - pq[1] : cy;
        segs.push(["Q", x1, y1, x, y]);
        prevQ = [x1, y1];
        prevC = null;
        cx = x;
        cy = y;
        break;
      }
      case "A": {
        const x = args[5] + ox;
        const y = args[6] + oy;
        segs.push(["A", args[0], args[1], args[2], args[3] as 0 | 1, args[4] as 0 | 1, x, y]);
        prevC = prevQ = null;
        cx = x;
        cy = y;
        break;
      }
    }
  }
  return segs.length && segs[0][0] === "M" ? segs : null;
}

export function writePath(segs: Seg[]): string {
  return segs
    .map((s) => {
      switch (s[0]) {
        case "Z":
          return "Z";
        case "A":
          return `A${n(s[1])},${n(s[2])} ${n(s[3])} ${s[4]} ${s[5]} ${n(s[6])},${n(s[7])}`;
        default:
          return `${s[0]}${s.slice(1).map((v) => n(v as number)).join(",")}`;
      }
    })
    .join(" ");
}

/** Сегменты после преобразования подобия m. */
export function transformSegs(segs: Seg[], m: Mat): Seg[] {
  const s = scaleOf(m);
  const reflect = det(m) < 0;
  const theta = (Math.atan2(m.b, m.a) * 180) / Math.PI;
  const p = (x: number, y: number) => apply(m, x, y);
  return segs.map((seg): Seg => {
    switch (seg[0]) {
      case "M":
      case "L": {
        const [x, y] = p(seg[1], seg[2]);
        return [seg[0], x, y];
      }
      case "C": {
        const [x1, y1] = p(seg[1], seg[2]);
        const [x2, y2] = p(seg[3], seg[4]);
        const [x, y] = p(seg[5], seg[6]);
        return ["C", x1, y1, x2, y2, x, y];
      }
      case "Q": {
        const [x1, y1] = p(seg[1], seg[2]);
        const [x, y] = p(seg[3], seg[4]);
        return ["Q", x1, y1, x, y];
      }
      case "A": {
        const [x, y] = p(seg[6], seg[7]);
        return ["A", seg[1] * s, seg[2] * s, reflect ? theta - seg[3] : seg[3] + theta, seg[4], reflect ? (seg[5] ? 0 : 1) : seg[5], x, y];
      }
      case "Z":
        return ["Z"];
    }
  });
}

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Охват пути по узлам и опорным точкам (дуги — по концам и радиусу): грубо, но хватает, чтобы заметить уход за холст. */
export function segsBox(segs: Seg[]): Box | null {
  let b: Box | null = null;
  const add = (x: number, y: number, pad = 0) => {
    b = b ? { x0: Math.min(b.x0, x - pad), y0: Math.min(b.y0, y - pad), x1: Math.max(b.x1, x + pad), y1: Math.max(b.y1, y + pad) } : { x0: x - pad, y0: y - pad, x1: x + pad, y1: y + pad };
  };
  for (const s of segs) {
    if (s[0] === "M" || s[0] === "L") add(s[1], s[2]);
    else if (s[0] === "C") {
      add(s[1], s[2]);
      add(s[3], s[4]);
      add(s[5], s[6]);
    } else if (s[0] === "Q") {
      add(s[1], s[2]);
      add(s[3], s[4]);
    } else if (s[0] === "A") add(s[6], s[7]);
  }
  return b;
}
