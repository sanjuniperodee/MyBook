/**
 * Геометрия обложки из слоёв: размер крышки, холст редактора с загибом вокруг неё, безопасные поля, рамки слоёв в мм,
 * фигуры слоёв, копии текста для тени и контура и фон-цвет или градиент. Общее для HTML-редактора и PDF.
 */
import { n } from "../covers/svg-kit";
import { print, type BookFormat, type CoverGeometry, type Rect } from "../formats";
import type { Shape } from "../interior-art";
import type { CoverBackground, ShapeLayer, TextStyle } from "./types";

/** Лицевая крышка (картон): как в развёртке для типографии — на кант больше блока сверху, снизу и снаружи. */
export function boardSize(format: BookFormat) {
  const o = print.cover.boardOverhangMm;
  return { w: format.widthMm + o, h: format.heightMm + o * 2 };
}

/**
 * Безопасные поля, мм от края крышки: текст и важное — внутри (край крышки уходит в кант, у корешка — канавка шарнира).
 * Загиб — сколько материала за краем крышки показывает редактор (дальше — под картоном).
 */
export const COVER_SAFE = { edge: 6, hinge: 9, wrap: 8 } as const;

/** Холст редактора: крышка и вокруг неё загиб wrap мм — рисунок шаблона строится так же, как в развёртке. */
export function canvasGeometry(format: BookFormat, wrap: number = COVER_SAFE.wrap): CoverGeometry {
  const b = boardSize(format);
  return { width: b.w + wrap * 2, height: b.h + wrap * 2, front: { x: wrap, y: wrap, w: b.w, h: b.h } };
}

/** Рамка слоя в мм развёртки: доли крышки front. */
export function layerRect(l: { x: number; y: number; w: number; h: number }, front: Rect): Rect {
  return { x: front.x + l.x * front.w, y: front.y + l.y * front.h, w: l.w * front.w, h: l.h * front.h };
}

/** Безопасная зона крышки в долях: слева (у корешка) поле шире. */
export function safeArea(format: BookFormat): Rect {
  const b = boardSize(format);
  const x = COVER_SAFE.hinge / b.w;
  const y = COVER_SAFE.edge / b.h;
  return { x, y, w: 1 - x - COVER_SAFE.edge / b.w, h: 1 - y * 2 };
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

/**
 * Свой фон обложки (цвет или градиент) — SVG-фрагмент на весь холст в мм, как рисунок шаблона. Градиент лежит на
 * лицевой стороне вместе с загибом и канавкой у корешка; корешок и оборот — цветом начала градиента.
 */
export function backgroundArt(bg: Exclude<CoverBackground, { kind: "template" }>, g: CoverGeometry, uid: string): string {
  const base = bg.kind === "color" ? bg.color : bg.from;
  let out = `<rect x="0" y="0" width="${n(g.width)}" height="${n(g.height)}" fill="${base}"/>`;
  if (bg.kind === "gradient") {
    const v = gradientVector(bg.angle);
    const x0 = g.spine ? g.front.x - print.cover.hingeMm : 0;
    out += `<defs><linearGradient id="${uid}bg" x1="${v.x1}" y1="${v.y1}" x2="${v.x2}" y2="${v.y2}"><stop offset="0" stop-color="${bg.from}"/><stop offset="1" stop-color="${bg.to}"/></linearGradient></defs>`;
    out += `<rect x="${n(x0)}" y="0" width="${n(g.width - x0)}" height="${n(g.height)}" fill="url(#${uid}bg)"/>`;
  }
  return out;
}

/** Цвет фона для подсказок контраста (корешок, оборот, текст на нём). */
export const backgroundBase = (bg: CoverBackground) => (bg.kind === "color" ? bg.color : bg.kind === "gradient" ? bg.from : null);

/** Светлый или тёмный текст на фоне цвета bg (корешок и оборот обложки со своим фоном). */
export function inkOn(bg: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(bg.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.55 ? "#1F1A17" : "#FBF7F1";
}
