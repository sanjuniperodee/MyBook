/**
 * Логика конструктора обложки без React: история правок, слои (добавить, дублировать, удалить, порядок, выравнивание),
 * геометрия жестов (перемещение, размер, поворот), прилипание к направляющим, буфер стиля, предупреждения
 * о безопасной зоне и разрешение фото. Координаты — доли лицевой крышки, как в данных обложки; мм — через размер крышки.
 */
import { COVER_LIMITS, layerText, newLayerId, type CoverDesign, type CoverLayer, type CoverTexts, type DecorId, type DecorLayer, type ImageLayer, type ShapeKind, type ShapeLayer, type TextLayer, type TextStyle } from "@/lib/book/cover-design";
import type { FontKey } from "@/lib/book/fonts";

export type Box = { x: number; y: number; w: number; h: number };
export type Board = { w: number; h: number };
export type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
export const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

const round = (v: number) => Math.round(v * 10000) / 10000;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// ─── история ───────────────────────────────────────────────────────────────

export interface History {
  past: CoverDesign[];
  present: CoverDesign;
  future: CoverDesign[];
  /** Ключ последней правки и её время: правки с тем же ключом подряд — один шаг (жест, ползунок). */
  key: string | null;
  at: number;
}

/** Сколько шагов назад помним. */
export const HISTORY_LIMIT = 100;
/** Правки одного поля подряд быстрее этого — один шаг отмены. Жесты (ключ «g:…») сливаются всегда. */
export const MERGE_MS = 1200;

export const historyOf = (design: CoverDesign): History => ({ past: [], present: design, future: [], key: null, at: 0 });

/** Новое состояние. key — сливать с предыдущей правкой с тем же ключом. */
export function record(h: History, next: CoverDesign, key: string | null = null, now = Date.now()): History {
  if (next === h.present) return h;
  const merge = key !== null && key === h.key && (key.startsWith("g:") || now - h.at < MERGE_MS);
  if (merge) return { ...h, present: next, future: [], at: now };
  return { past: [...h.past, h.present].slice(-HISTORY_LIMIT), present: next, future: [], key, at: now };
}

export function undo(h: History): History {
  if (!h.past.length) return h;
  return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future], key: null, at: 0 };
}

export function redo(h: History): History {
  if (!h.future.length) return h;
  return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1), key: null, at: 0 };
}

// ─── слои ──────────────────────────────────────────────────────────────────

export const findLayer = (d: CoverDesign, id: string | null) => (id ? (d.layers.find((l) => l.id === id) ?? null) : null);

export function updateLayer(d: CoverDesign, id: string, patch: Partial<CoverLayer> | ((l: CoverLayer) => CoverLayer)): CoverDesign {
  return { ...d, layers: d.layers.map((l) => (l.id !== id ? l : typeof patch === "function" ? patch(l) : ({ ...l, ...patch } as CoverLayer))) };
}

export function removeLayer(d: CoverDesign, id: string): CoverDesign {
  return { ...d, layers: d.layers.filter((l) => l.id !== id) };
}

/** Новый слой — поверх всех (если слоёв уже предел — не добавляется). */
export function addLayer(d: CoverDesign, layer: CoverLayer): CoverDesign {
  if (d.layers.length >= COVER_LIMITS.layers) return d;
  return { ...d, layers: [...d.layers, layer] };
}

/** Копия слоя чуть ниже и правее, прямо над оригиналом; привязанный текст становится своим (два названия ни к чему). */
export function duplicateLayer(d: CoverDesign, id: string, texts: CoverTexts, offset = 0.025): { design: CoverDesign; id: string | null } {
  const l = findLayer(d, id);
  if (!l || d.layers.length >= COVER_LIMITS.layers) return { design: d, id: null };
  const copy = cloneLayer(l, d, texts, offset);
  const i = d.layers.indexOf(l);
  return { design: { ...d, layers: [...d.layers.slice(0, i + 1), copy, ...d.layers.slice(i + 1)] }, id: copy.id };
}

/** Копия слоя для вставки: новый id, сдвиг, без закрепления; привязанный текст — своим текстом. */
export function cloneLayer(l: CoverLayer, d: CoverDesign, texts: CoverTexts, offset = 0.025): CoverLayer {
  const base = { ...structuredClone(l), id: newLayerId(d), x: round(l.x + offset), y: round(l.y + offset), locked: undefined, hidden: undefined };
  if (base.kind === "text" && base.bind) return { ...base, bind: undefined, text: layerText(l as TextLayer, texts) };
  return base as CoverLayer;
}

export type ZMove = "front" | "back" | "up" | "down";

/** Порядок слоёв: последний в списке — сверху. */
export function moveZ(d: CoverDesign, id: string, how: ZMove): CoverDesign {
  const i = d.layers.findIndex((l) => l.id === id);
  if (i < 0) return d;
  const to = how === "front" ? d.layers.length - 1 : how === "back" ? 0 : how === "up" ? Math.min(d.layers.length - 1, i + 1) : Math.max(0, i - 1);
  return reorder(d, i, to);
}

export function reorder(d: CoverDesign, from: number, to: number): CoverDesign {
  if (from === to || from < 0 || to < 0 || from >= d.layers.length || to >= d.layers.length) return d;
  const layers = [...d.layers];
  const [l] = layers.splice(from, 1);
  layers.splice(to, 0, l);
  return { ...d, layers };
}

export type AlignHow = "left" | "center" | "right" | "top" | "middle" | "bottom";

/** Выровнять рамку слоя по области (безопасной зоне крышки): края — по её краям, центр — по центру крышки. */
export function alignBox(b: Box, how: AlignHow, area: Box): Box {
  switch (how) {
    case "left":
      return { ...b, x: round(area.x) };
    case "right":
      return { ...b, x: round(area.x + area.w - b.w) };
    case "center":
      return { ...b, x: round(0.5 - b.w / 2) };
    case "top":
      return { ...b, y: round(area.y) };
    case "bottom":
      return { ...b, y: round(area.y + area.h - b.h) };
    case "middle":
      return { ...b, y: round(0.5 - b.h / 2) };
  }
}

/** На всю обложку: рамка крышки с заходом bleed (доля) за край — под обрез и в загиб. */
export const coverBox = (bleed = 0.03): Box => ({ x: -bleed, y: -bleed, w: 1 + bleed * 2, h: 1 + bleed * 2 });

// ─── геометрия жестов ──────────────────────────────────────────────────────

/** Рамка в допустимых пределах (как при сохранении). */
export function clampBox(b: Box): Box {
  const { bleed, minSize, maxSize } = COVER_LIMITS;
  const w = clamp(b.w, minSize, maxSize);
  const h = clamp(b.h, minSize, maxSize);
  return { x: round(clamp(b.x, -bleed, 1 + bleed)), y: round(clamp(b.y, -bleed, 1 + bleed)), w: round(w), h: round(h) };
}

export const moveBox = (b: Box, dx: number, dy: number): Box => ({ ...b, x: b.x + dx, y: b.y + dy });

/** Знаки ручки: −1 — левая/верхняя сторона, 1 — правая/нижняя, 0 — не двигается по этой оси. */
export function handleSigns(h: Handle): { sx: -1 | 0 | 1; sy: -1 | 0 | 1 } {
  return { sx: h.includes("w") ? -1 : h.includes("e") ? 1 : 0, sy: h.includes("n") ? -1 : h.includes("s") ? 1 : 0 };
}

const isCorner = (h: Handle) => h.length === 2;

/**
 * Новая рамка при перетаскивании ручки на (dx, dy) долей крышки от начала жеста. Размер меняется в осях самого слоя
 * (у повёрнутого — вдоль его сторон), противоположная сторона стоит на месте. keepAspect — пропорционально (у угловых ручек).
 */
export function resizeBox(start: Box, rotate: number, handle: Handle, dx: number, dy: number, board: Board, keepAspect: boolean): Box {
  const { sx, sy } = handleSigns(handle);
  const a = (rotate * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  // Всё в мм: у крышки разные масштабы долей по осям.
  const dxm = dx * board.w;
  const dym = dy * board.h;
  const lx = dxm * cos + dym * sin;
  const ly = -dxm * sin + dym * cos;
  const w0 = start.w * board.w;
  const h0 = start.h * board.h;
  const min = COVER_LIMITS.minSize * Math.min(board.w, board.h) * 2;
  let w = Math.max(min, w0 + sx * lx);
  let h = Math.max(min, h0 + sy * ly);
  if (keepAspect && isCorner(handle)) {
    // Пропорционально — по оси, которую тянут сильнее.
    const k = Math.abs(w / w0 - 1) > Math.abs(h / h0 - 1) ? w / w0 : h / h0;
    w = Math.max(min, w0 * k);
    h = Math.max(min, h0 * k);
  } else if (keepAspect && sx === 0) w = (h / h0) * w0;
  else if (keepAspect && sy === 0) h = (w / w0) * h0;
  // Центр сдвигается на половину прироста в сторону ручки (в осях слоя), затем — обратно в оси крышки.
  const cxl = (sx * (w - w0)) / 2;
  const cyl = (sy * (h - h0)) / 2;
  const cx = start.x * board.w + w0 / 2 + cxl * cos - cyl * sin;
  const cy = start.y * board.h + h0 / 2 + cxl * sin + cyl * cos;
  return { x: (cx - w / 2) / board.w, y: (cy - h / 2) / board.h, w: w / board.w, h: h / board.h };
}

/** Угол поворота: от угла указателя вокруг центра в начале жеста; shift — шагами по 15°, иначе прилипает к 0/90/180/270 (±3°). */
export function rotateAngle(start: number, from: number, to: number, shift: boolean): number {
  let a = start + to - from;
  a = ((((a + 180) % 360) + 360) % 360) - 180;
  if (shift) a = Math.round(a / 15) * 15;
  else {
    const near = Math.round(a / 90) * 90;
    if (Math.abs(a - near) < 3) a = near;
  }
  if (a <= -180) a += 360;
  return Math.round(a * 10) / 10;
}

/** Угол точки (x, y) вокруг центра (cx, cy), градусы (в пикселях экрана — оси одинаковые). */
export const pointerAngle = (cx: number, cy: number, x: number, y: number) => (Math.atan2(y - cy, x - cx) * 180) / Math.PI;

// ─── прилипание ────────────────────────────────────────────────────────────

export interface Guides {
  x: number[];
  y: number[];
}

/** Куда прилипать: края и центр крышки, края безопасной зоны, края и центры других видимых слоёв. */
export function snapTargets(d: CoverDesign, except: string | null, safe: Box): Guides {
  const x = [0, 0.5, 1, safe.x, safe.x + safe.w];
  const y = [0, 0.5, 1, safe.y, safe.y + safe.h];
  for (const l of d.layers) {
    if (l.id === except || l.hidden || l.rotate) continue;
    x.push(l.x, l.x + l.w / 2, l.x + l.w);
    y.push(l.y, l.y + l.h / 2, l.y + l.h);
  }
  return { x, y };
}

function nearest(values: number[], targets: number[], threshold: number): { delta: number; at: number } | null {
  let best: { delta: number; at: number } | null = null;
  for (const v of values)
    for (const t of targets) {
      const d = t - v;
      if (Math.abs(d) <= threshold && (!best || Math.abs(d) < Math.abs(best.delta))) best = { delta: d, at: t };
    }
  return best;
}

/** Перемещение с прилипанием: левый край, центр или правый край (и так же по вертикали) — к ближайшей направляющей. */
export function snapMove(b: Box, targets: Guides, tx: number, ty: number): { box: Box; guides: Guides } {
  const sx = nearest([b.x, b.x + b.w / 2, b.x + b.w], targets.x, tx);
  const sy = nearest([b.y, b.y + b.h / 2, b.y + b.h], targets.y, ty);
  return { box: { ...b, x: b.x + (sx?.delta ?? 0), y: b.y + (sy?.delta ?? 0) }, guides: { x: sx ? [sx.at] : [], y: sy ? [sy.at] : [] } };
}

/** Размер с прилипанием: двигающиеся стороны (без поворота) — к направляющим. */
export function snapResize(b: Box, handle: Handle, targets: Guides, tx: number, ty: number): { box: Box; guides: Guides } {
  const { sx, sy } = handleSigns(handle);
  const out = { ...b };
  const guides: Guides = { x: [], y: [] };
  if (sx) {
    const edge = sx < 0 ? b.x : b.x + b.w;
    const s = nearest([edge], targets.x, tx);
    if (s) {
      if (sx < 0) {
        out.x += s.delta;
        out.w -= s.delta;
      } else out.w += s.delta;
      guides.x.push(s.at);
    }
  }
  if (sy) {
    const edge = sy < 0 ? b.y : b.y + b.h;
    const s = nearest([edge], targets.y, ty);
    if (s) {
      if (sy < 0) {
        out.y += s.delta;
        out.h -= s.delta;
      } else out.h += s.delta;
      guides.y.push(s.at);
    }
  }
  return { box: out, guides };
}

/** Рамка слоя с учётом поворота — для проверки безопасной зоны (доли крышки). */
export function rotatedBounds(b: Box, rotate: number, board: Board): Box {
  if (!rotate) return b;
  const a = (rotate * Math.PI) / 180;
  const w = b.w * board.w;
  const h = b.h * board.h;
  const W = Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a));
  const H = Math.abs(w * Math.sin(a)) + Math.abs(h * Math.cos(a));
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  return { x: cx - W / board.w / 2, y: cy - H / board.h / 2, w: W / board.w, h: H / board.h };
}

/** Видимые слои с текстом, вышедшие за безопасную зону (уйдут под кант или в загиб). */
export function unsafeTextLayers(d: CoverDesign, safe: Box, texts: CoverTexts, board: Board): TextLayer[] {
  const eps = 0.002;
  return d.layers.filter((l): l is TextLayer => {
    if (l.kind !== "text" || l.hidden || !layerText(l, texts).trim()) return false;
    const r = rotatedBounds(l, l.rotate ?? 0, board);
    return r.x < safe.x - eps || r.y < safe.y - eps || r.x + r.w > safe.x + safe.w + eps || r.y + r.h > safe.y + safe.h + eps;
  });
}

// ─── новые слои ────────────────────────────────────────────────────────────

/** Пресеты нового текста: заголовок, подзаголовок, текст, надпись от руки. */
export type TextPreset = "heading" | "subheading" | "body" | "script";

const PRESETS: Record<TextPreset, Pick<TextStyle, "font" | "weight" | "size" | "lineHeight"> & Partial<TextStyle> & { h: number }> = {
  heading: { font: "prata", weight: 400, size: 0.085, lineHeight: 1.1, h: 0.14 },
  subheading: { font: "cormorantsc", weight: 600, size: 0.038, lineHeight: 1.2, tracking: 0.18, upper: true, h: 0.06 },
  body: { font: "lora", weight: 400, size: 0.032, lineHeight: 1.35, h: 0.1 },
  script: { font: "caveat", weight: 500, size: 0.07, lineHeight: 1.1, h: 0.1 },
};

/** Рамка по центру безопасной зоны шириной w (доля). */
const centered = (safe: Box, w: number, h: number): Box => ({ x: round(safe.x + (safe.w - w) / 2), y: round(safe.y + (safe.h - h) / 2), w, h });

export function newTextLayer(d: CoverDesign, preset: TextPreset, text: string, safe: Box, color: string): TextLayer {
  const { h, ...style } = PRESETS[preset];
  return { id: newLayerId(d), kind: "text", text, ...centered(safe, round(safe.w * 0.86), h), style: { ...style, color, align: "center", valign: "middle" } };
}

export function newImageLayer(d: CoverDesign, src: { photoId?: string | null; stock?: string | null }, safe: Box, board: Board, aspect = 4 / 3): ImageLayer {
  // Ширина — 70% безопасной зоны, высота — по пропорциям снимка (не выше 60% крышки).
  let w = safe.w * 0.7;
  let h = (w * board.w) / aspect / board.h;
  if (h > 0.6) {
    h = 0.6;
    w = (h * board.h * aspect) / board.w;
  }
  return { id: newLayerId(d), kind: "image", photoId: src.photoId ?? null, stock: src.stock ?? null, mask: "rect", ...centered(safe, round(w), round(h)) };
}

export function newShapeLayer(d: CoverDesign, shape: ShapeKind, safe: Box, board: Board, color: string): ShapeLayer {
  const id = newLayerId(d);
  if (shape === "line") return { id, kind: "shape", shape, stroke: color, strokeWidth: 0.004, ...centered(safe, round(safe.w * 0.5), 0.02) };
  if (shape === "frame" || shape === "double" || shape === "corners") return { id, kind: "shape", shape, stroke: color, strokeWidth: 0.004, ...centered(safe, round(safe.w * 0.92), round(safe.h * 0.92)) };
  const side = safe.w * 0.4;
  return { id, kind: "shape", shape, fill: color, ...centered(safe, round(side), round((side * board.w) / board.h)) };
}

export function newDecorLayer(d: CoverDesign, motif: DecorId, safe: Box, board: Board, color: string, aspect = 1): DecorLayer {
  const w = safe.w * (aspect > 2 ? 0.5 : 0.22);
  return { id: newLayerId(d), kind: "decor", motif, color, ...centered(safe, round(w), round((w * board.w) / aspect / board.h)) };
}

// ─── буфер стиля ───────────────────────────────────────────────────────────

export type StyleClip =
  | { kind: "text"; style: TextStyle; opacity?: number }
  | { kind: "image"; style: Pick<ImageLayer, "mask" | "radius" | "border" | "mono" | "overlay" | "opacity"> }
  | { kind: "shape"; style: Pick<ShapeLayer, "fill" | "gradient" | "stroke" | "strokeWidth" | "radius" | "opacity"> }
  | { kind: "decor"; style: Pick<DecorLayer, "color" | "opacity"> };

export function copyStyle(l: CoverLayer): StyleClip {
  switch (l.kind) {
    case "text":
      return { kind: "text", style: structuredClone(l.style), opacity: l.opacity };
    case "image":
      return { kind: "image", style: structuredClone({ mask: l.mask, radius: l.radius, border: l.border, mono: l.mono, overlay: l.overlay, opacity: l.opacity }) };
    case "shape":
      return { kind: "shape", style: structuredClone({ fill: l.fill, gradient: l.gradient, stroke: l.stroke, strokeWidth: l.strokeWidth, radius: l.radius, opacity: l.opacity }) };
    case "decor":
      return { kind: "decor", style: { color: l.color, opacity: l.opacity } };
  }
}

/** Стиль из буфера — только на слой того же вида; текст и место остаются. */
export function pasteStyle(l: CoverLayer, clip: StyleClip): CoverLayer {
  if (clip.kind !== l.kind) return l;
  if (clip.kind === "text" && l.kind === "text") return { ...l, style: structuredClone(clip.style), opacity: clip.opacity };
  return { ...l, ...structuredClone(clip.style) } as CoverLayer;
}

// ─── разное ────────────────────────────────────────────────────────────────

/**
 * Разрешение снимка при печати, dpi: снимок заполняет рамку (как object-fit: cover) и увеличен в zoom раз —
 * на миллиметр рамки приходится столько пикселей снимка.
 */
export function effectiveDpi(photo: { width: number; height: number }, boxMm: { w: number; h: number }, zoom = 1): number {
  if (!photo.width || !photo.height || boxMm.w <= 0 || boxMm.h <= 0) return 0;
  const mmPerPx = Math.max(boxMm.w / photo.width, boxMm.h / photo.height) * zoom;
  return Math.round(25.4 / mmPerPx);
}

/** Цвета, которые уже есть в обложке, — образцы в выборе цвета. */
export function designColors(d: CoverDesign): string[] {
  const out: string[] = [];
  const add = (c?: string | null) => c && !out.includes(c.toUpperCase()) && out.push(c.toUpperCase());
  if (d.background.kind === "color") add(d.background.color);
  if (d.background.kind === "gradient") {
    add(d.background.from);
    add(d.background.to);
  }
  for (const l of d.layers) {
    if (l.kind === "text") {
      add(l.style.color);
      add(l.style.plate?.color);
      add(l.style.outline?.color);
    } else if (l.kind === "shape") {
      add(l.fill);
      add(l.stroke);
      add(l.gradient?.to);
    } else if (l.kind === "decor") add(l.color);
    else add(l.border?.color);
  }
  return out.slice(0, 10);
}

/** Шрифт и текст для подсказки в списке слоёв. */
export function layerSummary(l: CoverLayer, texts: CoverTexts): string {
  if (l.name) return l.name;
  if (l.kind === "text") return layerText(l, texts).replace(/\s+/g, " ").trim();
  return "";
}

export const fontOf = (l: CoverLayer): FontKey | null => (l.kind === "text" ? l.style.font : null);
