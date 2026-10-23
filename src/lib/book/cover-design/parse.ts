/** Проверка обложки из слоёв: из базы и из запроса приходит что угодно — оставляем только допустимое. */
import { drawingWeight, sanitizeDrawing } from "../art";
import { isFontKey } from "../fonts";
import { normalizeFrame } from "../photo-frame";
import { DECOR_IDS } from "./decor";
import { isStockPhoto } from "./stock";
import type { CoverBackground, CoverDesign, CoverLayer, CoverTexts, DecorLayer, ImageLayer, LayerBase, ShapeLayer, TextLayer, TextStyle } from "./types";

/** Пределы: слоёв, длина текста и имени, на сколько слой может заходить за край крышки (в загиб). */
export const COVER_LIMITS = {
  layers: 40,
  /** Все свои рисунки обложки вместе — не больше стольких знаков пути. */
  artWeight: 120_000,
  text: 300,
  name: 40,
  /** Рамка слоя — от −bleed до 1 + bleed долей крышки. */
  bleed: 0.2,
  minSize: 0.01,
  maxSize: 1.4,
  fontSize: [0.012, 0.4],
  tracking: [-0.1, 0.8],
  lineHeight: [0.7, 2.5],
  shadow: [-0.3, 0.3],
  outline: [0, 0.12],
  stroke: [0, 0.06],
  border: [0, 0.05],
} as const;

const ALIGN = ["left", "center", "right"] as const;
const VALIGN = ["top", "middle", "bottom"] as const;
const MASKS = ["rect", "rounded", "circle", "arch"] as const;
const SHAPES = ["rect", "ellipse", "line", "frame", "double", "corners", "arch"] as const;
const BINDS = ["title", "subtitle", "names"] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID = /^[a-z0-9]{1,16}$/;
const HEX = /^#[0-9a-fA-F]{6}$/;

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);
const round = (v: number) => Math.round(v * 10000) / 10000;
const clamp = (v: unknown, lo: number, hi: number, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? round(Math.min(hi, Math.max(lo, v))) : fallback);
const opt = (v: unknown, [lo, hi]: readonly [number, number]) => (typeof v === "number" && Number.isFinite(v) ? round(Math.min(hi, Math.max(lo, v))) : undefined);
const color = (v: unknown, fallback: string) => (typeof v === "string" && HEX.test(v) ? v.toUpperCase() : fallback);
const colorOrNull = (v: unknown) => (typeof v === "string" && HEX.test(v) ? v.toUpperCase() : null);
const oneOf = <T extends string>(v: unknown, list: readonly T[], fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);
const flag = (v: unknown) => (v === true ? true : undefined);
const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\r\n?/g, "\n").slice(0, max) : "");

/** Без undefined-ключей: так данные в базе и сравнения в тестах стабильны. */
function clean<T extends Obj>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

function base(o: Obj, id: string): Omit<LayerBase, "kind"> {
  const { bleed, minSize, maxSize } = COVER_LIMITS;
  return clean({
    id,
    name: typeof o.name === "string" && o.name.trim() ? o.name.trim().slice(0, COVER_LIMITS.name) : undefined,
    x: clamp(o.x, -bleed, 1 + bleed, 0.1),
    y: clamp(o.y, -bleed, 1 + bleed, 0.1),
    w: clamp(o.w, minSize, maxSize, 0.5),
    h: clamp(o.h, minSize, maxSize, 0.1),
    rotate: opt(o.rotate, [-180, 180]) || undefined,
    opacity: (() => {
      const v = opt(o.opacity, [0, 1]);
      return v === undefined || v === 1 ? undefined : v;
    })(),
    locked: flag(o.locked),
    hidden: flag(o.hidden),
  });
}

function textStyle(raw: unknown): TextStyle {
  const s = obj(raw) ?? {};
  const L = COVER_LIMITS;
  const shadow = obj(s.shadow);
  const outline = obj(s.outline);
  const plate = obj(s.plate);
  return clean({
    font: isFontKey(s.font) ? s.font : "cormorant",
    weight: clamp(s.weight, 100, 900, 400),
    italic: flag(s.italic),
    underline: flag(s.underline),
    upper: flag(s.upper),
    size: clamp(s.size, L.fontSize[0], L.fontSize[1], 0.08),
    color: color(s.color, "#1F1A17"),
    tracking: opt(s.tracking, L.tracking) || undefined,
    lineHeight: opt(s.lineHeight, L.lineHeight),
    align: oneOf(s.align, ALIGN, "center"),
    valign: oneOf(s.valign, VALIGN, "middle"),
    shadow: shadow ? clean({ color: color(shadow.color, "#000000"), x: clamp(shadow.x, L.shadow[0], L.shadow[1], 0.04), y: clamp(shadow.y, L.shadow[0], L.shadow[1], 0.04), opacity: opt(shadow.opacity, [0, 1]) }) : undefined,
    outline: outline ? { color: color(outline.color, "#FFFFFF"), width: clamp(outline.width, L.outline[0], L.outline[1], 0.03) } : undefined,
    plate: plate ? clean({ color: color(plate.color, "#FFFFFF"), opacity: clamp(plate.opacity, 0, 1, 0.85), radius: opt(plate.radius, [0, 0.2]), pad: opt(plate.pad, [0, 2]) }) : undefined,
  });
}

function layer(raw: unknown, id: string): CoverLayer | null {
  const o = obj(raw);
  if (!o) return null;
  const b = base(o, id);
  switch (o.kind) {
    case "text": {
      const bind = BINDS.includes(o.bind as never) ? (o.bind as TextLayer["bind"]) : undefined;
      return clean({ ...b, kind: "text" as const, bind, text: bind ? "" : text(o.text, COVER_LIMITS.text), style: textStyle(o.style) });
    }
    case "image": {
      const photoId = typeof o.photoId === "string" && UUID.test(o.photoId) ? o.photoId.toLowerCase() : null;
      const stock = typeof o.stock === "string" && isStockPhoto(o.stock) ? o.stock : null;
      const frame = o.frame ? normalizeFrame(o.frame) : undefined;
      const border = obj(o.border);
      const overlay = obj(o.overlay);
      return clean({
        ...b,
        kind: "image" as const,
        photoId,
        stock,
        frame: frame && !(frame.zoom === 1 && frame.x === 0.5 && frame.y === 0.5) ? frame : undefined,
        mask: oneOf(o.mask, MASKS, "rect"),
        radius: opt(o.radius, [0, 0.5]),
        border: border ? { color: color(border.color, "#FFFFFF"), width: clamp(border.width, COVER_LIMITS.border[0], COVER_LIMITS.border[1], 0.01) } : undefined,
        mono: flag(o.mono),
        overlay: overlay ? { color: color(overlay.color, "#000000"), opacity: clamp(overlay.opacity, 0, 1, 0.3) } : undefined,
      }) as ImageLayer;
    }
    case "shape": {
      const g = obj(o.gradient);
      return clean({
        ...b,
        kind: "shape" as const,
        shape: oneOf(o.shape, SHAPES, "rect"),
        fill: colorOrNull(o.fill),
        gradient: g && colorOrNull(g.to) ? { to: colorOrNull(g.to)!, angle: clamp(g.angle, 0, 360, 90) } : undefined,
        stroke: colorOrNull(o.stroke),
        strokeWidth: opt(o.strokeWidth, COVER_LIMITS.stroke),
        radius: opt(o.radius, [0, 0.5]),
      }) as ShapeLayer;
    }
    case "decor": {
      if (o.motif === "art") {
        // Свой рисунок: без допустимых фигур слоя нет.
        const art = sanitizeDrawing(o.art);
        return art ? (clean({ ...b, kind: "decor" as const, motif: "art" as const, color: color(o.color, "#B8925A"), accent: colorOrNull(o.accent) ?? undefined, art }) as DecorLayer) : null;
      }
      return DECOR_IDS.includes(o.motif as never) ? (clean({ ...b, kind: "decor" as const, motif: o.motif, color: color(o.color, "#B8925A") }) as DecorLayer) : null;
    }
    default:
      return null;
  }
}

function background(raw: unknown): CoverBackground {
  const o = obj(raw);
  if (o?.kind === "color") return { kind: "color", color: color(o.color, "#F4EEE6") };
  if (o?.kind === "gradient") return { kind: "gradient", from: color(o.from, "#F4EEE6"), to: color(o.to, "#D9C7B3"), angle: clamp(o.angle, 0, 360, 90) };
  return { kind: "template" };
}

/** Обложка из слоёв из базы или запроса; не объект — null (обложка шаблона). Повторяющиеся и неверные id заменяются. */
export function parseCoverDesign(raw: unknown): CoverDesign | null {
  const o = obj(raw);
  if (!o) return null;
  const list = Array.isArray(o.layers) ? o.layers.slice(0, COVER_LIMITS.layers) : [];
  const seen = new Set<string>();
  const layers: CoverLayer[] = [];
  list.forEach((l, i) => {
    const want = obj(l)?.id;
    let id = typeof want === "string" && ID.test(want) && !seen.has(want) ? want : `l${i}`;
    while (seen.has(id)) id = `${id}x`.slice(-16);
    const parsed = layer(l, id);
    if (parsed) {
      seen.add(id);
      layers.push(parsed);
    }
  });
  // Свои рисунки — не больше ART_WEIGHT знаков на обложку: хвост лишнего убираем, чтобы запись в базе не разрасталась.
  let weight = 0;
  const kept = layers.filter((l) => {
    if (l.kind !== "decor" || !l.art) return true;
    weight += drawingWeight(l.art);
    return weight <= COVER_LIMITS.artWeight;
  });
  return { v: 1, background: background(o.background), layers: kept };
}

/** Фото книги в слоях обложки. */
export function coverDesignPhotoIds(design: CoverDesign): string[] {
  return [...new Set(design.layers.flatMap((l) => (l.kind === "image" && l.photoId ? [l.photoId] : [])))];
}

/** Удалённое фото уходит из слоёв: место остаётся (со снимком коллекции, если он был). */
export function dropCoverPhoto(design: CoverDesign, photoId: string): CoverDesign {
  return { ...design, layers: design.layers.map((l) => (l.kind === "image" && l.photoId === photoId ? { ...l, photoId: null } : l)) };
}

/** Текст слоя: привязанный — из книги, свой — как есть. */
export function layerText(layer: TextLayer, texts: CoverTexts): string {
  return layer.bind ? texts[layer.bind] : layer.text;
}

/** Слои, которые печатаются: видимые; пустой привязанный текст и место под фото без снимка не печатаются. */
export function printedLayers(design: CoverDesign, texts: CoverTexts): CoverLayer[] {
  return design.layers.filter((l) => {
    if (l.hidden) return false;
    if (l.kind === "text") return !!layerText(l, texts).trim();
    if (l.kind === "image") return !!(l.photoId || l.stock);
    return true;
  });
}

/** Места под фото без снимка — книгу с такой обложкой рано отдавать в печать. */
export function emptyImageLayers(design: CoverDesign): ImageLayer[] {
  return design.layers.filter((l): l is ImageLayer => l.kind === "image" && !l.hidden && !l.photoId && !l.stock);
}

let counter = 0;
/** Новый id слоя, не занятый в дизайне. */
export function newLayerId(design: Pick<CoverDesign, "layers">): string {
  const used = new Set(design.layers.map((l) => l.id));
  let id: string;
  do id = `${Date.now().toString(36).slice(-6)}${(counter++ % 1296).toString(36)}`;
  while (used.has(id));
  return id;
}
