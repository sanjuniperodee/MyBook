/** Глифы, виньетки и разделители — в пунктах: стоят в строке текста. */
import { n } from "../covers/svg-kit";
import type { GlyphId, InteriorPalette } from "../interiors";
import { DIAMOND, HEART, RAM, SPARKLE } from "../motifs";
import { leaf, lerp, offset, place, polygon, shanyrakMotif, wavePath, type Drawing, type Shape } from "./geometry";

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
    case "shanyrak":
      // Лучи выходят за кольцо на 0.42R: R подобран так, чтобы весь мотив вписался в size.
      return { w: size, h: size, shapes: shanyrakMotif(size / 2, size / 2, size * 0.35, { ring: color, cross: color }, size * 0.07, 12) };
    case "peak": {
      // Две вершины, на большой — снежная шапка.
      const h = size;
      const w = size * 1.7;
      const top = { x: w * 0.62, y: 0 };
      const left = { x: w * 0.42, y: h * 0.6 };
      const right = { x: w, y: h };
      const a = lerp(top, left, 0.33);
      const b = lerp(top, right, 0.2);
      return {
        w,
        h,
        shapes: [
          { kind: "path", d: polygon([{ x: 0, y: h }, { x: w * 0.3, y: h * 0.42 }, left, top, right]), fill: color },
          { kind: "path", d: polygon([top, b, { x: w * 0.65, y: h * 0.15 }, { x: w * 0.62, y: h * 0.24 }, { x: w * 0.59, y: h * 0.15 }, a]), fill: "#FFFFFF" },
        ],
      };
    }
    case "wave": {
      const h = size;
      const w = size * 2.6;
      const line = (y: number): Shape => ({ kind: "path", d: wavePath(size * 0.05, w - w / 4, y, h * 0.2, w / 2, 0).d, stroke: color, width: n(size * 0.11), round: true });
      return { w, h, shapes: [line(h * 0.3), line(h * 0.75)] };
    }
    case "hedera": {
      // Альдинов лист ❧: лист-сердечко остриём вправо и завиток черенка.
      const s = size / 0.74;
      const transform = `translate(${n(-s * 0.05)},0) scale(${n(s)})`;
      return {
        w: s * 0.95,
        h: size,
        shapes: [
          { kind: "path", d: "M0.40,0.35 C0.34,0.12 0.48,0.00 0.60,0.06 C0.72,0.12 0.90,0.24 1.00,0.35 C0.90,0.46 0.72,0.58 0.60,0.64 C0.48,0.70 0.34,0.58 0.40,0.35Z", fill: color, transform },
          { kind: "path", d: "M0.40,0.35 C0.25,0.35 0.12,0.42 0.08,0.55 C0.05,0.66 0.14,0.74 0.22,0.68", stroke: color, width: 0.05, round: true, transform },
        ],
      };
    }
    case "scribble": {
      // Росчерк ручкой: линия с петлёй посередине.
      const s = size / 0.62;
      return {
        w: s * 2.4,
        h: size,
        shapes: [
          {
            kind: "path",
            d: "M0.05,0.6 C0.45,0.62 0.75,0.6 1.0,0.5 C1.25,0.4 1.35,0.08 1.15,0.08 C0.95,0.08 1.0,0.55 1.3,0.62 C1.6,0.68 1.95,0.6 2.35,0.45",
            stroke: color,
            width: 0.08,
            round: true,
            transform: `translate(0,${n(-s * 0.05)}) scale(${n(s)})`,
          },
        ],
      };
    }
    case "confetti": {
      // Три конфетти — свои цвета, независимо от палитры.
      const h = size;
      const w = size * 2.4;
      return {
        w,
        h,
        shapes: [
          { kind: "circle", cx: n(h * 0.35), cy: n(h * 0.55), r: n(h * 0.27), fill: "#D9466E" },
          { kind: "path", d: polygon([{ x: h * 1.0, y: h * 0.88 }, { x: h * 1.25, y: h * 0.18 }, { x: h * 1.5, y: h * 0.88 }]), fill: "#F2A93B" },
          { kind: "path", d: polygon(place([{ x: -1, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 1 }, { x: -1, y: 1 }].map((p) => ({ x: p.x * h * 0.22, y: p.y * h * 0.22 })), h * 2.02, h * 0.53, 20)), fill: "#3BA7A0" },
        ],
      };
    }
  }
}

/** Высота глифа в виньетке, pt: у ажурных глифов больше, чтобы они не терялись. */
export const GLYPH_SIZE: Record<Exclude<GlyphId, "bar">, number> = {
  diamond: 4.5,
  heart: 6,
  sparkle: 8,
  dot: 3,
  ram: 11,
  sprig: 7,
  fan: 7,
  shanyrak: 11,
  peak: 7,
  wave: 7,
  hedera: 7.5,
  scribble: 7,
  confetti: 5.5,
};

export const RULE = 0.5;

export const GAP = 6;

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
