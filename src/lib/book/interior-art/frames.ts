/** Рамки парадных полос — в миллиметрах от левого верхнего угла обрезного формата. */
import { n } from "../covers/svg-kit";
import type { FrameKind, InteriorPalette } from "../interiors";
import { DIAMOND } from "../motifs";
import { leaf, OVER, polygon, type Shape } from "./geometry";

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
    case "vintage": {
      // Двойная рамка с розетками на углах — как тиснение на старинном переплёте.
      const shapes: Shape[] = [rect(i, 0.16), rect(i + 1.3, 0.06)];
      const k = i + 0.65;
      const len = Math.min(w, h) * 0.022;
      for (const [x, y] of [[k, k], [w - k, k], [k, h - k], [w - k, h - k]]) {
        shapes.push({ kind: "circle", cx: n(x), cy: n(y), r: n(len * 0.62), fill: "#FFFFFF" });
        for (const a of [45, 135, 225, 315]) shapes.push({ kind: "path", d: leaf(x, y, len, a, 0.42), fill: c });
        shapes.push({ kind: "circle", cx: n(x), cy: n(y), r: n(len * 0.16), fill: c });
      }
      return shapes;
    }
  }
}

/** Уголок в единичном квадрате вершиной в (0,0): линии вдоль краёв с завитками на концах. */
export const CORNER_LINES =
  "M0,0.62 L0,0 L0.62,0 C0.74,0 0.79,0.08 0.73,0.13 C0.68,0.17 0.62,0.12 0.66,0.07 " +
  "M0,0.62 C0,0.74 0.08,0.79 0.13,0.73 C0.17,0.68 0.12,0.62 0.07,0.66";

export const CORNER_INNER = "M0.07,0.4 L0.07,0.07 L0.4,0.07";

/** Каёмка авиапочты сверху и снизу полосы — уходит под обрез. */
export function airmailBands(w: number, h: number): Shape[] {
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
