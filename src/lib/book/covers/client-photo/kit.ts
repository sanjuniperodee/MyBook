/** Помощники семьи обложек «client-photo»: рамки, свечение, тонировка, карточки. */
import type { CoverTemplate } from "../types";
import { bg, liftShadow, n, photoSlot, type ArtContext } from "../svg-kit";
import type { CoverGeometry, Rect } from "../../formats";
import { SPARKLE } from "../../motifs";

/** Область текста на обороте — по центру крышки. */
export const BACK_AREA: Rect = { x: 0.14, y: 0.27, w: 0.72, h: 0.46 };

export function rectFrame(f: Rect, inset: number, stroke: string, width: number, opacity = 1) {
  return `<rect x="${n(f.x + inset)}" y="${n(f.y + inset)}" width="${n(f.w - inset * 2)}" height="${n(f.h - inset * 2)}" fill="none" stroke="${stroke}" stroke-width="${width}"${opacity < 1 ? ` stroke-opacity="${opacity}"` : ""}/>`;
}

export function ellipsePath(cx: number, cy: number, rx: number, ry: number) {
  return `M${n(cx - rx)},${n(cy)} A${n(rx)},${n(ry)} 0 1 0 ${n(cx + rx)},${n(cy)} A${n(rx)},${n(ry)} 0 1 0 ${n(cx - rx)},${n(cy)}Z`;
}

export const rectPath = (r: Rect) => `M${n(r.x)},${n(r.y)} h${n(r.w)} v${n(r.h)} h${n(-r.w)}Z`;

/** Лицо с загибами: снимок «во всю» уходит за край крышки сверху, снизу и справа. */
export const bleedRect = (g: CoverGeometry): Rect => ({ x: g.front.x, y: 0, w: g.width - g.front.x, h: g.height });

/** Четырёхлучевая звёздочка-блик. */
export const sparkle = (cx: number, cy: number, s: number, fill: string) => `<path d="${SPARKLE}" fill="${fill}" transform="translate(${n(cx - s / 2)},${n(cy - s / 2)}) scale(${n(s)})"/>`;

/** «Фольга»: золотой градиент поперёк лица — металл переливается, а не лежит плоской краской. */
export function foil(id: string, f: Rect, stops = ["#F4E2A8", "#C9A45C", "#8C6A2F", "#DCC07E", "#F2DD9E", "#B08A45"]) {
  return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${n(f.x)}" y1="${n(f.y)}" x2="${n(f.x + f.w)}" y2="${n(f.y + f.h)}">${stops.map((c, i) => `<stop offset="${n(i / (stops.length - 1))}" stop-color="${c}"/>`).join("")}</linearGradient>`;
}

/** Вертикальный градиент на весь холст. */
export function vGradient(id: string, stops: [number, string, number?][]) {
  return `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">${stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a !== undefined ? ` stop-opacity="${a}"` : ""}/>`).join("")}</linearGradient>`;
}

/** Затемнение по высоте поверх снимка «во всю» — под текст. */
export function shade(g: CoverGeometry, id: string, stops: [number, string, number][]) {
  const r = bleedRect(g);
  return `<defs>${vGradient(id, stops)}</defs><rect x="${n(r.x)}" y="0" width="${n(r.w)}" height="${n(g.height)}" fill="url(#${id})"/>`;
}

/** Мягкое радиальное свечение (свет лампы, блик плёнки). */
export function glow(id: string, cx: number, cy: number, r: number, color: string, opacity: number, rect: Rect) {
  return `<defs><radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}"><stop offset="0" stop-color="${color}" stop-opacity="${opacity}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient></defs><rect x="${n(rect.x)}" y="${n(rect.y)}" width="${n(rect.w)}" height="${n(rect.h)}" fill="url(#${id})"/>`;
}

export function duotoneFilter(id: string, stops: string[]) {
  const channels = (hex: string) => [1, 3, 5].map((i) => n(parseInt(hex.slice(i, i + 2), 16) / 255));
  const c = stops.map(channels);
  const table = (k: number) => c.map((x) => x[k]).join(" ");
  return `<filter id="${id}" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0 0 0 1 0"/><feComponentTransfer><feFuncR type="table" tableValues="${table(0)}"/><feFuncG type="table" tableValues="${table(1)}"/><feFuncB type="table" tableValues="${table(2)}"/></feComponentTransfer></filter>`;
}

/**
 * Карточка-полароид с фото: белое поле, снимок, тонкая кромка, тень. Возвращает разметку и прямоугольник карточки.
 * deg — поворот вокруг центра карточки; его же получает редактор кадра.
 */
export function polaroidCard(ctx: ArtContext, slot: number, cx: number, cy: number, cw: number, deg: number, opts: { scene?: number; uid: string; ratio?: number }) {
  const pad = cw * 0.06;
  const pw = cw - pad * 2;
  const ph = pw / (opts.ratio ?? 1);
  const bottom = cw * 0.23;
  const ch = pad + ph + bottom;
  const card = { x: cx - cw / 2, y: cy - ch / 2, w: cw, h: ch };
  const rot = `rotate(${n(deg)} ${n(cx)} ${n(cy)})`;
  let out = liftShadow(card, opts.uid, { transform: rot });
  out += `<g transform="${rot}"><rect x="${n(card.x)}" y="${n(card.y)}" width="${n(cw)}" height="${n(ch)}" fill="#FCFBF7"/>`;
  const img = { x: card.x + pad, y: card.y + pad, w: pw, h: ph };
  out += photoSlot(ctx, slot, img, { scene: opts.scene, rotate: { deg, cx, cy } });
  // Еле заметная внутренняя тень по краю снимка — как у настоящей фотобумаги.
  out += `<rect x="${n(img.x)}" y="${n(img.y)}" width="${n(pw)}" height="${n(ph)}" fill="none" stroke="#000" stroke-opacity="0.12" stroke-width="0.25"/>`;
  out += `<rect x="${n(card.x)}" y="${n(card.y)}" width="${n(cw)}" height="${n(ch)}" fill="none" stroke="#000" stroke-opacity="0.06" stroke-width="0.2"/></g>`;
  return { svg: out, card, rot, bottom, pad, pw, ph };
}

// ─── Арка: фото в арочном окне, за ним терракотовая арка-тень ────────────────

export function archPath(x: number, y: number, w: number, h: number) {
  const r = w / 2;
  return `M${n(x)},${n(y + h)} L${n(x)},${n(y + r)} A${n(r)},${n(r)} 0 0 1 ${n(x + w)},${n(y + r)} L${n(x + w)},${n(y + h)}Z`;
}

// ─── Дуотон и Индиго: фото в два цвета ───────────────────────────────────────

export function duo(id: string, stops: string[], base: string, swatch: string, sample: string, text: { title: string; soft: string }): CoverTemplate {
  return {
    id,
    mood: "photo",
    requiresPhoto: true,
    samples: [sample],
    texture: { kind: "grain", opacity: 0.1 },
    swatch,
    art: (g, ctx) => {
      const { uid } = ctx;
      let out = `<defs>${duotoneFilter(`${uid}duo`, stops)}</defs>${bg(g, base)}`;
      out += photoSlot(ctx, 0, bleedRect(g), { scene: 3, filter: `${uid}duo` });
      out += shade(g, `${uid}sh`, [
        [0.5, stops[0], 0],
        [1, stops[0], 0.8],
      ]);
      return out;
    },
    textArea: { x: 0.09, y: 0.6, w: 0.82, h: 0.33 },
    justify: "end",
    title: { font: "playfair", size: 0.112, color: text.title, weight: 400, italic: true, lineHeight: 1.0 },
    subtitle: { font: "playfair", size: 0.043, color: text.soft, italic: true },
    names: { font: "montserrat", size: 0.023, color: text.soft, weight: 500, upper: true, tracking: 0.3 },
    ornament: { kind: "line", color: text.soft },
    spine: { color: text.title, font: "playfair" },
    back: { color: text.soft, font: "playfair", area: BACK_AREA },
  };
}
