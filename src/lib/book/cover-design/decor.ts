/**
 * Библиотека декора для обложек: орнаменты, виньетки, звёзды, венки, казахские мотивы. Каждый мотив — рисунок из
 * простых фигур (interior-art Shape) в своей системе координат; слой вписывает его в рамку с сохранением пропорций.
 * Одни и те же фигуры рисуют редактор (HTML <svg>) и PDF (react-pdf <Svg>).
 */
import { n } from "../covers/svg-kit";
import { glyphDrawing, vignetteDrawing, type Drawing, type Shape } from "../interior-art";
import { circlePath, leaf } from "../interior-art/geometry";
import { FLEURON, HEART, SPARKLE } from "../motifs";
import type { DecorId } from "./types";

export const DECOR_IDS: DecorId[] = [
  "vignette",
  "flourish",
  "laurel",
  "botanical",
  "sprig",
  "fleuron",
  "hedera",
  "heart",
  "hearts",
  "rings",
  "sparkle",
  "star",
  "stars",
  "crescent",
  "sunburst",
  "diamond",
  "dots",
  "wave",
  "peaks",
  "ram",
  "shanyrak",
  "confetti",
];

/** Пятилучевая звезда в квадрате size с центром (cx, cy). */
function starPath(cx: number, cy: number, r: number) {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.42 : r;
    pts.push(`${n(cx + Math.cos(a) * rr)},${n(cy + Math.sin(a) * rr)}`);
  }
  return `M${pts.join(" L")}Z`;
}

/** Ветвь с листьями вдоль дуги от угла a0 до a1 (радианы) окружности (cx, cy, R): лавровый венок — две такие ветви. */
function laurelBranch(cx: number, cy: number, R: number, a0: number, a1: number, color: string, side: 1 | -1): Shape[] {
  const shapes: Shape[] = [];
  const steps = 7;
  const p = (a: number) => ({ x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R });
  const s = p(a0);
  const e = p(a1);
  shapes.push({ kind: "path", d: `M${n(s.x)},${n(s.y)} A${n(R)},${n(R)} 0 0 ${a1 > a0 ? 1 : 0} ${n(e.x)},${n(e.y)}`, stroke: color, width: n(R * 0.035), round: true });
  for (let i = 1; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / (steps + 0.6);
    const at = p(a);
    const tangent = (a * 180) / Math.PI + (a1 > a0 ? 90 : -90);
    const len = R * (0.26 - i * 0.012);
    shapes.push({ kind: "path", d: leaf(at.x, at.y, len, tangent - 38 * side, 0.36), fill: color });
    shapes.push({ kind: "path", d: leaf(at.x, at.y, len * 0.9, tangent + 38 * side, 0.36), fill: color });
  }
  return shapes;
}

/** Рисунок мотива цвета color. */
export function decorDrawing(id: DecorId, color: string): Drawing {
  switch (id) {
    case "heart":
      return glyphDrawing("heart", 100, color);
    case "hearts":
      return {
        w: 220,
        h: 100,
        shapes: [
          { kind: "path", d: HEART, fill: color, transform: `translate(60,6) scale(100)` },
          { kind: "path", d: HEART, fill: color, opacity: 0.55, transform: `translate(0,46) scale(46)` },
          { kind: "path", d: HEART, fill: color, opacity: 0.55, transform: `translate(174,46) scale(46)` },
        ],
      };
    case "sparkle":
      return glyphDrawing("sparkle", 100, color);
    case "star":
      return { w: 100, h: 100, shapes: [{ kind: "path", d: starPath(50, 53, 50), fill: color }] };
    case "stars":
      return {
        w: 200,
        h: 120,
        shapes: [
          { kind: "path", d: SPARKLE, fill: color, transform: "translate(70,20) scale(64)" },
          { kind: "path", d: SPARKLE, fill: color, opacity: 0.7, transform: "translate(10,62) scale(30)" },
          { kind: "path", d: SPARKLE, fill: color, opacity: 0.8, transform: "translate(150,8) scale(36)" },
          { kind: "path", d: SPARKLE, fill: color, opacity: 0.5, transform: "translate(160,86) scale(22)" },
          { kind: "circle", cx: 40, cy: 18, r: 3, fill: color },
          { kind: "circle", cx: 128, cy: 104, r: 2.4, fill: color },
        ],
      };
    case "diamond":
      return glyphDrawing("diamond", 100, color);
    case "ram":
      return glyphDrawing("ram", 100, color);
    case "fleuron":
      return { w: 100, h: 100, shapes: [{ kind: "path", d: FLEURON, fill: color, transform: "scale(100)" }] };
    case "sprig":
      return glyphDrawing("sprig", 60, color);
    case "hedera":
      return glyphDrawing("hedera", 100, color);
    case "wave":
      return glyphDrawing("wave", 60, color);
    case "sunburst":
      return glyphDrawing("fan", 100, color);
    case "shanyrak":
      return glyphDrawing("shanyrak", 100, color);
    case "confetti":
      return glyphDrawing("confetti", 60, color);
    case "peaks":
      return glyphDrawing("peak", 100, color);
    case "dots":
      return { w: 120, h: 24, shapes: [0, 1, 2].map((i) => ({ kind: "circle" as const, cx: 12 + i * 48, cy: 12, r: 9, fill: color })) };
    case "vignette":
      return vignetteDrawing("diamond", 60, { rule: color, ornament: color });
    case "crescent":
      // Внешняя дуга — окружность r = 46 через левый край, внутренняя — дуга окружности с центром правее: серп.
      return { w: 100, h: 100, shapes: [{ kind: "path", d: "M62,6 A46,46 0 1 0 62,94 A52.2,52.2 0 0 1 62,6Z", fill: color }] };
    case "rings":
      return {
        w: 160,
        h: 100,
        shapes: [
          { kind: "path", d: circlePath(56, 52, 40), stroke: color, width: 7 },
          { kind: "path", d: circlePath(104, 52, 40), stroke: color, width: 7 },
          { kind: "path", d: SPARKLE, fill: color, transform: "translate(68,0) scale(24)" },
        ],
      };
    case "laurel":
      // Венок открыт сверху: две ветви снизу вверх по обе стороны.
      return { w: 200, h: 200, shapes: [...laurelBranch(100, 100, 86, Math.PI * 0.62, Math.PI * 1.42, color, 1), ...laurelBranch(100, 100, 86, Math.PI * 0.38, -Math.PI * 0.42, color, -1)] };
    case "flourish": {
      // Росчерк-разделитель: симметричные завитки от центра с ромбом посередине.
      const half = (k: 1 | -1) =>
        `M${100 + k * 8},20 C${100 + k * 40},4 ${100 + k * 60},36 ${100 + k * 92},20 C${100 + k * 70},14 ${100 + k * 58},30 ${100 + k * 74},30 C${100 + k * 84},30 ${100 + k * 84},20 ${100 + k * 76},18`;
      return {
        w: 200,
        h: 40,
        shapes: [
          { kind: "path", d: half(1), stroke: color, width: 2.4, round: true },
          { kind: "path", d: half(-1), stroke: color, width: 2.4, round: true },
          { kind: "path", d: "M100,12 L108,20 L100,28 L92,20Z", fill: color },
        ],
      };
    }
    case "botanical": {
      // Ветка с листьями снизу вверх, слегка изогнутая: для угла обложки или рядом с названием.
      const shapes: Shape[] = [{ kind: "path", d: "M50,196 C46,150 54,100 50,10", stroke: color, width: 2.4, round: true }];
      for (let i = 0; i < 8; i++) {
        const y = 176 - i * 21;
        const len = 34 - i * 2.4;
        shapes.push({ kind: "path", d: leaf(50, y, len, i % 2 ? -150 : -30, 0.34), fill: color });
      }
      shapes.push({ kind: "path", d: leaf(50, 14, 18, -90, 0.36), fill: color });
      return { w: 100, h: 200, shapes };
    }
  }
}
