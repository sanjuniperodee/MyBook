/**
 * Геометрия обложки из слоёв: размер крышки, холст редактора с загибом вокруг неё, безопасные поля, рамки слоёв в мм,
 * фигуры слоёв, копии текста для тени и контура и фон-цвет или градиент. Общее для HTML-редактора и PDF.
 */
import { n } from "../covers/svg-kit";
import { boardOf, print, type BookFormat, type CoverGeometry, type Rect } from "../formats";
import type { Shape } from "../interior-art";
import type { CoverBackground, CoverSide, ShapeLayer, TextStyle } from "./types";

/** Лицевая крышка (картон): как в развёртке для типографии — на кант больше блока сверху, снизу и снаружи. */
export function boardSize(format: BookFormat) {
  return boardOf(format);
}

/**
 * Безопасные поля, мм от края крышки: текст и важное — внутри (край крышки уходит в кант, у корешка — канавка шарнира).
 * Загиб — сколько материала за краем крышки показывает редактор (дальше — под картоном).
 */
export const COVER_SAFE = { edge: 8, hinge: 9, wrap: 8 } as const;

/** Холст редактора: крышка и вокруг неё загиб wrap мм — рисунок шаблона строится так же, как в развёртке. */
export function canvasGeometry(format: BookFormat, wrap: number = COVER_SAFE.wrap): CoverGeometry {
  const b = boardSize(format);
  return { width: b.w + wrap * 2, height: b.h + wrap * 2, front: { x: wrap, y: wrap, w: b.w, h: b.h } };
}

/** Рамка слоя в мм развёртки: доли крышки front. */
export function layerRect(l: { x: number; y: number; w: number; h: number }, front: Rect): Rect {
  return { x: front.x + l.x * front.w, y: front.y + l.y * front.h, w: l.w * front.w, h: l.h * front.h };
}

/** Безопасная зона крышки в долях: у корешка поле шире — у лица он слева, у оборота справа. */
export function safeArea(format: BookFormat, side: CoverSide = "front"): Rect {
  const b = boardSize(format);
  const hinge = COVER_SAFE.hinge / b.w;
  const edge = COVER_SAFE.edge / b.w;
  const y = COVER_SAFE.edge / b.h;
  return { x: side === "back" ? edge : hinge, y, w: 1 - hinge - edge, h: 1 - y * 2 };
}

// ─── текст: тень и контур ───────────────────────────────────────────────────

/** Сколько копий рисует контур: по кругу через равные углы — в PDF настоящего контура букв нет. */
export const OUTLINE_STEPS = 12;

/**
 * Копии текста под основным, em кегля: тень (одна, сдвинутая) и контур (OUTLINE_STEPS копий по кругу). Порядок —
 * снизу вверх. Так же их рисует HTML (text-shadow без размытия), поэтому редактор и печать совпадают.
 */
export function textCopies(style: Pick<TextStyle, "shadow" | "outline">): { dx: number; dy: number; color: string; opacity: number }[] {
  const out: { dx: number; dy: number; color: string; opacity: number }[] = [];
  if (style.shadow) out.push({ dx: style.shadow.x, dy: style.shadow.y, color: style.shadow.color, opacity: style.shadow.opacity ?? 1 });
  if (style.outline && style.outline.width > 0)
    for (let i = 0; i < OUTLINE_STEPS; i++) {
      const a = (i / OUTLINE_STEPS) * Math.PI * 2;
      out.push({ dx: Math.cos(a) * style.outline.width, dy: Math.sin(a) * style.outline.width, color: style.outline.color, opacity: 1 });
    }
  return out;
}

// ─── фигуры ────────────────────────────────────────────────────────────────

const rectPath = (x: number, y: number, w: number, h: number, r = 0) => {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  if (!rr) return `M${n(x)},${n(y)} H${n(x + w)} V${n(y + h)} H${n(x)}Z`;
  return `M${n(x + rr)},${n(y)} H${n(x + w - rr)} A${n(rr)},${n(rr)} 0 0 1 ${n(x + w)},${n(y + rr)} V${n(y + h - rr)} A${n(rr)},${n(rr)} 0 0 1 ${n(x + w - rr)},${n(y + h)} H${n(x + rr)} A${n(rr)},${n(rr)} 0 0 1 ${n(x)},${n(y + h - rr)} V${n(y + rr)} A${n(rr)},${n(rr)} 0 0 1 ${n(x + rr)},${n(y)}Z`;
};

const ellipsePath = (cx: number, cy: number, rx: number, ry: number) =>
  `M${n(cx - rx)},${n(cy)} A${n(rx)},${n(ry)} 0 1 0 ${n(cx + rx)},${n(cy)} A${n(rx)},${n(ry)} 0 1 0 ${n(cx - rx)},${n(cy)}Z`;

/** Арка: прямоугольник со скруглённым в полукруг верхом. */
const archPath = (x: number, y: number, w: number, h: number) => {
  const r = Math.min(w / 2, h);
  return `M${n(x)},${n(y + h)} V${n(y + r)} A${n(r)},${n(r)} 0 0 1 ${n(x + w)},${n(y + r)} V${n(y + h)}Z`;
};

/** Ключ заливки-градиента: рендерер подставляет вместо него свой url(#…) с линейным градиентом. */
export const GRADIENT_FILL = "gradient";

/** Направление градиента в долях рамки: angle 0 — слева направо, 90 — сверху вниз. */
export function gradientVector(angle: number) {
  const a = (angle * Math.PI) / 180;
  const c = Math.cos(a) / 2;
  const s = Math.sin(a) / 2;
  return { x1: n(0.5 - c), y1: n(0.5 - s), x2: n(0.5 + c), y2: n(0.5 + s) };
}

/**
 * Фигура слоя в мм его рамки (0…w, 0…h). Толщина линий — доля ширины крышки boardW. Заливка градиентом помечена
 * fill = GRADIENT_FILL — цвета и направление рендерер берёт из слоя.
 */
export function shapeElements(layer: ShapeLayer, w: number, h: number, boardW: number): Shape[] {
  const sw = (layer.strokeWidth ?? (layer.shape === "line" || layer.shape === "frame" || layer.shape === "double" || layer.shape === "corners" ? 0.004 : 0)) * boardW;
  const stroke = layer.stroke ?? (layer.shape === "line" || layer.shape === "frame" || layer.shape === "double" || layer.shape === "corners" ? (layer.fill ?? "#1F1A17") : undefined);
  const fill = layer.gradient && layer.fill ? GRADIENT_FILL : (layer.fill ?? undefined);
  const strokeProps = stroke && sw > 0 ? { stroke, width: n(sw) } : {};
  const r = (layer.radius ?? 0) * Math.min(w, h);
  switch (layer.shape) {
    case "rect":
      return [{ kind: "path", d: rectPath(sw / 2, sw / 2, w - sw, h - sw, r), fill, ...strokeProps }];
    case "ellipse":
      return [{ kind: "path", d: ellipsePath(w / 2, h / 2, w / 2 - sw / 2, h / 2 - sw / 2), fill, ...strokeProps }];
    case "arch":
      return [{ kind: "path", d: archPath(sw / 2, sw / 2, w - sw, h - sw), fill, ...strokeProps }];
    case "line":
      return [{ kind: "path", d: `M0,${n(h / 2)} H${n(w)}`, stroke: stroke ?? "#1F1A17", width: n(Math.max(sw, 0.1)) }];
    case "frame":
      return [{ kind: "path", d: rectPath(sw / 2, sw / 2, w - sw, h - sw, r), ...strokeProps }];
    case "double": {
      const gap = sw * 3;
      return [
        { kind: "path", d: rectPath(sw / 2, sw / 2, w - sw, h - sw, r), ...strokeProps },
        { kind: "path", d: rectPath(gap + sw / 2, gap + sw / 2, w - gap * 2 - sw, h - gap * 2 - sw, Math.max(0, r - gap)), ...strokeProps, width: n(sw * 0.6) },
      ];
    }
    case "corners": {
      const len = Math.min(w, h) * 0.22;
      const o = sw / 2;
      const d = [
        `M${n(o)},${n(o + len)} V${n(o)} H${n(o + len)}`,
        `M${n(w - o - len)},${n(o)} H${n(w - o)} V${n(o + len)}`,
        `M${n(w - o)},${n(h - o - len)} V${n(h - o)} H${n(w - o - len)}`,
        `M${n(o + len)},${n(h - o)} H${n(o)} V${n(h - o - len)}`,
      ].join(" ");
      return [{ kind: "path", d, ...strokeProps, round: true }];
    }
  }
}

// ─── фон ───────────────────────────────────────────────────────────────────

type OwnBackground = Exclude<CoverBackground, { kind: "template" }>;

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
/** Цвет между a и b: t от 0 до 1 — как интерполирует SVG-градиент (в sRGB). */
export function mixColor(a: string, b: string, t: number) {
  const [x, y] = [rgb(a), rgb(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * Math.min(1, Math.max(0, t))).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

/**
 * Доля градиента в точке (u, v) рамки в долях — как у SVG-градиента в единицах рамки (objectBoundingBox): проекция на
 * его вектор, за концами — крайние цвета.
 */
function gradientAt(angle: number, u: number, v: number) {
  const g = gradientVector(angle);
  const [dx, dy] = [g.x2 - g.x1, g.y2 - g.y1];
  const len = dx * dx + dy * dy;
  return len ? Math.min(1, Math.max(0, ((u - g.x1) * dx + (v - g.y1) * dy) / len)) : 0;
}

/** Зеркальный угол градиента (слева направо ↔ справа налево): оборот повторяет лицо от корешка. */
export const mirrorAngle = (angle: number) => (((180 - angle) % 360) + 360) % 360;

const gradientRect = (bg: Extract<CoverBackground, { kind: "gradient" }>, angle: number, r: Rect, id: string) => {
  const v = gradientVector(angle);
  return `<defs><linearGradient id="${id}" x1="${v.x1}" y1="${v.y1}" x2="${v.x2}" y2="${v.y2}"><stop offset="0" stop-color="${bg.from}"/><stop offset="1" stop-color="${bg.to}"/></linearGradient></defs><rect x="${n(r.x)}" y="${n(r.y)}" width="${n(r.w)}" height="${n(r.h)}" fill="url(#${id})"/>`;
};

/** Корешок между крышками: цвет края соседней крышки сверху вниз (u — сторона рамки крышки у корешка: 0 — левая, 1 — правая). */
function spineArt(bg: OwnBackground, angle: number, u: number, g: CoverGeometry, id: string) {
  if (!g.spine) return "";
  const r = { x: g.spine.x, y: 0, w: g.spine.w, h: g.height };
  if (bg.kind === "color") return `<rect x="${n(r.x)}" y="0" width="${n(r.w)}" height="${n(r.h)}" fill="${bg.color}"/>`;
  const [top, bottom] = [gradientAt(angle, u, 0), gradientAt(angle, u, 1)].map((t) => mixColor(bg.from, bg.to, t));
  return `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs><rect x="${n(r.x)}" y="0" width="${n(r.w)}" height="${n(r.h)}" fill="url(#${id})"/>`;
}

/** Части развёртки под свой фон: оборот — с левым загибом и шарниром, лицо — с шарниром и правым загибом. */
export function spreadPanels(g: CoverGeometry) {
  const hinge = print.cover.hingeMm;
  const front = g.spine ? { x: g.front.x - hinge, y: 0, w: g.width - (g.front.x - hinge), h: g.height } : { x: 0, y: 0, w: g.width, h: g.height };
  const back = g.back ? { x: 0, y: 0, w: g.back.x + g.back.w + hinge, h: g.height } : null;
  return { front, back };
}

/**
 * Свой фон обложки (цвет или градиент) — SVG-фрагмент на весь холст в мм, как рисунок шаблона. Градиент лежит на
 * лицевой стороне вместе с загибом и канавкой у корешка; на развёртке оборот — тот же градиент зеркально, а корешок —
 * цветом края лица, поэтому книга целиком без шва.
 */
export function backgroundArt(bg: OwnBackground, g: CoverGeometry, uid: string): string {
  const base = bg.kind === "color" ? bg.color : bg.from;
  let out = `<rect x="0" y="0" width="${n(g.width)}" height="${n(g.height)}" fill="${base}"/>`;
  if (bg.kind === "gradient") {
    const p = spreadPanels(g);
    out += gradientRect(bg, bg.angle, p.front, `${uid}bg`);
    if (p.back) out += gradientRect(bg, mirrorAngle(bg.angle), p.back, `${uid}bgb`) + spineArt(bg, bg.angle, 0, g, `${uid}bgs`);
  }
  return out;
}

/**
 * Свой фон оборота поверх развёртки: задняя крышка с загибом и шарниром и корешок — цветом её края у корешка. Градиент —
 * как его видит редактор оборота (угол 0 — слева направо по задней крышке).
 */
export function backOwnArt(bg: OwnBackground, g: CoverGeometry, uid: string): string {
  const p = spreadPanels(g);
  if (!p.back) return "";
  const panel = bg.kind === "color" ? `<rect x="0" y="0" width="${n(p.back.w)}" height="${n(p.back.h)}" fill="${bg.color}"/>` : gradientRect(bg, bg.angle, p.back, `${uid}ob`);
  return panel + spineArt(bg, bg.kind === "gradient" ? bg.angle : 0, 1, g, `${uid}os`);
}

/** Цвет фона для подсказок контраста (корешок, оборот, текст на нём): у градиента — его середина. */
export const backgroundBase = (bg: CoverBackground) => (bg.kind === "color" ? bg.color : bg.kind === "gradient" ? bg.from : null);

/** Средний цвет фона — по нему светлый или тёмный текст поверх (у градиента — середина). */
export const backgroundMid = (bg: OwnBackground) => (bg.kind === "color" ? bg.color : mixColor(bg.from, bg.to, 0.5));

/** Светлый или тёмный текст на фоне цвета bg (корешок и оборот обложки со своим фоном). */
export function inkOn(bg: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(bg.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.55 ? "#1F1A17" : "#FBF7F1";
}
