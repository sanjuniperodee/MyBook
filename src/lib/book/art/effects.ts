/**
 * Приёмы «дорогой» обложки, которых не собрать из простых фигур: плавное затемнение поверх фото (fade), росчерк пером
 * с утончением к концам (pen, flourish) и гравюрная графика медальонов — плетёная лента синусоид (lattice) и цепочка
 * петель (loops), как на банкнотах и старых приглашениях. Всё — обычные фигуры Drawing, поэтому HTML и PDF рисуют одно.
 */
import { n } from "../covers/svg-kit";
import type { Shape } from "../interior-art";
import { ArtError, Fields, poly, shape, type Pt } from "./kit";

/** Сколько полос даёт затемнение fade — оно одно занимает не больше стольких фигур рисунка. */
export const FADE_STEPS = 140;

const smoothstep = (t: number) => t * t * (3 - 2 * t);
function invSmoothstep(s: number) {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 32; i++) {
    const m = (lo + hi) / 2;
    if (smoothstep(m) < s) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}

/**
 * Плавное затемнение (или высветление) к краю: стопка полос одной малой прозрачности, у каждой — свой край. Сумма
 * идёт по smoothstep от нуля до opacity у края to. Одна прозрачность на всех — ступени незаметны (полосы разной
 * прозрачности с округлением до сотых давали видимые ступени), и ни одна полоса не получает opacity 0.
 */
function fade(f: Fields): Shape[] {
  const { ctx } = f;
  const x = f.num("x", 0);
  const y = f.num("y", 0);
  const w = f.num("w", ctx.w, 1);
  const h = f.num("h", ctx.h, 1);
  const to = f.str("to", ["bottom", "top", "left", "right"] as const, "bottom");
  const max = f.num("opacity", 0.9, 0.05, 0.98);
  const fill = f.paint("fill") ?? "main";
  // Ступень — сотые (так хранит рисунок), полос — не больше FADE_STEPS.
  const step = Math.max(0.01, Math.ceil((1 - Math.pow(1 - max, 1 / FADE_STEPS)) * 100) / 100);
  const out: Shape[] = [];
  for (let k = 1; ; k++) {
    const c = 1 - Math.pow(1 - step, k);
    if (c > max + 1e-9 || k > FADE_STEPS) break;
    const t = invSmoothstep(c / max); // доля пути от прозрачного края к плотному
    const r =
      to === "bottom" ? { x, y: y + h * t, w, h: h * (1 - t) } : to === "top" ? { x, y, w, h: h * (1 - t) } : to === "right" ? { x: x + w * t, y, w: w * (1 - t), h } : { x, y, w: w * (1 - t), h };
    if (r.w < 0.05 || r.h < 0.05) continue;
    out.push({ kind: "rect", x: n(r.x), y: n(r.y), w: n(r.w), h: n(r.h), fill, opacity: step });
  }
  return out;
}

/** Точки кривой Catmull–Rom через опорные точки: per — сколько точек на отрезок. */
function sampleSpline(pts: Pt[], per: number): Pt[] {
  if (pts.length < 3) return pts;
  const out: Pt[] = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    for (let s = 1; s <= per; s++) {
      const t = s / per;
      const t2 = t * t;
      const t3 = t2 * t;
      const c = (a: number, b: number, cc: number, d: number) => 0.5 * (2 * b + (-a + cc) * t + (2 * a - 5 * b + 4 * cc - d) * t2 + (-a + 3 * b - 3 * cc + d) * t3);
      out.push({ x: c(p0.x, p1.x, p2.x, p3.x), y: c(p0.y, p1.y, p2.y, p3.y) });
    }
  }
  return out;
}

/** Десятые — для частой гравюры (лента, петли): точнее не видно, а путь вдвое короче и влезает в предел рисунка. */
const n1 = (v: number) => Math.round(v * 10) / 10;

/** Замкнутая плавная кривая через точки; r — округление чисел. */
function closedSmooth(pts: Pt[], r: (v: number) => number = n): string {
  const m = pts.length;
  let d = `M${r(pts[0].x)},${r(pts[0].y)}`;
  for (let i = 0; i < m; i++) {
    const p0 = pts[(i + m - 1) % m];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % m];
    const p3 = pts[(i + 2) % m];
    d += `C${r(p1.x + (p2.x - p0.x) / 6)},${r(p1.y + (p2.y - p0.y) / 6)} ${r(p2.x - (p3.x - p1.x) / 6)},${r(p2.y - (p3.y - p1.y) / 6)} ${r(p2.x)},${r(p2.y)}`;
  }
  return `${d}Z`;
}

/** Контур мазка пером вдоль линии: толщина width(t) по длине, t — 0…1. */
function penOutline(line: Pt[], width: (t: number) => number): string {
  const L: Pt[] = [];
  const R: Pt[] = [];
  const m = line.length;
  for (let i = 0; i < m; i++) {
    const a = line[Math.max(0, i - 1)];
    const b = line[Math.min(m - 1, i + 1)];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const nx = -(b.y - a.y) / len;
    const ny = (b.x - a.x) / len;
    const half = width(i / (m - 1)) / 2;
    L.push({ x: line[i].x + nx * half, y: line[i].y + ny * half });
    R.push({ x: line[i].x - nx * half, y: line[i].y - ny * half });
  }
  return closedSmooth([...L, ...R.reverse()]);
}

type Taper = "both" | "end" | "start" | "none";
const taperOf = (kind: Taper, w: number) => (t: number) => {
  const s = kind === "both" ? Math.sin(Math.PI * t) : kind === "end" ? Math.cos((Math.PI / 2) * t) : kind === "start" ? Math.sin((Math.PI / 2) * t) : 1;
  return w * (0.18 + 0.82 * Math.max(0, s));
};

function points(f: Fields, key: string): Pt[] {
  const raw = f.o[key];
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > 60) throw new ArtError(`${f.t}: ${key} — список из 2–60 точек [x, y]`);
  return raw.map((p, i) => {
    if (!Array.isArray(p) || p.length !== 2 || !p.every((v) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 5000)) throw new ArtError(`${f.t}: ${key}[${i}] — точка [x, y]`);
    return { x: p[0], y: p[1] };
  });
}

/** Мазок пером: плавная линия через точки, толще посередине и тоньше к концам — как в каллиграфии и гравюре. */
function pen(f: Fields): Shape[] {
  const pts = points(f, "points");
  const width = f.num("width", f.ctx.unit * 0.012, 0.05, 100);
  const taper = f.str("taper", ["both", "end", "start", "none"] as const, "both");
  const st = f.closed();
  // Точек контура — не больше ~300: путь укладывается в предел рисунка.
  const per = Math.max(2, Math.min(6, Math.floor(150 / pts.length)));
  return [shape(penOutline(sampleSpline(pts, per), taperOf(taper, width)), { ...st, fill: st.fill ?? st.stroke ?? "main", stroke: null })];
}

/** Каллиграфический росчерк: две симметричные волны пером от центра, на концах — завитки внутрь, в центре — ромб. */
function flourish(f: Fields): Shape[] {
  const cx = f.num("cx");
  const cy = f.num("cy");
  const w = f.num("w", undefined, 6);
  const weight = f.num("weight", w * 0.022, 0.05, 50);
  const curl = f.num("curl", 1, 0, 2);
  const st = f.closed();
  const paint = { ...st, fill: st.fill ?? st.stroke ?? "main", stroke: null };
  const s = w / 44; // эскиз нарисован на ширину 44
  const half: Pt[] = [];
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    half.push({ x: cx + (2.6 + t * 17) * s, y: cy - Math.sin(t * Math.PI) * 1.3 * s });
  }
  if (curl > 0) {
    const ex = cx + 19.6 * s;
    const r0 = 2.7 * s * curl;
    for (let i = 1; i <= 18; i++) {
      const t = i / 18;
      const a = Math.PI / 2 - t * Math.PI * 1.7;
      const r = r0 * (1 - 0.6 * t);
      half.push({ x: ex + r * Math.cos(a), y: cy - r0 + r * Math.sin(a) + (r0 - r) * 0.4 });
    }
  }
  const width = (t: number) => weight * (0.22 + 0.78 * Math.sin(Math.PI * Math.min(1, t * 1.25)) ** 1.2);
  const mirrored = half.map((p) => ({ x: 2 * cx - p.x, y: p.y }));
  const k = 1.7 * s;
  return [
    shape(`${penOutline(half, width)} ${penOutline(mirrored, width)}`, paint),
    shape(poly([{ x: cx, y: cy - k }, { x: cx + k * 0.74, y: cy }, { x: cx, y: cy + k }, { x: cx - k * 0.74, y: cy }]), paint),
  ];
}

/** Замкнутая кривая r(θ) вокруг центра: θ от верха по часовой. */
function polarPath(cx: number, cy: number, r: (t: number) => number, steps: number) {
  // Десятые: лента из десятка таких кривых иначе не помещается в предел рисунка.
  const pts: Pt[] = [];
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const rr = r(t);
    pts.push({ x: cx + rr * Math.sin(t), y: cy - rr * Math.cos(t) });
  }
  return closedSmooth(pts, n1);
}

/** Гильош-лента: lines синусоид со сдвигом фазы по кольцу радиуса r — ровная плетёная сетка, как на банкнотах. */
function lattice(f: Fields): Shape[] {
  const cx = f.num("cx");
  const cy = f.num("cy");
  const r = f.num("r", undefined, 2);
  const amp = f.num("amp", r * 0.07, 0.1, r * 0.5);
  const waves = f.int("waves", 24, 3, 36);
  const lines = f.int("lines", 10, 2, 12);
  if (waves * lines > 260) throw new ArtError("lattice: слишком плотная лента — waves × lines не больше 260 (например, 24 × 10)");
  const st = f.open(f.ctx.unit * 0.0016);
  // Каждая синусоида — своя фигура: одна общая не уложилась бы в предел длины пути.
  return Array.from({ length: lines }, (_, k) => shape(polarPath(cx, cy, (t) => r + amp * Math.sin(waves * t + (k / lines) * Math.PI * 2), waves * 5), st));
}

/** Цепочка петель (трохоида) по кругу радиуса r: count петель размером amp — кружевной кант медальона. */
function loops(f: Fields): Shape[] {
  const cx = f.num("cx");
  const cy = f.num("cy");
  const r = f.num("r", undefined, 2);
  const amp = f.num("amp", r * 0.04, 0.1, r * 0.4);
  const count = f.int("count", 48, 6, 64);
  const st = f.open(f.ctx.unit * 0.002);
  const steps = count * 6;
  const pts: Pt[] = [];
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    pts.push({ x: cx + r * Math.sin(t) + amp * Math.sin((count + 1) * t), y: cy - r * Math.cos(t) - amp * Math.cos((count + 1) * t) });
  }
  return [shape(closedSmooth(pts, n1), st)];
}

export const EFFECTS = ["fade", "pen", "flourish", "lattice", "loops"] as const;
export const EFFECT_BUILDERS: Record<(typeof EFFECTS)[number], (f: Fields) => Shape[]> = { fade, pen, flourish, lattice, loops };
