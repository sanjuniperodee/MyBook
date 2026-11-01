/**
 * Рисование правки фото на холсте (только браузер): снимок после поворотов и выпрямления, свет и цвет, виньетка и
 * слои. Одни и те же функции рисуют превью редактора (уменьшенная копия) и готовый файл в полном размере — что
 * видно в редакторе, то и уйдёт в книгу.
 */
import { cssFont, type FontKey } from "@/lib/book/fonts";
import { applyColor, effectiveAdjust } from "./color";
import { coverScale, SHAPE_BASE, TEXT_BASE, turnedSize, type DrawLayer, type Geometry, type Layer, type PhotoEdit, type ShapeLayer, type TextLayer } from "./doc";
import { SHAPES } from "./shapes";

type Ctx = CanvasRenderingContext2D;

export function makeCanvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

/** Освободить память холста сразу (Safari на iPhone держит её до сборки мусора и падает на больших снимках). */
export const releaseCanvas = (c: HTMLCanvasElement) => {
  c.width = 0;
  c.height = 0;
};

// --- Шрифты ---

const families = new Map<FontKey, string>();

/** Семейство шрифта для холста: CSS-переменные next/font из стека cssFont разворачиваются в настоящие имена. */
export function fontFamily(key: FontKey) {
  let f = families.get(key);
  if (!f) {
    const root = getComputedStyle(document.documentElement);
    f = cssFont(key).replace(/var\((--[\w-]+)\)/g, (_, v: string) => root.getPropertyValue(v).trim() || "serif");
    families.set(key, f);
  }
  return f;
}

export const fontSpec = (l: Pick<TextLayer, "font" | "weight" | "italic">, px: number) => `${l.italic ? "italic " : ""}${l.weight} ${Math.max(1, px)}px ${fontFamily(l.font)}`;

/** Догрузить шрифты надписей (холст не ждёт шрифт сам — без этого первая отрисовка взяла бы запасной). */
export async function loadFonts(layers: readonly Layer[]) {
  const texts = layers.filter((l): l is TextLayer => l.type === "text");
  await Promise.all(texts.map((l) => document.fonts.load(fontSpec(l, 48), l.text || "Aa").catch(() => [])));
}

// --- Размеры слоёв ---

export interface TextBox {
  lines: string[];
  widths: number[];
  px: number;
  lineH: number;
  padX: number;
  padY: number;
  w: number;
  h: number;
}

const lineWidth = (ctx: Ctx, s: string, spacing: number) => ctx.measureText(s).width + spacing * Math.max(0, [...s].length - 1);

export function measureText(ctx: Ctx, l: TextLayer, unit: number): TextBox {
  const px = TEXT_BASE * l.scale * unit;
  ctx.font = fontSpec(l, px);
  const lines = (l.text || " ").split("\n");
  const sp = l.spacing * px;
  const widths = lines.map((s) => lineWidth(ctx, s, sp));
  const lineH = px * l.lineHeight;
  const padX = px * (l.background ? 0.5 : 0.12);
  const padY = px * (l.background ? 0.28 : 0.06);
  return {
    lines,
    widths,
    px,
    lineH,
    padX,
    padY,
    w: Math.max(px * 0.5, ...widths) + padX * 2,
    h: lines.length * lineH + padY * 2,
  };
}

function shapeSize(l: ShapeLayer, unit: number) {
  const def = SHAPES[l.shape];
  const k = (SHAPE_BASE * l.scale * unit) / Math.max(def.w, def.h);
  return { k, w: def.w * k, h: def.h * k, def };
}

function drawExtent(l: DrawLayer) {
  let x = 0;
  let y = 0;
  for (let i = 0; i < l.points.length; i += 2) {
    x = Math.max(x, Math.abs(l.points[i]));
    y = Math.max(y, Math.abs(l.points[i + 1]));
  }
  return { x, y };
}

/** Размер слоя в пикселях (без поворота), центр — в (x·W, y·H). unit — короткая сторона картинки. */
export function layerBox(ctx: Ctx, l: Layer, unit: number): { w: number; h: number } {
  if (l.type === "text") {
    const b = measureText(ctx, l, unit);
    return { w: b.w, h: b.h };
  }
  if (l.type === "shape") {
    const s = shapeSize(l, unit);
    const pad = s.def.kind === "line" || l.stroke ? l.strokeWidth * l.scale * unit : 0;
    return { w: s.w + pad, h: s.h + pad };
  }
  const e = drawExtent(l);
  const k = l.scale * unit;
  return { w: (e.x * 2 + l.width) * k, h: (e.y * 2 + l.width) * k };
}

/** Слой под точкой (px, py) — верхний; tol — запас вокруг слоя в пикселях (палец толще мыши). */
export function hitLayer(ctx: Ctx, layers: readonly Layer[], px: number, py: number, W: number, H: number, tol = 0): Layer | null {
  const unit = Math.min(W, H);
  for (let i = layers.length - 1; i >= 0; i--) {
    const l = layers[i];
    const b = layerBox(ctx, l, unit);
    const a = (-l.rotation * Math.PI) / 180;
    const dx = px - l.x * W;
    const dy = py - l.y * H;
    const lx = dx * Math.cos(a) - dy * Math.sin(a);
    const ly = dx * Math.sin(a) + dy * Math.cos(a);
    if (Math.abs(lx) <= b.w / 2 + tol && Math.abs(ly) <= b.h / 2 + tol) return l;
  }
  return null;
}

// --- Рисование слоёв ---

const paths = new Map<string, Path2D>();
const path2d = (d: string) => {
  let p = paths.get(d);
  if (!p) paths.set(d, (p = new Path2D(d)));
  return p;
};

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

function drawTextLine(ctx: Ctx, s: string, x: number, y: number, spacing: number, mode: "fill" | "stroke") {
  if (!spacing) {
    if (mode === "fill") ctx.fillText(s, x, y);
    else ctx.strokeText(s, x, y);
    return;
  }
  for (const ch of s) {
    if (mode === "fill") ctx.fillText(ch, x, y);
    else ctx.strokeText(ch, x, y);
    x += ctx.measureText(ch).width + spacing;
  }
}

function drawText(ctx: Ctx, l: TextLayer, unit: number) {
  const b = measureText(ctx, l, unit);
  if (l.background && l.backgroundOpacity > 0) {
    ctx.fillStyle = rgba(l.background, l.backgroundOpacity);
    roundRect(ctx, -b.w / 2, -b.h / 2, b.w, b.h, b.px * 0.32);
    ctx.fill();
  }
  ctx.font = fontSpec(l, b.px);
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  const sp = l.spacing * b.px;
  const shadow = () => {
    if (l.shadow === "soft")
      Object.assign(ctx, {
        shadowColor: "rgba(0,0,0,0.55)",
        shadowBlur: b.px * 0.22,
        shadowOffsetX: 0,
        shadowOffsetY: b.px * 0.05,
      });
    else if (l.shadow === "hard")
      Object.assign(ctx, {
        shadowColor: "rgba(0,0,0,0.7)",
        shadowBlur: 0,
        shadowOffsetX: b.px * 0.05,
        shadowOffsetY: b.px * 0.06,
      });
    else if (l.shadow === "glow")
      Object.assign(ctx, {
        shadowColor: l.color,
        shadowBlur: b.px * 0.4,
        shadowOffsetX: 0,
        shadowOffsetY: 0,
      });
  };
  const noShadow = () =>
    Object.assign(ctx, {
      shadowColor: "transparent",
      shadowBlur: 0,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
    });
  const pos = b.lines.map((s, i) => {
    const w = b.widths[i];
    const x = l.align === "left" ? -b.w / 2 + b.padX : l.align === "right" ? b.w / 2 - b.padX - w : -w / 2;
    return { s, x, y: -b.h / 2 + b.padY + b.lineH * (i + 0.5) };
  });
  if (l.stroke && l.strokeWidth > 0) {
    shadow();
    ctx.strokeStyle = l.stroke;
    ctx.lineWidth = l.strokeWidth * b.px * 2;
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;
    for (const p of pos) drawTextLine(ctx, p.s, p.x, p.y, sp, "stroke");
    noShadow();
  } else shadow();
  ctx.fillStyle = l.color;
  for (const p of pos) drawTextLine(ctx, p.s, p.x, p.y, sp, "fill");
  // Свечение — два прохода, иначе оно едва заметно.
  if (l.shadow === "glow") for (const p of pos) drawTextLine(ctx, p.s, p.x, p.y, sp, "fill");
  noShadow();
}

function drawShape(ctx: Ctx, l: ShapeLayer, unit: number) {
  const { k, w, h, def } = shapeSize(l, unit);
  ctx.translate(-w / 2, -h / 2);
  ctx.scale(k, k);
  const p = path2d(def.path);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  if (def.kind === "fill" && l.fill) {
    ctx.fillStyle = l.fill;
    ctx.fill(p);
  }
  const stroke = l.stroke ?? (def.kind === "line" ? (l.fill ?? "#FFFFFF") : null);
  if (stroke && l.strokeWidth > 0) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = (l.strokeWidth * l.scale * unit) / k;
    ctx.stroke(p);
  }
}

/** Линия рисунка: сглаживание через середины отрезков (квадратичные кривые). */
export function strokePath(ctx: Ctx, pts: readonly number[], k: number) {
  ctx.beginPath();
  const n = pts.length / 2;
  ctx.moveTo(pts[0] * k, pts[1] * k);
  if (n === 1) {
    ctx.lineTo(pts[0] * k + 0.01, pts[1] * k);
    return;
  }
  for (let i = 1; i < n - 1; i++) {
    const x = pts[i * 2] * k;
    const y = pts[i * 2 + 1] * k;
    ctx.quadraticCurveTo(x, y, (x + pts[i * 2 + 2] * k) / 2, (y + pts[i * 2 + 3] * k) / 2);
  }
  ctx.lineTo(pts[(n - 1) * 2] * k, pts[(n - 1) * 2 + 1] * k);
}

function drawStroke(ctx: Ctx, l: DrawLayer, unit: number) {
  const k = l.scale * unit;
  ctx.strokeStyle = l.color;
  ctx.lineWidth = l.width * k;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (l.brush === "marker") ctx.globalAlpha *= 0.5;
  strokePath(ctx, l.points, k);
  ctx.stroke();
}

export function drawLayer(ctx: Ctx, l: Layer, W: number, H: number) {
  const unit = Math.min(W, H);
  ctx.save();
  ctx.translate(l.x * W, l.y * H);
  ctx.rotate((l.rotation * Math.PI) / 180);
  ctx.globalAlpha = l.opacity;
  if (l.type === "text") drawText(ctx, l, unit);
  else if (l.type === "shape") drawShape(ctx, l, unit);
  else drawStroke(ctx, l, unit);
  ctx.restore();
}

export function drawVignette(ctx: Ctx, W: number, H: number, amount: number) {
  if (amount <= 0) return;
  const r = Math.hypot(W, H) / 2;
  const g = ctx.createRadialGradient(W / 2, H / 2, r * 0.38, W / 2, H / 2, r);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, `rgba(0,0,0,${0.78 * (amount / 100)})`);
  ctx.save();
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

// --- Снимок ---

/** Предел площади холста: Safari на iPhone не рисует холсты больше 16,7 Мп (4096×4096) — молча остаётся пустым. */
const MAX_PIXELS = 16_000_000;

/** Снимок после отражения, поворотов и выпрямления (без кадра), длинная сторона — не больше maxSide. */
export function geometryCanvas(img: CanvasImageSource, iw: number, ih: number, g: Pick<Geometry, "turns" | "flip" | "straighten">, maxSide: number) {
  const t = turnedSize(iw, ih, g.turns);
  const f = Math.min(1, maxSide / Math.max(t.w, t.h), Math.sqrt(MAX_PIXELS / (t.w * t.h)));
  const c = makeCanvas(t.w * f, t.h * f);
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.translate(c.width / 2, c.height / 2);
  if (g.straighten) {
    ctx.rotate((g.straighten * Math.PI) / 180);
    const s = coverScale(c.width, c.height, g.straighten);
    ctx.scale(s, s);
  }
  ctx.rotate((g.turns * Math.PI) / 2);
  if (g.flip) ctx.scale(-1, 1);
  ctx.drawImage(img, (-iw * f) / 2, (-ih * f) / 2, iw * f, ih * f);
  return c;
}

/** Свет и цвет над холстом на месте. */
export function colorCanvas(c: HTMLCanvasElement, e: Pick<PhotoEdit, "adjust" | "levels" | "filter">) {
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  const img = ctx.getImageData(0, 0, c.width, c.height);
  applyColor(img.data, c.width, c.height, e.adjust, e.levels, e.filter);
  ctx.putImageData(img, 0, 0);
}

/** Кадр в пикселях холста снимка. */
export function cropPixels(geo: { width: number; height: number }, g: Geometry) {
  const r = g.crop ?? { x: 0, y: 0, w: 1, h: 1 };
  const x = Math.round(r.x * geo.width);
  const y = Math.round(r.y * geo.height);
  return {
    x,
    y,
    w: Math.max(1, Math.min(geo.width - x, Math.round(r.w * geo.width))),
    h: Math.max(1, Math.min(geo.height - y, Math.round(r.h * geo.height))),
  };
}

/** Виньетка, слои — поверх уже нарисованного снимка W×H. */
export function drawOverlays(ctx: Ctx, e: PhotoEdit, W: number, H: number, skip?: string | null) {
  drawVignette(ctx, W, H, effectiveAdjust(e.adjust, e.filter).vignette);
  for (const l of e.layers) if (l.id !== skip) drawLayer(ctx, l, W, H);
}

/** Самый большой размер готового файла (как у загруженных фото, images.ts MAX_SIDE). */
export const OUTPUT_MAX_SIDE = 4200;

/** Готовая картинка в полном размере — JPEG для книги. */
export async function renderOutput(img: CanvasImageSource, iw: number, ih: number, e: PhotoEdit): Promise<Blob> {
  await loadFonts(e.layers);
  const geo = geometryCanvas(img, iw, ih, e.geometry, OUTPUT_MAX_SIDE);
  const r = cropPixels(geo, e.geometry);
  const out = makeCanvas(r.w, r.h);
  const ctx = out.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(geo, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
  releaseCanvas(geo);
  colorCanvas(out, e);
  drawOverlays(ctx, e, r.w, r.h);
  const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, "image/jpeg", 0.93));
  releaseCanvas(out);
  if (!blob) throw new Error("render failed");
  return blob;
}
