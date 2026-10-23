/**
 * Готовые элементы для рисунков ИИ-дизайнера: пейзажные «сцены» (горы, холмы, солнце, луна, облако, звёзды, деревья,
 * тюльпан, юрта, птица), узоры (меандр, кошкар-мүйіз, чешуя, ёлочка, точки, ромбы, зигзаг, волны) и рамки из узоров.
 * Модель называет элемент и несколько чисел, а координаты, пропорции и повторы считает код: так рисунок получается
 * аккуратным даже у лёгкой модели, а не «нарисованным от руки» набором путей.
 */
import { n, rng } from "../covers/svg-kit";
import type { Shape } from "../interior-art";
import { circlePath, wavePath } from "../interior-art/geometry";
import { ArtError, circleShape, Fields, onCircle, poly, shape, smooth, transformAll, type Pt, type Style } from "./kit";
import type { Mat } from "./path";

const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const faded = (st: Style, k: number): Style => ({ ...st, opacity: Math.round((st.opacity ?? 1) * k * 100) / 100 });

// ─── сцены ─────────────────────────────────────────────────────────────────

function mountains(f: Fields): Shape[] {
  const { ctx } = f;
  const x = f.num("x", 0);
  const w = f.num("w", ctx.w, 10);
  const h = f.num("h", ctx.h * 0.4, 5);
  const y = f.num("y", ctx.h - h);
  const peaks = f.int("peaks", 4, 2, 9);
  const layers = f.int("layers", 2, 1, 4);
  const rand = rng(f.int("seed", 1, 0, 9999) * 977 + 13);
  const st = f.closed();
  const snow = f.paint("snow");
  const base = y + h;
  const out: Shape[] = [];
  for (let k = 0; k < layers; k++) {
    const front = k === layers - 1;
    const height = h * (layers === 1 ? 1 : 0.62 + 0.38 * (k / (layers - 1)));
    const pts: Pt[] = [{ x, y: base - height * (0.1 + 0.25 * rand()) }];
    const tops: number[] = [];
    const count = peaks + (layers - 1 - k);
    for (let i = 0; i < count; i++) {
      tops.push(pts.length);
      pts.push({ x: x + w * ((i + 0.5 + (rand() - 0.5) * 0.45) / count), y: base - height * (0.55 + 0.45 * rand()) });
      if (i < count - 1) pts.push({ x: x + w * ((i + 1 + (rand() - 0.5) * 0.3) / count), y: base - height * (0.12 + 0.28 * rand()) });
    }
    pts.push({ x: x + w, y: base - height * (0.1 + 0.25 * rand()) });
    const shade = layers === 1 ? 1 : 0.45 + 0.55 * (k / (layers - 1));
    if (f.o.line === true) {
      // Гребень тонкой линией («монолиния»). Заливка (цвет фона) закрывает дальние хребты за ближними — линии не путаются.
      const cover = f.paint("fill");
      if (cover) out.push(shape(poly([...pts, { x: x + w, y: base }, { x, y: base }]), { fill: cover, stroke: null, width: 0 }));
      out.push(shape(poly(pts, false), faded({ fill: null, stroke: f.paint("stroke") ?? "main", width: n(ctx.unit * 0.0035), round: true, ...(st.opacity !== undefined ? { opacity: st.opacity } : {}) }, shade)));
      continue;
    }
    out.push(shape(poly([...pts, { x: x + w, y: base }, { x, y: base }]), faded({ ...st, stroke: null }, shade)));
    if (front && snow) {
      const high = Math.min(...tops.map((i) => pts[i].y));
      for (const i of tops) {
        const p = pts[i];
        if (p.y > high + height * 0.12) continue;
        const a = lerp(p, pts[i - 1], 0.3);
        const b = lerp(p, pts[i + 1], 0.3);
        const cap = [p, a, { ...lerp(a, b, 0.25), y: lerp(a, b, 0.25).y + height * 0.05 }, { ...lerp(a, b, 0.5), y: lerp(a, b, 0.5).y + height * 0.015 }, { ...lerp(a, b, 0.75), y: lerp(a, b, 0.75).y + height * 0.05 }, b];
        out.push(shape(poly(cap), { fill: snow, stroke: null, width: 0, ...(st.opacity !== undefined ? { opacity: st.opacity } : {}) }));
      }
    }
  }
  return out;
}

function hills(f: Fields): Shape[] {
  const { ctx } = f;
  const x = f.num("x", 0);
  const w = f.num("w", ctx.w, 10);
  const h = f.num("h", ctx.h * 0.3, 5);
  const y = f.num("y", ctx.h - h);
  const layers = f.int("layers", 3, 1, 5);
  const rand = rng(f.int("seed", 1, 0, 9999) * 631 + 5);
  const st = f.closed();
  const out: Shape[] = [];
  for (let k = 0; k < layers; k++) {
    const level = y + h * (0.1 + (0.5 * k) / Math.max(1, layers));
    const amp = h * 0.18;
    const steps = 5;
    const pts: Pt[] = [];
    for (let i = 0; i <= steps; i++) pts.push({ x: x + (w * i) / steps, y: level + (rand() - 0.5) * 2 * amp });
    const curve = smooth(pts);
    out.push(shape(`${curve} L${n(x + w)},${n(y + h)} L${n(x)},${n(y + h)}Z`, faded({ ...st, stroke: null }, layers === 1 ? 1 : 0.4 + 0.6 * (k / (layers - 1)))));
  }
  return out;
}

function sun(f: Fields): Shape[] {
  const cx = f.num("cx");
  const cy = f.num("cy");
  const r = f.num("r", undefined, 1);
  const rays = f.int("rays", 0, 0, 36);
  const st = f.closed();
  const out: Shape[] = [circleShape(cx, cy, r, st)];
  if (rays) {
    const color = f.paint("rayColor") ?? st.fill ?? st.stroke ?? "main";
    const ray: Style = { fill: null, stroke: color, width: n(r * 0.09), round: true, ...(st.opacity !== undefined ? { opacity: st.opacity } : {}) };
    const d: string[] = [];
    for (let i = 0; i < rays; i++) {
      const a = (i * 360) / rays;
      const p = onCircle(cx, cy, r * 1.3, a);
      const q = onCircle(cx, cy, r * (i % 2 ? 1.62 : 1.85), a);
      d.push(`M${n(p.x)},${n(p.y)} L${n(q.x)},${n(q.y)}`);
    }
    out.push(shape(d.join(" "), ray));
  }
  return out;
}

function moon(f: Fields): Shape[] {
  const cx = f.num("cx");
  const cy = f.num("cy");
  const r = f.num("r", undefined, 1);
  const st = f.closed();
  const c2 = { x: cx + r * 0.45, y: cy - r * 0.15 };
  const r2 = r * 0.85;
  const step = 3;
  const ring = (c: Pt, rad: number, inside: (p: Pt) => boolean) => {
    const pts: { p: Pt; ok: boolean }[] = [];
    for (let a = 0; a < 360; a += step) {
      const p = onCircle(c.x, c.y, rad, a);
      pts.push({ p, ok: inside(p) });
    }
    // Непрерывный кусок: начинаем сразу после первой «выпавшей» точки.
    const start = pts.findIndex((q, i) => q.ok && !pts[(i + pts.length - 1) % pts.length].ok);
    if (start < 0) return pts.every((q) => q.ok) ? pts.map((q) => q.p) : [];
    const run: Pt[] = [];
    for (let i = 0; i < pts.length; i++) {
      const q = pts[(start + i) % pts.length];
      if (!q.ok) break;
      run.push(q.p);
    }
    return run;
  };
  const outer = ring({ x: cx, y: cy }, r, (p) => Math.hypot(p.x - c2.x, p.y - c2.y) > r2);
  const inner = ring(c2, r2, (p) => Math.hypot(p.x - cx, p.y - cy) < r);
  if (outer.length < 4 || inner.length < 2) return [circleShape(cx, cy, r, st)];
  const last = outer[outer.length - 1];
  const forward = Math.hypot(inner[0].x - last.x, inner[0].y - last.y) <= Math.hypot(inner[inner.length - 1].x - last.x, inner[inner.length - 1].y - last.y);
  return [shape(poly([...outer, ...(forward ? inner : [...inner].reverse())]), { ...st, stroke: null })];
}

function cloud(f: Fields): Shape[] {
  const cx = f.num("cx");
  const cy = f.num("cy");
  const w = f.num("w", undefined, 4);
  const st = f.closed();
  const p = (x: number, y: number) => `${n(cx + x * w)},${n(cy + y * w)}`;
  const arc = (r: number, x: number, y: number) => `A${n(r * w)},${n(r * w)} 0 0 0 ${p(x, y)}`;
  const d = `M${p(-0.34, 0.15)} L${p(0.34, 0.15)} ${arc(0.12, 0.4, -0.06)} ${arc(0.17, 0.14, -0.14)} ${arc(0.22, -0.18, -0.12)} ${arc(0.16, -0.4, 0.03)} ${arc(0.1, -0.34, 0.15)}Z`;
  return [shape(d, { ...st, stroke: null })];
}

function stars(f: Fields): Shape[] {
  const { ctx } = f;
  const x = f.num("x", 0);
  const y = f.num("y", 0);
  const w = f.num("w", ctx.w, 5);
  const h = f.num("h", ctx.h, 5);
  const count = f.int("count", 30, 1, 90);
  const size = f.num("size", ctx.unit * 0.006, 0.2, 100);
  const rand = rng(f.int("seed", 1, 0, 9999) * 313 + 7);
  const st = f.closed();
  const dots: string[] = [];
  const sparks: string[] = [];
  for (let i = 0; i < count; i++) {
    const px = x + rand() * w;
    const py = y + rand() * h;
    const r = size * (0.5 + rand() * 1.2);
    if (rand() < 0.3) {
      const s = r * 2.4;
      sparks.push(poly([{ x: px, y: py - s }, { x: px + s * 0.22, y: py - s * 0.22 }, { x: px + s, y: py }, { x: px + s * 0.22, y: py + s * 0.22 }, { x: px, y: py + s }, { x: px - s * 0.22, y: py + s * 0.22 }, { x: px - s, y: py }, { x: px - s * 0.22, y: py - s * 0.22 }]));
    } else dots.push(circlePath(px, py, r));
  }
  const out: Shape[] = [];
  const fill = { ...st, stroke: null };
  if (sparks.length) out.push(shape(sparks.join(" "), fill));
  if (dots.length) out.push(shape(dots.join(" "), faded(fill, 0.8)));
  return out;
}

function tree(f: Fields): Shape[] {
  const x = f.num("x");
  const y = f.num("y");
  const h = f.num("h", undefined, 4);
  const kind = f.str("kind", ["pine", "round", "birch"], "pine");
  const st = f.closed();
  const trunk: Style = { fill: f.paint("trunk") ?? "accent", stroke: null, width: 0, ...(st.opacity !== undefined ? { opacity: st.opacity } : {}) };
  const fill = { ...st, stroke: null };
  const out: Shape[] = [];
  const rect = (x0: number, y0: number, w: number, hh: number) => poly([{ x: x0, y: y0 }, { x: x0 + w, y: y0 }, { x: x0 + w, y: y0 + hh }, { x: x0, y: y0 + hh }]);
  if (kind === "pine") {
    out.push(shape(rect(x - 0.035 * h, y - 0.14 * h, 0.07 * h, 0.14 * h), trunk));
    const tier = (base: number, apex: number, half: number) => poly([{ x: x - half * h, y: y - base * h }, { x, y: y - apex * h }, { x: x + half * h, y: y - base * h }]);
    out.push(shape([tier(0.1, 0.46, 0.22), tier(0.3, 0.7, 0.18), tier(0.52, 1, 0.14)].join(" "), fill));
  } else if (kind === "round") {
    out.push(shape(rect(x - 0.03 * h, y - 0.5 * h, 0.06 * h, 0.5 * h), trunk));
    out.push(circleShape(x, y - 0.72 * h, 0.28 * h, fill));
  } else {
    out.push(shape(`M${n(x)},${n(y)} L${n(x + 0.01 * h)},${n(y - h * 0.9)}`, { fill: null, stroke: trunk.fill, width: n(h * 0.05), round: true, ...(st.opacity !== undefined ? { opacity: st.opacity } : {}) }));
    const leaves: string[] = [];
    const spots: [number, number, number][] = [[-0.12, 0.8, 0.09], [0.13, 0.7, 0.09], [-0.1, 0.6, 0.08], [0.12, 0.5, 0.08], [0, 0.95, 0.09], [-0.08, 0.38, 0.07]];
    for (const [dx, dy, r] of spots) leaves.push(circlePath(x + dx * h, y - dy * h, r * h));
    out.push(shape(leaves.join(" "), fill));
  }
  return out;
}

function tulip(f: Fields): Shape[] {
  const x = f.num("x");
  const y = f.num("y");
  const h = f.num("h", undefined, 6);
  const st = f.closed();
  const leaf = f.paint("leaf") ?? "accent";
  const op = st.opacity !== undefined ? { opacity: st.opacity } : {};
  const top = y - h * 0.68;
  const out: Shape[] = [];
  out.push(shape(`M${n(x)},${n(y)} L${n(x)},${n(top + h * 0.05)}`, { fill: null, stroke: leaf, width: n(h * 0.035), round: true, ...op }));
  const blade = (side: 1 | -1) => `M${n(x)},${n(y - h * 0.06)} C${n(x + side * h * 0.28)},${n(y - h * 0.12)} ${n(x + side * h * 0.3)},${n(y - h * 0.38)} ${n(x + side * h * 0.2)},${n(y - h * 0.5)} C${n(x + side * h * 0.1)},${n(y - h * 0.34)} ${n(x + side * h * 0.04)},${n(y - h * 0.18)} ${n(x)},${n(y - h * 0.06)}Z`;
  out.push(shape(`${blade(1)} ${blade(-1)}`, { fill: leaf, stroke: null, width: 0, ...op }));
  const wd = h * 0.17;
  const cup = `M${n(x - wd)},${n(top - h * 0.05)} C${n(x - wd * 1.1)},${n(top + h * 0.22)} ${n(x - wd * 0.4)},${n(top + h * 0.3)} ${n(x)},${n(top + h * 0.3)} C${n(x + wd * 0.4)},${n(top + h * 0.3)} ${n(x + wd * 1.1)},${n(top + h * 0.22)} ${n(x + wd)},${n(top - h * 0.05)} L${n(x + wd * 0.5)},${n(top - h * 0.17)} L${n(x)},${n(top - h * 0.03)} L${n(x - wd * 0.5)},${n(top - h * 0.17)}Z`;
  out.push(shape(cup, { ...st, stroke: null }));
  return out;
}

function yurt(f: Fields): Shape[] {
  const cx = f.num("cx");
  const y = f.num("y");
  const w = f.num("w", undefined, 6);
  const st = f.closed();
  const detail: Style = { fill: f.paint("door") ?? "accent", stroke: null, width: 0, ...(st.opacity !== undefined ? { opacity: st.opacity } : {}) };
  const wallTop = y - w * 0.26;
  const x0 = cx - w / 2;
  const out: Shape[] = [];
  out.push(shape(`M${n(x0)},${n(y)} L${n(x0)},${n(wallTop)} A${n(w / 2)},${n(w * 0.36)} 0 0 1 ${n(x0 + w)},${n(wallTop)} L${n(x0 + w)},${n(y)}Z`, { ...st, stroke: null }));
  out.push(shape(`M${n(cx - w * 0.07)},${n(y)} L${n(cx - w * 0.07)},${n(y - w * 0.15)} A${n(w * 0.07)},${n(w * 0.07)} 0 0 1 ${n(cx + w * 0.07)},${n(y - w * 0.15)} L${n(cx + w * 0.07)},${n(y)}Z`, detail));
  out.push(shape(`M${n(x0)},${n(wallTop)} L${n(x0 + w)},${n(wallTop)}`, { fill: null, stroke: detail.fill, width: n(w * 0.022), ...(st.opacity !== undefined ? { opacity: st.opacity } : {}) }));
  out.push(shape(`M${n(cx - w * 0.1)},${n(y - w * 0.612)} A${n(w * 0.1)},${n(w * 0.05)} 0 0 1 ${n(cx + w * 0.1)},${n(y - w * 0.612)}`, { fill: null, stroke: detail.fill, width: n(w * 0.02), round: true, ...(st.opacity !== undefined ? { opacity: st.opacity } : {}) }));
  return out;
}

function bird(f: Fields): Shape[] {
  const cx = f.num("cx");
  const cy = f.num("cy");
  const w = f.num("w", undefined, 4);
  const st = f.open(w * 0.06);
  const d = `M${n(cx - w / 2)},${n(cy)} Q${n(cx - w / 4)},${n(cy - w * 0.3)} ${n(cx)},${n(cy)} Q${n(cx + w / 4)},${n(cy - w * 0.3)} ${n(cx + w / 2)},${n(cy)}`;
  return [shape(d, st)];
}

export const SCENES = ["mountains", "hills", "sun", "moon", "cloud", "stars", "tree", "tulip", "yurt", "bird"] as const;
export const SCENE_BUILDERS: Record<(typeof SCENES)[number], (f: Fields) => Shape[]> = { mountains, hills, sun, moon, cloud, stars, tree, tulip, yurt, bird };

// ─── узоры ─────────────────────────────────────────────────────────────────

const ART_CELLS = 120;

export const PATTERNS = ["meander", "koshkar", "scales", "chevron", "dots", "diamonds", "zigzag", "waves"] as const;
export type PatternKind = (typeof PATTERNS)[number];

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Узор в прямоугольнике: size — шаг повтора (по умолчанию от высоты полосы). Один путь на стиль — узоры не раздувают рисунок. */
export function patternShapes(kind: PatternKind, box: Box, size: number | undefined, st: Style): Shape[] {
  const { x, y, w, h } = box;
  const cap = ART_CELLS;
  switch (kind) {
    case "meander": {
      const u = (size ?? h) / 5;
      const units = Math.max(1, Math.min(cap, Math.floor(w / (5 * u))));
      const used = units * 5 * u;
      const x0 = x + (w - used) / 2;
      const top = y + (h - 5 * u) / 2;
      const hooks: string[] = [];
      for (let i = 0; i < units; i++) {
        const a = x0 + i * 5 * u;
        const p = (dx: number, dy: number) => `${n(a + dx * u)},${n(top + dy * u)}`;
        hooks.push(`M${p(0, 4)} L${p(0, 0)} L${p(4, 0)} L${p(4, 3)} L${p(1, 3)} L${p(1, 1)} L${p(3, 1)} L${p(3, 2)} L${p(2, 2)}`);
      }
      const line = `M${n(x0)},${n(top + 4 * u)} L${n(x0 + used)},${n(top + 4 * u)}`;
      return [shape(`${line} ${hooks.join(" ")}`, { ...st, fill: null, stroke: st.stroke ?? st.fill ?? "main", width: n(Math.max(u * 0.4, 0.2)), round: false })];
    }
    case "koshkar": {
      const s = size ?? h;
      const tileW = s * 2.2;
      const tiles = Math.max(1, Math.min(cap, Math.floor(w / tileW)));
      const x0 = x + (w - tiles * tileW) / 2;
      const top = y + (h - s) / 2;
      const d: string[] = [];
      for (let i = 0; i < tiles; i++) {
        const cx = x0 + i * tileW + tileW / 2;
        const p = (px: number, py: number, side: 1 | -1) => `${n(cx + side * (px - 1) * s)},${n(top + py * s)}`;
        for (const side of [-1, 1] as const)
          d.push(`M${p(1.02, 0.92, side)} C${p(0.7, 0.96, side)} ${p(0.38, 0.9, side)} ${p(0.26, 0.64, side)} C${p(0.12, 0.34, side)} ${p(0.3, 0.06, side)} ${p(0.52, 0.1, side)} C${p(0.72, 0.14, side)} ${p(0.72, 0.4, side)} ${p(0.56, 0.44, side)} C${p(0.45, 0.46, side)} ${p(0.42, 0.34, side)} ${p(0.5, 0.3, side)}`);
        d.push(`M${n(cx)},${n(top + 0.93 * s)} L${n(cx)},${n(top + 0.78 * s)}`);
      }
      return [shape(d.join(" "), { ...st, fill: null, stroke: st.stroke ?? st.fill ?? "main", width: n(Math.max(s * 0.07, 0.2)), round: true })];
    }
    case "scales": {
      const s = size ?? h / 2;
      const rows = Math.max(1, Math.min(cap, Math.ceil(h / (s * 0.5))));
      const d: string[] = [];
      for (let r = 0; r < rows; r++) {
        const cy = y + s * 0.5 * r;
        const off = r % 2 ? s : 0;
        for (let cx = x + s + off; cx + s <= x + w + s * 0.01; cx += 2 * s) {
          if (d.length > ART_CELLS * 2) break;
          d.push(`M${n(cx - s)},${n(cy)} A${n(s)},${n(s)} 0 0 0 ${n(cx + s)},${n(cy)}`);
        }
      }
      return [shape(d.join(" "), { ...st, fill: null, stroke: st.stroke ?? st.fill ?? "main", width: n(Math.max(s * 0.08, 0.2)), round: true })];
    }
    case "chevron": {
      const s = size ?? h / 3;
      const d: string[] = [];
      const rows = Math.max(1, Math.min(cap, Math.floor(h / (s * 0.8)) + 1));
      for (let r = 0; r < rows; r++) {
        const yy = y + r * s * 0.8;
        let line = `M${n(x)},${n(yy)}`;
        for (let cx = x, i = 0; cx < x + w; cx += s, i++) line += ` L${n(Math.min(cx + s / 2, x + w))},${n(yy + s * 0.5)} L${n(Math.min(cx + s, x + w))},${n(yy)}`;
        d.push(line);
      }
      return [shape(d.join(" "), { ...st, fill: null, stroke: st.stroke ?? st.fill ?? "main", width: n(Math.max(s * 0.1, 0.2)), round: true })];
    }
    case "dots": {
      const s = size ?? Math.min(w, h) / 4;
      const r = Math.max(s * 0.2, 0.3);
      const cols = Math.max(1, Math.floor(w / s));
      const rows = Math.max(1, Math.floor(h / s));
      const d: string[] = [];
      for (let j = 0; j < rows && d.length < ART_CELLS * 2; j++)
        for (let i = 0; i < cols && d.length < ART_CELLS * 2; i++) d.push(circlePath(x + s * (i + 0.5 + (j % 2 ? 0.5 : 0)) + (w - cols * s) / 2, y + s * (j + 0.5) + (h - rows * s) / 2, r));
      return [shape(d.join(" "), { ...st, stroke: null, fill: st.fill ?? st.stroke ?? "main" })];
    }
    case "diamonds": {
      const s = size ?? Math.min(h, w / 3);
      const cols = Math.max(1, Math.min(cap, Math.floor(w / s)));
      const rows = Math.max(1, Math.min(cap, Math.floor(h / s)));
      const d: string[] = [];
      for (let j = 0; j < rows; j++)
        for (let i = 0; i < cols; i++) {
          const cx = x + (w - cols * s) / 2 + s * (i + 0.5);
          const cy = y + (h - rows * s) / 2 + s * (j + 0.5);
          d.push(poly([{ x: cx, y: cy - s * 0.42 }, { x: cx + s * 0.34, y: cy }, { x: cx, y: cy + s * 0.42 }, { x: cx - s * 0.34, y: cy }]));
        }
      const stroked = st.stroke && !st.fill;
      return [shape(d.join(" "), stroked ? { ...st, fill: null, round: true } : { ...st, stroke: null, fill: st.fill ?? "main" })];
    }
    case "zigzag": {
      const s = size ?? h / 2;
      let line = `M${n(x)},${n(y + h)}`;
      for (let cx = x, up = true; cx < x + w; cx += s / 2, up = !up) line += ` L${n(Math.min(cx + s / 2, x + w))},${n(up ? y : y + h)}`;
      return [shape(line, { ...st, fill: null, stroke: st.stroke ?? st.fill ?? "main", width: n(Math.max(s * 0.1, 0.2)), round: true })];
    }
    case "waves": {
      const s = size ?? h / 2;
      const rows = Math.max(1, Math.min(cap, Math.floor(h / (s * 0.9)) + 1));
      const d: string[] = [];
      for (let r = 0; r < rows; r++) d.push(wavePath(x, x + w, y + s * 0.5 + r * s * 0.9, s * 0.25, s * 1.6, (r % 2) * 0.5).d);
      return [shape(d.join(" "), { ...st, fill: null, stroke: st.stroke ?? st.fill ?? "main", width: n(Math.max(s * 0.08, 0.2)), round: true })];
    }
  }
}

export function pattern(f: Fields): Shape[] {
  const { ctx } = f;
  const kind = f.str("kind", PATTERNS);
  const box = { x: f.num("x", 0), y: f.num("y", 0), w: f.num("w", ctx.w, 4), h: f.num("h", ctx.unit * 0.08, 2) };
  const st = kind === "dots" || kind === "diamonds" ? f.closed() : f.open();
  return patternShapes(kind, box, f.has("size") ? f.num("size", undefined, 1) : undefined, st);
}

// ─── рамки ─────────────────────────────────────────────────────────────────

export const BORDERS = [...PATTERNS, "line", "double", "chamfer", "brackets"] as const;

/** Рамка по краям холста: на каждой стороне — полоса узора, в углах — розетки. */
export function border(f: Fields): Shape[] {
  const { ctx } = f;
  const kind = f.str("kind", BORDERS, "double");
  const inset = f.num("inset", ctx.unit * 0.04, 0, ctx.unit / 3);
  const band = f.num("size", ctx.unit * 0.05, 2, ctx.unit / 4);
  const st = kind === "dots" || kind === "diamonds" ? f.closed() : f.open();
  const { w, h } = ctx;
  const rectPath = (i: number) => poly([{ x: i, y: i }, { x: w - i, y: i }, { x: w - i, y: h - i }, { x: i, y: h - i }]);
  const line: Style = { ...st, fill: null, stroke: st.stroke ?? st.fill ?? "main", width: n(Math.max(ctx.unit * 0.004, 0.3)) };
  if (kind === "line") return [shape(rectPath(inset), { ...line, width: n(f.num("width", ctx.unit * 0.006, 0.1, 50)) })];
  if (kind === "double") return [shape(rectPath(inset), { ...line, width: n(f.num("width", ctx.unit * 0.008, 0.1, 50)) }), shape(rectPath(inset + band * 0.45), { ...line, width: n(Math.max(ctx.unit * 0.003, 0.25)) })];
  if (kind === "chamfer") {
    // Рамка со срезанными углами в две линии — строгая, «как у дорогого издания».
    const cut = band * 1.4;
    const chamfer = (i: number, c: number) => poly([{ x: i + c, y: i }, { x: w - i - c, y: i }, { x: w - i, y: i + c }, { x: w - i, y: h - i - c }, { x: w - i - c, y: h - i }, { x: i + c, y: h - i }, { x: i, y: h - i - c }, { x: i, y: i + c }]);
    return [shape(chamfer(inset, cut), { ...line, width: n(f.num("width", ctx.unit * 0.006, 0.1, 50)) }), shape(chamfer(inset + band * 0.5, cut * 0.7), { ...line, width: n(Math.max(ctx.unit * 0.0028, 0.2)) })];
  }
  if (kind === "brackets") {
    // Тонкие угловые метки: четыре уголка.
    const len = band * 3.2;
    const k = (x: number, y: number, dx: number, dy: number) => `M${n(x + dx * len)},${n(y)} L${n(x)},${n(y)} L${n(x)},${n(y + dy * len)}`;
    const i = inset;
    return [shape([k(i, i, 1, 1), k(w - i, i, -1, 1), k(w - i, h - i, -1, -1), k(i, h - i, 1, -1)].join(" "), { ...line, width: n(f.num("width", ctx.unit * 0.006, 0.1, 50)), round: false })];
  }
  const lenX = w - 2 * (inset + band);
  const lenY = h - 2 * (inset + band);
  if (lenX < band * 2 || lenY < band * 2) throw new ArtError("border: холст слишком мал для такой рамки — уменьшите size или inset");
  const sides: { len: number; m: Mat }[] = [
    { len: lenX, m: { a: 1, b: 0, c: 0, d: 1, e: inset + band, f: inset } },
    { len: lenX, m: { a: -1, b: 0, c: 0, d: -1, e: w - inset - band, f: h - inset } },
    { len: lenY, m: { a: 0, b: -1, c: 1, d: 0, e: inset, f: h - inset - band } },
    { len: lenY, m: { a: 0, b: 1, c: -1, d: 0, e: w - inset, f: inset + band } },
  ];
  const out: Shape[] = [];
  for (const { len, m } of sides) out.push(...transformAll(patternShapes(kind, { x: 0, y: 0, w: len, h: band }, f.has("pattern") ? f.num("pattern", undefined, 1) : undefined, st), m));
  if (f.o.corners !== false) {
    const rose: string[] = [];
    const ring: string[] = [];
    for (const [cx, cy] of [[inset + band / 2, inset + band / 2], [w - inset - band / 2, inset + band / 2], [inset + band / 2, h - inset - band / 2], [w - inset - band / 2, h - inset - band / 2]]) {
      rose.push(circlePath(cx, cy, band * 0.22));
      ring.push(circlePath(cx, cy, band * 0.42));
    }
    out.push(shape(rose.join(" "), { ...st, stroke: null, fill: st.stroke ?? st.fill ?? "main" }));
    out.push(shape(ring.join(" "), { ...line, width: n(Math.max(band * 0.05, 0.25)) }));
  }
  return out;
}
