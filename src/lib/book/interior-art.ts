/**
 * Графика страниц книги: глифы и виньетки, рамки парадных полос и рисунки на начальных полосах глав.
 * Всё описано простыми фигурами (Shape), которые без потерь переводятся и в react-pdf <Svg>, и в
 * HTML <svg>, — поэтому превью на сайте и файл для типографии рисуются одним кодом.
 *
 * Единицы: глифы и виньетки — в пунктах (стоят в строке текста), рамки и рисунки — в миллиметрах
 * от левого верхнего угла обрезного формата; отрицательные координаты и выход за формат — вылеты.
 */
import { n, rng } from "./cover-kit";
import type { FrameKind, GlyphId, InteriorPalette, OpenerArt } from "./interiors";
import { DIAMOND, HEART, RAM, SPARKLE } from "./motifs";

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

type Point = { x: number; y: number };

/**
 * Графика под обрез всегда строится с запасом OVER мм за линией реза — независимо от вылетов
 * конкретного файла. Поэтому звёзды и узоры лежат одинаково в превью, в печати и в читательском PDF.
 */
const OVER = 3;

const polygon = (pts: Point[]) => `M${pts.map((p) => `${n(p.x)},${n(p.y)}`).join(" L")}Z`;

/** Лепесток длиной len от точки (x, y) под углом angle (градусы); повёрнут без transform. */
function leaf(x: number, y: number, len: number, angle: number, width = 0.34) {
  const a = (angle * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const p = (u: number, v: number) => `${n(x + u * cos - v * sin)},${n(y + u * sin + v * cos)}`;
  const r = len;
  return `M${p(0, 0)} C${p(r * 0.35, -r * width)} ${p(r * 0.95, -r * width * 0.8)} ${p(r, 0)} C${p(r * 0.95, r * width * 0.8)} ${p(r * 0.35, r * width)} ${p(0, 0)}Z`;
}

// ─── глифы ──────────────────────────────────────────────────────────────────

/** Глиф высотой size (pt), окрашенный color. */
export function glyphDrawing(id: Exclude<GlyphId, "bar">, size: number, color: string): Drawing {
  switch (id) {
    case "diamond":
      return { w: size, h: size, shapes: [{ kind: "path", d: DIAMOND, fill: color, transform: `scale(${n(size)})` }] };
    case "heart": {
      const w = size / 0.92;
      return { w, h: size, shapes: [{ kind: "path", d: HEART, fill: color, transform: `scale(${n(w)})` }] };
    }
    case "sparkle":
      return { w: size, h: size, shapes: [{ kind: "path", d: SPARKLE, fill: color, transform: `scale(${n(size)})` }] };
    case "dot":
      return { w: size, h: size, shapes: [{ kind: "circle", cx: size / 2, cy: size / 2, r: size / 2, fill: color }] };
    case "ram": {
      // Рог занимает ~0.8 единичного квадрата по высоте (y 0.12–0.9): подрезаем поля.
      const s = size / 0.8;
      return {
        w: s * 0.9,
        h: size,
        shapes: [{ kind: "path", d: RAM, stroke: color, width: n(0.075 / 0.8), round: true, transform: `translate(${n(-s * 0.05)},${n(-s * 0.11)}) scale(${n(s)})` }],
      };
    }
    case "sprig": {
      // Горизонтальная веточка: стебель слева направо, листья попеременно вверх и вниз.
      const h = size;
      const w = size * 3;
      const y = h / 2;
      const shapes: Shape[] = [{ kind: "path", d: `M${n(h * 0.1)},${n(y + h * 0.08)} Q${n(w * 0.5)},${n(y - h * 0.14)} ${n(w - h * 0.55)},${n(y)}`, stroke: color, width: n(h * 0.07), round: true }];
      const len = h * 0.62;
      for (let i = 0; i < 4; i++) {
        const x = h * 0.35 + i * ((w - h * 1.4) / 3);
        const up = i % 2 === 0;
        shapes.push({ kind: "path", d: leaf(x, y - h * 0.02, len * (1 - i * 0.08), up ? -38 : 38), fill: color });
      }
      shapes.push({ kind: "path", d: leaf(w - h * 0.6, y, len * 0.7, -4, 0.38), fill: color });
      return { w, h, shapes };
    }
    case "fan": {
      // Полусолнце ар-деко: лучи от центра основания.
      const h = size;
      const w = size * 2;
      const cx = w / 2;
      const sw = n(size * 0.055);
      const shapes: Shape[] = [];
      for (let k = 0; k <= 12; k++) {
        const a = Math.PI + (k / 12) * Math.PI;
        const r0 = h * 0.34;
        const r1 = k % 2 ? h * 0.78 : h * 0.98;
        shapes.push({ kind: "path", d: `M${n(cx + Math.cos(a) * r0)},${n(h + Math.sin(a) * r0)} L${n(cx + Math.cos(a) * r1)},${n(h + Math.sin(a) * r1)}`, stroke: color, width: sw });
      }
      shapes.push({ kind: "path", d: `M${n(cx - h * 0.24)},${n(h)} A${n(h * 0.24)},${n(h * 0.24)} 0 0 1 ${n(cx + h * 0.24)},${n(h)}Z`, fill: color });
      return { w, h, shapes };
    }
  }
}

/** Высота глифа в виньетке, pt: у ажурных глифов больше, чтобы они не терялись. */
const GLYPH_SIZE: Record<Exclude<GlyphId, "bar">, number> = { diamond: 4.5, heart: 6, sparkle: 8, dot: 3, ram: 11, sprig: 7, fan: 7 };

const RULE = 0.5;
const GAP = 6;

/**
 * Виньетка: линейка — глиф — линейка. rule — длина каждой линейки, pt.
 * У дизайна с глифом «bar» вместо неё — короткая акцентная плашка.
 */
export function vignetteDrawing(glyph: GlyphId, rule: number, colors: Pick<InteriorPalette, "rule" | "ornament">): Drawing {
  if (glyph === "bar") {
    const w = Math.round(rule * 0.7);
    return { w, h: 1.4, shapes: [{ kind: "rect", x: 0, y: 0, w, h: 1.4, fill: colors.ornament }] };
  }
  const g = glyphDrawing(glyph, GLYPH_SIZE[glyph], colors.ornament);
  const h = Math.max(g.h, RULE);
  const w = rule * 2 + GAP * 2 + g.w;
  const ry = (h - RULE) / 2;
  const gx = rule + GAP;
  return {
    w,
    h,
    shapes: [
      { kind: "rect", x: 0, y: ry, w: rule, h: RULE, fill: colors.rule },
      ...g.shapes.map((s) => offset(s, gx, (h - g.h) / 2)),
      { kind: "rect", x: w - rule, y: ry, w: rule, h: RULE, fill: colors.rule },
    ],
  };
}

/** Разделитель ответов без заголовка (кроме текстового «* * *»). */
export function dividerDrawing(glyph: GlyphId, kind: "glyph" | "rule", colors: Pick<InteriorPalette, "rule" | "ornament">): Drawing {
  if (kind === "rule" || glyph === "bar") return { w: 18, h: 0.6, shapes: [{ kind: "rect", x: 0, y: 0, w: 18, h: 0.6, fill: colors.ornament }] };
  return glyphDrawing(glyph, GLYPH_SIZE[glyph] * 0.8, colors.ornament);
}

function offset(s: Shape, dx: number, dy: number): Shape {
  if (!dx && !dy) return s;
  if (s.kind === "circle") return { ...s, cx: s.cx + dx, cy: s.cy + dy };
  if (s.kind === "rect") return { ...s, x: s.x + dx, y: s.y + dy };
  return { ...s, transform: `translate(${n(dx)},${n(dy)})${s.transform ? ` ${s.transform}` : ""}` };
}

// ─── рамки парадных полос ───────────────────────────────────────────────────

export interface PageBox {
  /** Обрезной формат, мм. */
  w: number;
  h: number;
  /** Вылеты, мм: сколько графики видно за линией реза (0 — только обрезной формат). */
  bleed: number;
  /** Отступ рамки от линии реза, мм. */
  inset: number;
}

export function frameShapes(kind: FrameKind, box: PageBox, colors: Pick<InteriorPalette, "ornament">): Shape[] {
  const { w, h, inset: i } = box;
  const c = colors.ornament;
  const rect = (d: number, width: number): Shape => ({ kind: "rect", x: d, y: d, w: w - d * 2, h: h - d * 2, stroke: c, width });
  switch (kind) {
    case "none":
      return [];
    case "double":
      return [rect(i, 0.18), rect(i + 1.5, 0.07)];
    case "deco": {
      // Двойная рамка со ступенчатыми углами, как на обложке «Гэтсби».
      const shapes = [rect(i, 0.18), rect(i + 1.5, 0.07)];
      const k = i + 1.5;
      for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        const x0 = sx > 0 ? k : w - k;
        const y0 = sy > 0 ? k : h - k;
        shapes.push({ kind: "path", d: `M${n(x0)},${n(y0 + sy * 9)} h${n(sx * 3)} v${n(-sy * 3)} h${n(sx * 3)} v${n(-sy * 3)} h${n(sx * 3)}`, stroke: c, width: 0.1 });
      }
      return shapes;
    }
    case "corners": {
      // Уголки: двойная линия по краям с завитками на концах и ромбик у вершины.
      const s = Math.min(w, h) * 0.11;
      return [[1, 1], [-1, 1], [1, -1], [-1, -1]].flatMap(([sx, sy]) => {
        const transform = `translate(${n(sx > 0 ? i : w - i)},${n(sy > 0 ? i : h - i)}) scale(${n(sx * s)},${n(sy * s)})`;
        return [
          { kind: "path" as const, d: CORNER_LINES, stroke: c, width: n(0.18 / s), round: true, transform },
          { kind: "path" as const, d: CORNER_INNER, stroke: c, width: n(0.09 / s), transform },
          { kind: "path" as const, d: DIAMOND, fill: c, transform: `${transform} translate(0.12,0.12) scale(0.1)` },
        ];
      });
    }
    case "airmail":
      return airmailBands(w, h);
  }
}

/** Уголок в единичном квадрате вершиной в (0,0): линии вдоль краёв с завитками на концах. */
const CORNER_LINES =
  "M0,0.62 L0,0 L0.62,0 C0.74,0 0.79,0.08 0.73,0.13 C0.68,0.17 0.62,0.12 0.66,0.07 " +
  "M0,0.62 C0,0.74 0.08,0.79 0.13,0.73 C0.17,0.68 0.12,0.62 0.07,0.66";
const CORNER_INNER = "M0.07,0.4 L0.07,0.07 L0.4,0.07";

/** Каёмка авиапочты сверху и снизу полосы — уходит под обрез. */
function airmailBands(w: number, h: number): Shape[] {
  const depth = 4.5;
  const bleed = OVER;
  const span = depth + bleed;
  const stripe = 3.5;
  const period = 12;
  const shapes: Shape[] = [];
  for (let x = -bleed - span; x < w + bleed + span; x += period) {
    for (const [dx, fill] of [[0, "#B7323F"], [period / 2, "#2F5D8C"]] as const) {
      const a = x + dx;
      shapes.push({
        kind: "path",
        fill,
        d: polygon([{ x: a, y: -bleed }, { x: a + stripe, y: -bleed }, { x: a + stripe - span, y: depth }, { x: a - span, y: depth }]),
      });
      shapes.push({
        kind: "path",
        fill,
        d: polygon([{ x: a, y: h + bleed }, { x: a + stripe, y: h + bleed }, { x: a + stripe - span, y: h - depth }, { x: a - span, y: h - depth }]),
      });
    }
  }
  return shapes;
}

// ─── рисунки начальных полос ────────────────────────────────────────────────

export interface ArtContext {
  /** Обрезной формат, мм. */
  w: number;
  h: number;
  /** Где начинается блок с номером и названием главы, мм от верхнего обреза. */
  flowTop: number;
  /** Масштаб рисунка: высота полосы набора относительно A5. */
  k: number;
  palette: InteriorPalette;
  /** Номер главы — у каждой главы свой узор, одинаковый в превью и в печати. */
  seed: number;
}

export function openerArtShapes(art: OpenerArt, ctx: ArtContext): Shape[] {
  switch (art) {
    case "stars":
      return starsArt(ctx);
    case "oyu":
      return oyuArt(ctx);
    case "herbarium":
      return herbariumArt(ctx);
    case "sunburst":
      return sunburstArt(ctx);
    case "watercolor":
      return watercolorArt(ctx);
  }
}

function starsArt({ w, h, palette, seed, k }: ArtContext): Shape[] {
  const rand = rng(1000 + seed * 7919);
  const shapes: Shape[] = [];
  const bleed = OVER;
  const W = w + bleed * 2;
  const H = h + bleed * 2;
  const count = Math.round((W * H) / 120);
  for (let i = 0; i < count; i++) {
    shapes.push({ kind: "circle", cx: n(rand() * W - bleed), cy: n(rand() * H - bleed), r: n(0.1 + Math.pow(rand(), 4) * 0.45), fill: palette.ink, opacity: n(0.2 + rand() * 0.6) });
  }
  // Созвездие в верхней части полосы: пять звёзд, соединённых тонкой линией.
  const pts: Point[] = Array.from({ length: 5 }, (_, i) => ({
    x: w * (0.2 + i * 0.15 + (rand() - 0.5) * 0.08),
    y: h * (0.08 + rand() * 0.12),
  }));
  shapes.push({ kind: "path", d: `M${pts.map((p) => `${n(p.x)},${n(p.y)}`).join(" L")}`, stroke: palette.ornament, width: 0.12, opacity: 0.6 });
  pts.forEach((p, i) => {
    const s = (i % 2 ? 2.4 : 3.6) * k;
    shapes.push({ kind: "path", d: SPARKLE, fill: palette.ornament, transform: `translate(${n(p.x - s / 2)},${n(p.y - s / 2)}) scale(${n(s)})` });
  });
  return shapes;
}

/** Розетка из четырёх рогов, обращённых наружу, с ромбом в центре. */
function rosette(x: number, y: number, s: number, color: string, width: number): Shape[] {
  const shapes: Shape[] = [0, 90, 180, 270].map((rot) => ({
    kind: "path" as const,
    d: RAM,
    stroke: color,
    width: n(width / s),
    round: true,
    transform: `translate(${n(x)},${n(y)}) rotate(${rot}) scale(${n(s)}) translate(-0.5,-0.95)`,
  }));
  const d = s * 0.09;
  shapes.push({ kind: "path", d: polygon([{ x, y: y - d }, { x: x + d, y }, { x, y: y + d }, { x: x - d, y }]), fill: color });
  return shapes;
}

function oyuArt({ w, h, palette, flowTop, k }: ArtContext): Shape[] {
  const shapes: Shape[] = [];
  const bleed = OVER;
  const cy = flowTop - 30 * k;
  const R = 24 * k;
  // Тихий фоновый узор по всей полосе — кроме медальона и места под текстом, чтобы не мешал читать.
  const clear = (x: number, y: number) =>
    Math.hypot(x - w / 2, y - cy) < R + 8 || (x > w * 0.08 && x < w * 0.92 && y > flowTop - 8 && y < flowTop + 66 * k);
  const step = 22;
  let row = 0;
  for (let y = -bleed - step / 2; y < h + bleed + step; y += step * 0.9, row++)
    for (let x = (row % 2 ? step / 2 : 0) - bleed - step / 2; x < w + bleed + step; x += step)
      if (!clear(x, y))
        shapes.push({ kind: "path", d: RAM, stroke: palette.rule, width: n(0.4 / 11), opacity: 0.45, round: true, transform: `translate(${n(x)},${n(y)}) rotate(${row % 2 ? 180 : 0}) scale(11) translate(-0.5,-0.5)` });
  // Медальон над названием главы
  shapes.push({ kind: "path", d: circlePath(w / 2, cy, R), stroke: palette.ornament, width: 0.3 });
  shapes.push({ kind: "path", d: circlePath(w / 2, cy, R - 1.4 * k), stroke: palette.ornament, width: 0.12 });
  shapes.push(...rosette(w / 2, cy, 19 * k, palette.ornament, 0.55));
  return shapes;
}

function circlePath(cx: number, cy: number, r: number) {
  return `M${n(cx - r)},${n(cy)} A${n(r)},${n(r)} 0 1 0 ${n(cx + r)},${n(cy)} A${n(r)},${n(r)} 0 1 0 ${n(cx - r)},${n(cy)}Z`;
}

/** Засушенная веточка над названием главы — как на обложке «Гербарий». */
function herbariumArt({ w, flowTop, seed, k }: ArtContext): Shape[] {
  const rand = rng(300 + seed * 131);
  const stroke = "#5E6A45";
  const height = 36 * k;
  const base = { x: w / 2 - 2 * k, y: flowTop - 7 * k };
  const lean = (rand() - 0.5) * 10 * k;
  const top = { x: base.x + lean, y: base.y - height };
  const cx = base.x + lean * 0.2 + height * 0.08;
  const cy = base.y - height * 0.5;
  const shapes: Shape[] = [{ kind: "path", d: `M${n(base.x)},${n(base.y)} Q${n(cx)},${n(cy)} ${n(top.x)},${n(top.y)}`, stroke, width: 0.4, round: true }];
  const leaves = 9;
  for (let i = 1; i <= leaves; i++) {
    const t = i / (leaves + 1);
    const px = (1 - t) * (1 - t) * base.x + 2 * (1 - t) * t * cx + t * t * top.x;
    const py = (1 - t) * (1 - t) * base.y + 2 * (1 - t) * t * cy + t * t * top.y;
    const side = i % 2 ? 1 : -1;
    const len = height * (0.24 - t * 0.1) * (0.85 + rand() * 0.3);
    const ang = -90 + side * (44 + rand() * 14);
    shapes.push({ kind: "path", d: leaf(px, py, len, ang), fill: rand() > 0.5 ? "#9CA67E" : "#B4B98F", opacity: 0.9 });
    shapes.push({ kind: "path", d: leaf(px, py, len, ang), stroke, width: 0.18 });
  }
  // Мелкие цветки у верхушки
  for (let f = 0; f < 3; f++) {
    const fx = top.x + (rand() - 0.5) * height * 0.22;
    const fy = top.y + f * height * 0.08 + rand() * 1.5;
    const r = height * 0.04;
    for (let p = 0; p < 5; p++) {
      const a = (p / 5) * Math.PI * 2;
      shapes.push({ kind: "circle", cx: n(fx + Math.cos(a) * r), cy: n(fy + Math.sin(a) * r), r: n(r * 0.75), fill: "#D9A3A0" });
    }
    shapes.push({ kind: "circle", cx: n(fx), cy: n(fy), r: n(r * 0.5), fill: "#C4845F" });
  }
  return shapes;
}

/** Полусолнце ар-деко над номером главы и шевроны у нижнего края. */
function sunburstArt({ w, h, palette, flowTop, k }: ArtContext): Shape[] {
  const c = palette.ornament;
  const cx = w / 2;
  const cy = flowTop - 9 * k;
  const R = 30 * k;
  const shapes: Shape[] = [];
  for (let i = 0; i <= 18; i++) {
    const a = Math.PI + (i / 18) * Math.PI;
    shapes.push({ kind: "path", d: `M${n(cx + Math.cos(a) * R * 0.3)},${n(cy + Math.sin(a) * R * 0.3)} L${n(cx + Math.cos(a) * R)},${n(cy + Math.sin(a) * R)}`, stroke: c, width: i % 2 ? 0.1 : 0.22 });
  }
  for (const r of [R, R * 0.3, R * 0.22]) shapes.push({ kind: "path", d: `M${n(cx - r)},${n(cy)} A${n(r)},${n(r)} 0 0 1 ${n(cx + r)},${n(cy)}`, stroke: c, width: 0.22 });
  shapes.push({ kind: "path", d: `M${n(cx - R * 1.12)},${n(cy)} L${n(cx + R * 1.12)},${n(cy)}`, stroke: c, width: 0.22 });
  for (let i = 0; i < 3; i++) {
    const y = h * 0.84 + i * 2.2;
    shapes.push({ kind: "path", d: `M${n(cx - 8 + i * 2)},${n(y)} L${n(cx)},${n(y + 3)} L${n(cx + 8 - i * 2)},${n(y)}`, stroke: c, width: 0.18 });
  }
  return shapes;
}

/**
 * Акварельные пятна: каждое — несколько «капель», а капля — стопка концентрических кругов с малой
 * непрозрачностью, поэтому края растушёваны, а к центру краска плотнее. Пятна уходят под обрез.
 */
function watercolorArt({ w, h, seed, k }: ArtContext): Shape[] {
  const rand = rng(500 + seed * 977);
  const drop = (cx: number, cy: number, r: number, fill: string): Shape[] =>
    Array.from({ length: 7 }, (_, i) => ({ kind: "circle" as const, cx: n(cx), cy: n(cy), r: n(r * (1 - i * 0.12)), fill, opacity: 0.07 }));
  const blob = (cx: number, cy: number, R: number, colors: string[]) => {
    const out: Shape[] = [];
    for (let i = 0; i < 6; i++) {
      const a = rand() * Math.PI * 2;
      const d = rand() * R * 0.5;
      out.push(...drop(cx + Math.cos(a) * d, cy + Math.sin(a) * d, R * (0.4 + rand() * 0.35), colors[i % colors.length]));
    }
    // Брызги вокруг пятна
    for (let i = 0; i < 7; i++) {
      const a = rand() * Math.PI * 2;
      const d = R * (0.85 + rand() * 0.5);
      out.push({ kind: "circle", cx: n(cx + Math.cos(a) * d), cy: n(cy + Math.sin(a) * d), r: n(0.3 + rand() * 1.1), fill: colors[0], opacity: n(0.3 + rand() * 0.25) });
    }
    return out;
  };
  const flip = seed % 2 === 0;
  return [
    ...blob(flip ? w * 0.1 : w * 0.9, h * 0.07, 44 * k, ["#F2B39C", "#F6C7B0", "#EE9C8B"]),
    ...blob(flip ? w * 0.92 : w * 0.08, h * 0.95, 40 * k, ["#C3ABD6", "#D5C0E4", "#B293C8"]),
  ];
}
