import "server-only";
import sharp from "sharp";
import { applyColor, autoLevels, effectiveAdjust } from "@/lib/photo-edit/color";
import { coverScale, SHAPE_BASE, TEXT_BASE, type DrawLayer, type Layer, type Levels, type PhotoEdit, type ShapeLayer, type TextLayer } from "@/lib/photo-edit/doc";
import { SHAPES } from "@/lib/photo-edit/shapes";

const LIMIT_INPUT_PIXELS = 120_000_000;
const OUTPUT_MAX_SIDE = 4200;

/** Виньетка поверх RGBA — та же математика радиального градиента, что в render.ts (drawVignette). */
export function applyVignette(data: Uint8ClampedArray, width: number, height: number, amount: number) {
  if (amount <= 0 || width <= 0 || height <= 0) return;
  const cx = width / 2;
  const cy = height / 2;
  const r = Math.hypot(width, height) / 2;
  if (r <= 0) return;
  const maxDark = 0.78 * (amount / 100);
  const inner = 0.38;
  const span = 1 - inner;
  for (let y = 0; y < height; y++) {
    const dy = y + 0.5 - cy;
    const row = y * width * 4;
    for (let x = 0; x < width; x++) {
      const d = Math.hypot(x + 0.5 - cx, dy) / r;
      if (d <= inner) continue;
      const t = d >= 1 ? 1 : (d - inner) / span;
      const k = 1 - maxDark * t;
      const i = row + x * 4;
      data[i] = Math.round(data[i] * k);
      data[i + 1] = Math.round(data[i + 1] * k);
      data[i + 2] = Math.round(data[i + 2] * k);
    }
  }
}

const escXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function layerSvg(l: Layer, W: number, H: number): string {
  const unit = Math.min(W, H);
  const tx = (l.x * W).toFixed(2);
  const ty = (l.y * H).toFixed(2);
  const wrap = (inner: string) => `<g transform="translate(${tx} ${ty}) rotate(${l.rotation})" opacity="${l.opacity}">${inner}</g>`;
  if (l.type === "shape") {
    const s = l as ShapeLayer;
    const def = SHAPES[s.shape];
    if (!def) return "";
    const k = (SHAPE_BASE * s.scale * unit) / Math.max(def.w, def.h);
    const w = def.w * k;
    const h = def.h * k;
    const fill = def.kind === "fill" && s.fill ? s.fill : "none";
    const stroke = s.stroke ?? (def.kind === "line" ? (s.fill ?? "#FFFFFF") : "none");
    const sw = stroke !== "none" && s.strokeWidth > 0 ? ((s.strokeWidth * s.scale * unit) / k).toFixed(3) : "0";
    return wrap(
      `<g transform="translate(${(-w / 2).toFixed(2)} ${(-h / 2).toFixed(2)}) scale(${k.toFixed(4)})"><path d="${def.path}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/></g>`,
    );
  }
  if (l.type === "draw") {
    const d = l as DrawLayer;
    const k = d.scale * unit;
    const n = Math.floor(d.points.length / 2);
    if (n === 0) return "";
    let path = `M${(d.points[0] * k).toFixed(2)} ${(d.points[1] * k).toFixed(2)}`;
    if (n === 1) {
      path += ` L${(d.points[0] * k + 0.01).toFixed(2)} ${(d.points[1] * k).toFixed(2)}`;
    } else {
      for (let i = 1; i < n - 1; i++) {
        const x = d.points[i * 2] * k;
        const y = d.points[i * 2 + 1] * k;
        const mx = (x + d.points[i * 2 + 2] * k) / 2;
        const my = (y + d.points[i * 2 + 3] * k) / 2;
        path += ` Q${x.toFixed(2)} ${y.toFixed(2)} ${mx.toFixed(2)} ${my.toFixed(2)}`;
      }
      path += ` L${(d.points[(n - 1) * 2] * k).toFixed(2)} ${(d.points[(n - 1) * 2 + 1] * k).toFixed(2)}`;
    }
    const alpha = d.brush === "marker" ? 0.5 : 1;
    return wrap(`<path d="${path}" fill="none" stroke="${d.color}" stroke-width="${(d.width * k).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="${alpha}"/>`);
  }
  const t = l as TextLayer;
  const px = Math.max(1, TEXT_BASE * t.scale * unit);
  const lines = (t.text || " ").split("\n");
  const lineH = px * t.lineHeight;
  const anchor = t.align === "left" ? "start" : t.align === "right" ? "end" : "middle";
  const fontStyle = t.italic ? "italic" : "normal";
  const strokeAttr = t.stroke && t.strokeWidth > 0 ? ` stroke="${t.stroke}" stroke-width="${(t.strokeWidth * px * 2).toFixed(2)}" stroke-linejoin="round" paint-order="stroke fill"` : "";
  const items = lines.map((line, i) => {
    const y = (i - (lines.length - 1) / 2) * lineH;
    return `<text x="0" y="${y.toFixed(2)}" text-anchor="${anchor}" dominant-baseline="central" font-family="sans-serif" font-size="${px.toFixed(2)}" font-weight="${t.weight}" font-style="${fontStyle}" fill="${t.color}"${strokeAttr}>${escXml(line)}</text>`;
  });
  return wrap(items.join(""));
}

function layersSvg(layers: readonly Layer[], W: number, H: number): Buffer {
  const body = layers.map((l) => layerSvg(l, W, H)).join("");
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${body}</svg>`);
}

/** Размеры оригинала (с учётом EXIF) и уровни «Авто» (autoLevels по уменьшенной копии 320 px, как в редакторе сайта). */
export async function probeOriginalImage(origBytes: Buffer): Promise<{ width: number; height: number; suggestedLevels: Levels }> {
  const base = sharp(origBytes, { failOn: "error", limitInputPixels: LIMIT_INPUT_PIXELS }).rotate();
  const full = await base.clone().metadata();
  const rotated = full.orientation && full.orientation >= 5 && full.orientation <= 8;
  const width = Math.max(1, (rotated ? full.height : full.width) ?? 1);
  const height = Math.max(1, (rotated ? full.width : full.height) ?? 1);
  const small = await base
    .resize({ width: 320, height: 320, fit: "inside", withoutEnlargement: true })
    .toColourspace("srgb")
    .ensureAlpha()
    .raw()
    .toBuffer();
  const rgba = new Uint8ClampedArray(small.buffer, small.byteOffset, small.byteLength);
  return { width, height, suggestedLevels: autoLevels(rgba) };
}

/**
 * Серверный рендер правки редактора фото (sharp + applyColor из lib/photo-edit/color.ts):
 * отражение → поворот на 90°×turns → выпрямление (coverScale) → обрезка crop → свет/цвет/фильтр (applyColor) →
 * виньетка → слои (если были добавлены на сайте) → JPEG 93% sRGB.
 */
export async function renderPhotoEdit(origBytes: Buffer, doc: PhotoEdit): Promise<Buffer> {
  const g = doc.geometry;
  let cur = await sharp(origBytes, { failOn: "error", limitInputPixels: LIMIT_INPUT_PIXELS })
    .rotate()
    .resize({ width: OUTPUT_MAX_SIDE, height: OUTPUT_MAX_SIDE, fit: "inside", withoutEnlargement: true })
    .toColourspace("srgb")
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const fromCur = () => sharp(cur.data, { raw: { width: cur.info.width, height: cur.info.height, channels: 4 }, limitInputPixels: LIMIT_INPUT_PIXELS });

  if (g.flip) {
    cur = await fromCur().flop().raw().toBuffer({ resolveWithObject: true });
  }
  if (g.turns) {
    cur = await fromCur().rotate(g.turns * 90).raw().toBuffer({ resolveWithObject: true });
  }
  if (g.straighten) {
    const geoW = cur.info.width;
    const geoH = cur.info.height;
    const s = coverScale(geoW, geoH, g.straighten);
    const sw = Math.max(geoW, Math.ceil(geoW * s));
    const sh = Math.max(geoH, Math.ceil(geoH * s));
    const rot = await fromCur()
      .resize({ width: sw, height: sh, fit: "fill" })
      .rotate(g.straighten, { background: { r: 0, g: 0, b: 0, alpha: 1 } })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const left = Math.max(0, Math.floor((rot.info.width - geoW) / 2));
    const top = Math.max(0, Math.floor((rot.info.height - geoH) / 2));
    const width = Math.max(1, Math.min(geoW, rot.info.width - left));
    const height = Math.max(1, Math.min(geoH, rot.info.height - top));
    cur = await sharp(rot.data, { raw: { width: rot.info.width, height: rot.info.height, channels: 4 }, limitInputPixels: LIMIT_INPUT_PIXELS })
      .extract({ left, top, width, height })
      .raw()
      .toBuffer({ resolveWithObject: true });
  }
  if (g.crop) {
    const W = cur.info.width;
    const H = cur.info.height;
    const left = Math.max(0, Math.min(W - 1, Math.round(g.crop.x * W)));
    const top = Math.max(0, Math.min(H - 1, Math.round(g.crop.y * H)));
    const width = Math.max(1, Math.min(W - left, Math.round(g.crop.w * W)));
    const height = Math.max(1, Math.min(H - top, Math.round(g.crop.h * H)));
    cur = await fromCur().extract({ left, top, width, height }).raw().toBuffer({ resolveWithObject: true });
  }

  const rgba = new Uint8ClampedArray(cur.data.buffer, cur.data.byteOffset, cur.data.byteLength);
  applyColor(rgba, cur.info.width, cur.info.height, doc.adjust, doc.levels, doc.filter);
  applyVignette(rgba, cur.info.width, cur.info.height, effectiveAdjust(doc.adjust, doc.filter).vignette);

  let out = sharp(Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength), {
    raw: { width: cur.info.width, height: cur.info.height, channels: 4 },
    limitInputPixels: LIMIT_INPUT_PIXELS,
  });
  if (doc.layers.length > 0) {
    out = out.composite([{ input: layersSvg(doc.layers, cur.info.width, cur.info.height), top: 0, left: 0 }]);
  }
  return out.removeAlpha().jpeg({ quality: 93, mozjpeg: true, chromaSubsampling: "4:4:4" }).toBuffer();
}
