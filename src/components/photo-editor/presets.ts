/**
 * Готовые стили надписей и новые слои редактора фото. Стили подобраны под книги воспоминаний: подпись и дата,
 * заголовок, «от руки», надпись на плашке, «дата фотоаппарата» 90-х, яркая надпись с обводкой.
 */
import { fontWeights, type FontKey } from "@/lib/book/fonts";
import { layerId, type DrawLayer, type ShapeLayer, type TextLayer } from "@/lib/photo-edit/doc";
import { SHAPES, type ShapeId } from "@/lib/photo-edit/shapes";

export const TEXT_PRESETS = ["caption", "title", "script", "label", "date", "outline", "neon", "classic"] as const;
export type TextPreset = (typeof TEXT_PRESETS)[number];

type TextStyle = Omit<TextLayer, "id" | "type" | "text" | "x" | "y" | "rotation">;

const base: TextStyle = {
  font: "onest",
  weight: 600,
  italic: false,
  color: "#FFFFFF",
  align: "center",
  lineHeight: 1.15,
  spacing: 0,
  background: null,
  backgroundOpacity: 0.9,
  stroke: null,
  strokeWidth: 0.08,
  shadow: "soft",
  scale: 0.8,
  opacity: 1,
};

export const PRESET_STYLES: Record<TextPreset, TextStyle & { y?: number; x?: number }> = {
  caption: { ...base, scale: 0.75 },
  title: { ...base, font: "playfair", weight: 600, scale: 1.25, y: 0.3 },
  script: { ...base, font: "caveat", weight: 500, scale: 1.25 },
  label: {
    ...base,
    weight: 500,
    color: "#1E1916",
    background: "#FFFFFF",
    backgroundOpacity: 0.92,
    shadow: "none",
    scale: 0.6,
    y: 0.85,
  },
  date: {
    ...base,
    font: "oswald",
    weight: 400,
    color: "#FF8A1F",
    shadow: "glow",
    spacing: 0.08,
    scale: 0.55,
    x: 0.8,
    y: 0.9,
  },
  outline: {
    ...base,
    font: "montserrat",
    weight: 600,
    stroke: "#111111",
    strokeWidth: 0.1,
    shadow: "none",
    scale: 1.2,
  },
  neon: {
    ...base,
    font: "pacifico",
    weight: 400,
    color: "#FF9AD5",
    shadow: "glow",
    scale: 1,
  },
  classic: {
    ...base,
    font: "cormorant",
    weight: 500,
    italic: true,
    scale: 1.1,
  },
};

/** Насыщенность, которая у шрифта есть: ближайшая к желаемой. */
export function nearestWeight(font: FontKey, want: number) {
  const { weights } = fontWeights(font);
  return weights.reduce((best, w) => (Math.abs(w - want) < Math.abs(best - want) ? w : best), weights[0] ?? 400);
}

export function newText(preset: TextPreset, text: string, at?: { x: number; y: number }): TextLayer {
  const { x, y, ...style } = PRESET_STYLES[preset];
  return {
    id: layerId(),
    type: "text",
    text,
    ...style,
    x: at?.x ?? x ?? 0.5,
    y: at?.y ?? y ?? 0.5,
    rotation: 0,
  };
}

/** Цвет новой фигуры: сердце — красное, звезда — золотая, остальное — белое. */
const SHAPE_COLORS: Partial<Record<ShapeId, string>> = {
  heart: "#E5484D",
  star: "#FFD43B",
  sparkle: "#FFD43B",
  sun: "#FFD43B",
  crown: "#FFD43B",
  flower: "#F783AC",
};

export function newShape(shape: ShapeId, at?: { x: number; y: number }): ShapeLayer {
  const color = SHAPE_COLORS[shape] ?? "#FFFFFF";
  const line = SHAPES[shape].kind === "line";
  return {
    id: layerId(),
    type: "shape",
    shape,
    fill: line ? null : color,
    stroke: line ? color : null,
    strokeWidth: line ? 0.022 : 0.012,
    x: at?.x ?? 0.5,
    y: at?.y ?? 0.5,
    rotation: 0,
    scale: line ? 1.4 : 1,
    opacity: 1,
  };
}

/** Новая линия рисунка из точек в долях короткой стороны (абсолютных): слой встаёт в центр её рамки. */
export function newStroke(abs: number[], style: { color: string; width: number; brush: DrawLayer["brush"] }, W: number, H: number): DrawLayer {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < abs.length; i += 2) {
    x0 = Math.min(x0, abs[i]);
    x1 = Math.max(x1, abs[i]);
    y0 = Math.min(y0, abs[i + 1]);
    y1 = Math.max(y1, abs[i + 1]);
  }
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const unit = Math.min(W, H);
  const r = (v: number) => Math.round(v * 10_000) / 10_000;
  return {
    id: layerId(),
    type: "draw",
    points: abs.map((v, i) => r(v - (i % 2 ? cy : cx))),
    color: style.color,
    width: style.width,
    brush: style.brush,
    // Центр — в долях ширины и высоты картинки, точки — в долях короткой стороны.
    x: r((cx * unit) / W),
    y: r((cy * unit) / H),
    rotation: 0,
    scale: 1,
    opacity: 1,
  };
}

/** Прореживание линии: точки ближе minDist друг к другу отбрасываются; не больше max точек. */
export function thinPoints(pts: number[], minDist: number, max: number) {
  const out: number[] = [];
  for (let i = 0; i < pts.length; i += 2) {
    const n = out.length;
    if (n && Math.hypot(pts[i] - out[n - 2], pts[i + 1] - out[n - 1]) < minDist && i < pts.length - 2) continue;
    out.push(pts[i], pts[i + 1]);
  }
  if (out.length / 2 <= max) return out;
  const step = Math.ceil(out.length / 2 / max);
  const sparse: number[] = [];
  for (let i = 0; i < out.length / 2; i += step) sparse.push(out[i * 2], out[i * 2 + 1]);
  sparse.push(out[out.length - 2], out[out.length - 1]);
  return sparse.slice(0, max * 2);
}
