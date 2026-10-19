/** Рисунки на начальных полосах глав — в миллиметрах; отрицательные координаты и выход за формат — вылеты. */
import { n, rng } from "../covers/svg-kit";
import type { InteriorPalette, OpenerArt } from "../interiors";
import { RAM, SPARKLE } from "../motifs";
import { circlePath, leaf, lerp, OVER, place, polygon, shanyrakMotif, wavePath, type Point, type Shape } from "./geometry";

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
    case "shanyrak":
      return shanyrakMotif(ctx.w / 2, ctx.flowTop - 36 * ctx.k, 19 * ctx.k, { ring: ctx.palette.ornament, cross: ctx.palette.accent }, 0.7, 36);
    case "mountains":
      return mountainsArt(ctx);
    case "waves":
      return wavesArt(ctx);
    case "tape":
      return tapeArt(ctx);
    case "confetti":
      return confettiArt(ctx);
  }
}

export function starsArt({ w, h, palette, seed, k }: ArtContext): Shape[] {
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
export function rosette(x: number, y: number, s: number, color: string, width: number): Shape[] {
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

export function oyuArt({ w, h, palette, flowTop, k }: ArtContext): Shape[] {
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

/** Засушенная веточка над названием главы — как на обложке «Гербарий». */
export function herbariumArt({ w, flowTop, seed, k }: ArtContext): Shape[] {
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
export function sunburstArt({ w, h, palette, flowTop, k }: ArtContext): Shape[] {
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
export function watercolorArt({ w, h, seed, k }: ArtContext): Shape[] {
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

/** Хребты Алатау: три слоя гор от светлого к тёмному, снежные шапки на дальнем, солнце за ними. */
export function mountainsArt({ w, h, seed, k }: ArtContext): Shape[] {
  const rand = rng(700 + seed * 389);
  const shapes: Shape[] = [{ kind: "circle", cx: n(w * 0.7), cy: n(h * 0.62), r: n(12 * k), fill: "#F6D2B6", opacity: 0.9 }];
  const layers = [
    { top: h * 0.6, depth: h * 0.1, step: 15, fill: "#D9C9DE", caps: true },
    { top: h * 0.7, depth: h * 0.08, step: 11, fill: "#B49CC2", caps: false },
    { top: h * 0.82, depth: h * 0.07, step: 9, fill: "#6F5A82", caps: false },
  ];
  for (const layer of layers) {
    const pts: Point[] = [];
    let up = rand() > 0.5;
    for (let x = -OVER - layer.step; x < w + OVER + layer.step; x += layer.step * (0.7 + rand() * 0.6), up = !up)
      pts.push({ x, y: up ? layer.top + rand() * layer.depth * 0.35 : layer.top + layer.depth * (0.55 + rand() * 0.45) });
    const last = pts[pts.length - 1];
    shapes.push({ kind: "path", d: polygon([...pts, { x: last.x, y: h + OVER }, { x: pts[0].x, y: h + OVER }]), fill: layer.fill });
    if (!layer.caps) continue;
    for (let i = 1; i < pts.length - 1; i++) {
      const [prev, p, next] = [pts[i - 1], pts[i], pts[i + 1]];
      if (p.y >= prev.y || p.y >= next.y) continue;
      const a = lerp(p, prev, 0.3);
      const b = lerp(p, next, 0.3);
      const c1 = lerp(b, a, 0.33);
      const c2 = lerp(b, a, 0.66);
      shapes.push({ kind: "path", d: polygon([p, b, { x: c1.x, y: c1.y - (c1.y - p.y) * 0.3 }, c2, a]), fill: "#FFFFFF", opacity: 0.95 });
    }
  }
  return shapes;
}

/** Море: слои волн у нижнего края, тонкая рябь над ними и чайки вверху. */
export function wavesArt({ w, h, seed, k, palette }: ArtContext): Shape[] {
  const rand = rng(900 + seed * 211);
  const shapes: Shape[] = [];
  for (let i = 0; i < 3; i++) {
    const x = w * (0.62 + i * 0.09 + (rand() - 0.5) * 0.04);
    const y = h * (0.1 + rand() * 0.06);
    const g = (1.6 + rand() * 0.8) * k;
    shapes.push({
      kind: "path",
      d: `M${n(x - g)},${n(y)} C${n(x - g * 0.6)},${n(y - g * 0.55)} ${n(x - g * 0.25)},${n(y - g * 0.55)} ${n(x)},${n(y)} C${n(x + g * 0.25)},${n(y - g * 0.55)} ${n(x + g * 0.6)},${n(y - g * 0.55)} ${n(x + g)},${n(y)}`,
      stroke: palette.muted,
      width: 0.22,
      round: true,
    });
  }
  for (const y of [h * 0.66, h * 0.685]) shapes.push({ kind: "path", d: wavePath(-OVER, w + OVER, y, 0.8 * k, (30 + rand() * 10) * k, rand()).d, stroke: palette.ornament, width: 0.2, opacity: 0.5, round: true });
  ["#DCEDF2", "#A9CFDA", "#6AA8BD", "#2F6F8A"].forEach((fill, i) => {
    const wave = wavePath(-OVER, w + OVER, h * (0.72 + i * 0.06), (2 + i * 0.5) * k, (40 - i * 4) * k, rand());
    shapes.push({ kind: "path", d: `${wave.d} L${n(wave.end)},${n(h + OVER)} L${n(-OVER - 40 * k)},${n(h + OVER)}Z`, fill });
  });
  return shapes;
}

/** Альбом: полоски цветного скотча с рваными краями на углах страницы. */
export function tapeArt({ w, h, seed, k }: ArtContext): Shape[] {
  const rand = rng(1100 + seed * 53);
  const tape = (cx: number, cy: number, len: number, width: number, angle: number, fill: string): Shape[] => {
    const edge = (x: number, dir: 1 | -1) => Array.from({ length: 6 }, (_, i) => ({ x: x + (i % 2 ? dir * 0.7 * k : 0), y: -width / 2 + (i * width) / 5 }));
    const outline = [...edge(-len / 2, 1), ...edge(len / 2, -1).reverse()];
    const out: Shape[] = [{ kind: "path", d: polygon(place(outline, cx, cy, angle)), fill, opacity: 0.85 }];
    // Узор скотча: светлые косые полоски.
    for (let x = -len / 2 + 4 * k; x < len / 2 - 3 * k; x += 4 * k)
      out.push({ kind: "path", d: polygon(place([{ x, y: -width / 2 }, { x: x + 1.2 * k, y: -width / 2 }, { x: x + 1.2 * k - width * 0.4, y: width / 2 }, { x: x - width * 0.4, y: width / 2 }], cx, cy, angle)), fill: "#FFFFFF", opacity: 0.28 });
    return out;
  };
  const tilt = (rand() - 0.5) * 8;
  return [...tape(w * 0.15, h * 0.055, 40 * k, 10 * k, -35 + tilt, "#EBC66F"), ...tape(w * 0.86, h * 0.07, 36 * k, 9.5 * k, 28 - tilt, "#9CCBC4")];
}

/** Конфетти сверху и снизу начальной полосы; место под номером и названием главы свободно. */
export function confettiArt({ w, h, seed, k, flowTop }: ArtContext): Shape[] {
  const rand = rng(1300 + seed * 71);
  const colors = ["#D9466E", "#F2A93B", "#3BA7A0", "#6C63D9", "#F6D04D"];
  const shapes: Shape[] = [];
  for (const [y0, y1] of [[-OVER, flowTop - 16 * k], [h * 0.8, h + OVER]]) {
    const count = Math.round(((w + OVER * 2) * (y1 - y0)) / 150);
    for (let i = 0; i < count; i++) {
      const x = rand() * (w + OVER * 2) - OVER;
      const y = y0 + rand() * (y1 - y0);
      const fill = colors[Math.floor(rand() * colors.length)];
      const kind = rand();
      const angle = rand() * 360;
      if (kind < 0.4) shapes.push({ kind: "circle", cx: n(x), cy: n(y), r: n((0.6 + rand()) * k), fill });
      else if (kind < 0.65) {
        const r = (1.2 + rand() * 0.9) * k;
        shapes.push({ kind: "path", d: polygon(place([0, 120, 240].map((a) => ({ x: Math.cos((a * Math.PI) / 180) * r, y: Math.sin((a * Math.PI) / 180) * r })), x, y, angle)), fill });
      } else if (kind < 0.85) {
        const l = (2.4 + rand() * 1.6) * k;
        shapes.push({ kind: "path", d: polygon(place([{ x: -l, y: -0.5 * k }, { x: l, y: -0.5 * k }, { x: l, y: 0.5 * k }, { x: -l, y: 0.5 * k }], x, y, angle)), fill });
      } else {
        const squiggle = wavePath(x - 3 * k, x + 3 * k, y, 0.7 * k, 3 * k, 0).d;
        shapes.push({ kind: "path", d: squiggle, stroke: fill, width: n(0.45 * k), round: true, transform: `rotate(${n(angle)} ${n(x)} ${n(y)})` });
      }
    }
  }
  return shapes;
}
