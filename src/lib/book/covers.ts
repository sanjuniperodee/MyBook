/**
 * Шаблоны обложек. Графика генерируется в SVG (единицы — миллиметры), поэтому одна и та же
 * функция рисует и превью на сайте, и развёртку для типографии в 300 dpi.
 * Текст (название, имена) накладывается поверх: HTML на сайте и векторный текст в PDF.
 */
import type { CoverGeometry, Rect } from "./formats";
import { collectionTemplates } from "./covers-collection";
import { photoCollection } from "./covers-photo";
import { activeCustomCovers, customCover } from "./cover-registry";
import type { PhotoLayout } from "./photo-cover";
import { bg, frontRect, grainFilter, jitterGrid, label, linenFilter, n, petalPath, rng, shadowFilter } from "./cover-kit";
import { HEART } from "./motifs";
import type { FontKey } from "./fonts";

export interface CoverTextStyle {
  font: FontKey;
  /** Кегль как доля ширины лицевой стороны. */
  size: number;
  color: string;
  weight?: number;
  italic?: boolean;
  upper?: boolean;
  /** Трекинг в em. */
  tracking?: number;
  lineHeight?: number;
}

export interface ArtContext {
  uid: string;
  /** Фото клиента — для шаблона «Ваше фото». */
  photoHref?: string;
  /** Снимок самого шаблона (обложки на фото): data-URL для растрирования, иначе — адрес /api/cover-photos. */
  imageHref?: string;
  /** "decor" — только плашка и рамка: так оборот повторяет композицию лица, не рисуя снимок второй раз. */
  layer?: "decor";
}

export type CoverMood = "romance" | "tender" | "classic" | "bright" | "photo";

export const coverMoods: CoverMood[] = ["romance", "tender", "classic", "bright", "photo"];

export interface CoverTemplate {
  id: string;
  /** Название из CRM (у встроенных — в словарях i18n, catalog.covers). */
  name?: { ru: string; kk: string };
  /** Обложка на снимке: раскладка снимка (src/lib/book/photo-cover.ts). */
  photo?: PhotoLayout;
  /** Шаблон из CRM и его версия — для сброса кэша картинок. */
  custom?: boolean;
  rev?: number;
  /** Не показывать в выборе (книги с этой обложкой печатаются как раньше). */
  hidden?: boolean;
  /** Настроение — для фильтра в выборе обложки. */
  mood: CoverMood;
  /** CSS-фон для миниатюры в выборе шаблона. */
  swatch: string;
  requiresPhoto?: boolean;
  /** Фактура поверх графики. В PDF накладывается отдельно (быстрее, чем SVG-фильтр в 300 dpi). */
  texture?: { kind: "grain" | "linen"; opacity: number };
  art: (g: CoverGeometry, ctx: ArtContext) => string;
  /** Область текста в долях лицевой стороны. */
  textArea: Rect;
  justify: "center" | "start" | "end";
  title: CoverTextStyle;
  subtitle: CoverTextStyle;
  names: CoverTextStyle;
  ornament?: { kind: "line" | "heart" | "star" | "dots"; color: string };
  spine: { color: string; font: FontKey };
  /**
   * Задняя сторона. mirror — повторить композицию лица (плашку, рамку, марку): текст ложится туда же,
   * где на лице название. Иначе — свой спокойный фон из art, а текст — в области area (доли задней крышки).
   */
  back: { color: string; font: FontKey; mirror?: boolean; area?: Rect };
}

// ─── шаблоны ────────────────────────────────────────────────────────────────

const linen: CoverTemplate = {
  id: "linen",
  mood: "classic",
  texture: { kind: "linen", opacity: 0.35 },
  swatch: "linear-gradient(135deg,#ece4d6,#ddd2bf)",
  art: (g, { uid }) => {
    const r = frontRect(g, 0.2, 0.3, 0.6, 0.36);
    return `<defs>${shadowFilter(`${uid}s`)}</defs>${bg(g, "#E6DDCD")}${label(r, "#F7F3EC", { stroke: "#CDBFA8", shadowId: `${uid}s` })}`;
  },
  textArea: { x: 0.23, y: 0.32, w: 0.54, h: 0.32 },
  justify: "center",
  title: { font: "cormorant", size: 0.078, color: "#3A2F26", weight: 500, lineHeight: 1.1 },
  subtitle: { font: "cormorant", size: 0.042, color: "#6B5B4B", italic: true },
  names: { font: "cormorant", size: 0.04, color: "#6B5B4B", italic: true },
  ornament: { kind: "line", color: "#B9A88E" },
  spine: { color: "#3A2F26", font: "cormorant" },
  back: { color: "#6B5B4B", font: "cormorant", mirror: true },
};

const blossom: CoverTemplate = {
  id: "blossom",
  mood: "romance",
  texture: { kind: "grain", opacity: 0.12 },
  swatch: "radial-gradient(circle at 30% 30%,#e8b4b8 0 18%,transparent 19%),radial-gradient(circle at 70% 65%,#b5545c 0 20%,transparent 21%),#2a1a1f",
  art: (g, { uid }) => {
    const rand = rng(11);
    const palettes = [
      ["#F4DCD6", "#E8B4B8", "#D38C95", "#A94E5B"],
      ["#F3E3D8", "#E6C2B4", "#CD8F85", "#8E3B45"],
      ["#E9A6AE", "#D2717F", "#A8414F", "#6E1F2B"],
      ["#F6EBE3", "#EAD1C6", "#D7A9A0", "#B06A6C"],
    ];
    let leaves = "";
    let flowers = "";
    for (const p of jitterGrid(g, 30, rand)) {
      const R = 9 + rand() * 8;
      const rot = rand() * 360;
      for (let i = 0; i < 3; i++) {
        const a = rot + i * 120 + rand() * 40;
        const lr = R * (1.35 + rand() * 0.4);
        const c = rand() > 0.5 ? "#3F4A36" : "#56624A";
        leaves += `<path d="${petalPath(lr, 0.3)}" fill="${c}" transform="translate(${n(p.x)},${n(p.y)}) rotate(${n(a)})"/>`;
      }
      const pal = palettes[Math.floor(rand() * palettes.length)];
      let fl = "";
      const layers = 4;
      for (let l = 0; l < layers; l++) {
        const lr = R * (1 - l * 0.22);
        const count = 7 - l;
        const off = rand() * 360;
        for (let k = 0; k < count; k++) {
          fl += `<path d="${petalPath(lr, 0.55)}" fill="${pal[l]}" fill-opacity="0.96" transform="rotate(${n(off + (k * 360) / count)})"/>`;
        }
      }
      fl += `<circle r="${n(R * 0.13)}" fill="${pal[3]}"/>`;
      flowers += `<g transform="translate(${n(p.x)},${n(p.y)})">${fl}</g>`;
    }
    const r = frontRect(g, 0.22, 0.32, 0.56, 0.34);
    return `<defs>${shadowFilter(`${uid}s`)}</defs>${bg(g, "#2A1A1F")}${leaves}${flowers}${label(r, "#EFE9DF", { stroke: "#CFC3B0", shadowId: `${uid}s` })}`;
  },
  textArea: { x: 0.25, y: 0.34, w: 0.5, h: 0.3 },
  justify: "center",
  title: { font: "cormorant", size: 0.075, color: "#3B2A2C", weight: 500, lineHeight: 1.1 },
  subtitle: { font: "cormorant", size: 0.04, color: "#6E5456", italic: true },
  names: { font: "cormorant", size: 0.038, color: "#6E5456", italic: true },
  ornament: { kind: "heart", color: "#A94E5B" },
  spine: { color: "#EFE9DF", font: "cormorant" },
  back: { color: "#EFE9DF", font: "cormorant", mirror: true },
};

const midnight: CoverTemplate = {
  id: "midnight",
  mood: "romance",
  texture: { kind: "grain", opacity: 0.1 },
  swatch: "radial-gradient(circle at 20% 30%,#e8d9b0 0 2%,transparent 3%),radial-gradient(circle at 70% 60%,#e8d9b0 0 1.5%,transparent 2.5%),linear-gradient(160deg,#141b33,#243258)",
  art: (g, { uid }) => {
    const rand = rng(23);
    let stars = "";
    const count = Math.round((g.width * g.height) / 55);
    for (let i = 0; i < count; i++) {
      const x = rand() * g.width;
      const y = rand() * g.height;
      const r = 0.12 + Math.pow(rand(), 3) * 0.55;
      stars += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="#EFE2BF" fill-opacity="${n(0.25 + rand() * 0.7)}"/>`;
    }
    const f = g.front;
    const frame = (i: number, w: number) =>
      `<rect x="${n(f.x + i)}" y="${n(f.y + i)}" width="${n(f.w - i * 2)}" height="${n(f.h - i * 2)}" fill="none" stroke="#C9A96E" stroke-width="${w}"/>`;
    return `<defs><linearGradient id="${uid}bg" x1="0" y1="0" x2="0.3" y2="1"><stop offset="0" stop-color="#121932"/><stop offset="1" stop-color="#26345C"/></linearGradient></defs><rect width="${n(g.width)}" height="${n(g.height)}" fill="url(#${uid}bg)"/>${stars}${frame(9, 0.45)}${frame(10.6, 0.2)}`;
  },
  textArea: { x: 0.14, y: 0.24, w: 0.72, h: 0.5 },
  justify: "center",
  title: { font: "cormorant", size: 0.1, color: "#E9D5A6", weight: 500, italic: true, lineHeight: 1.05 },
  subtitle: { font: "cormorant", size: 0.045, color: "#D8C08E", italic: true },
  names: { font: "montserrat", size: 0.026, color: "#C9A96E", weight: 500, upper: true, tracking: 0.28 },
  ornament: { kind: "star", color: "#C9A96E" },
  spine: { color: "#E9D5A6", font: "cormorant" },
  back: { color: "#D8C08E", font: "cormorant", mirror: true },
};

const sage: CoverTemplate = {
  id: "sage",
  mood: "tender",
  texture: { kind: "grain", opacity: 0.12 },
  swatch: "linear-gradient(160deg,#b8c0a8,#9fab8f)",
  art: (g) => {
    const rand = rng(5);
    let branches = "";
    const spacing = 24;
    for (let x0 = -10; x0 < g.width + 10; x0 += spacing * (0.7 + rand() * 0.6)) {
      const h = g.height * (0.35 + rand() * 0.3);
      const bend = (rand() - 0.5) * 30;
      const y0 = g.height + 2;
      const cx = x0 + bend;
      const x1 = x0 + bend * 0.6;
      const y1 = y0 - h;
      branches += `<path d="M${n(x0)},${n(y0)} Q${n(cx)},${n(y0 - h * 0.55)} ${n(x1)},${n(y1)}" fill="none" stroke="#EEF1E6" stroke-width="0.45" stroke-opacity="0.8"/>`;
      const leaves = 6 + Math.floor(rand() * 5);
      for (let i = 1; i <= leaves; i++) {
        const t = i / (leaves + 1);
        // точка на квадратичной кривой
        const px = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * cx + t * t * x1;
        const py = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * (y0 - h * 0.55) + t * t * y1;
        const side = i % 2 ? 1 : -1;
        const len = (7 + rand() * 4) * (1 - t * 0.45);
        const ang = -90 + side * (38 + rand() * 18);
        branches += `<path d="${petalPath(len, 0.32)}" fill="none" stroke="#EEF1E6" stroke-width="0.4" stroke-opacity="0.8" transform="translate(${n(px)},${n(py)}) rotate(${n(ang)})"/>`;
      }
    }
    return `${bg(g, "#AEB89D")}${branches}`;
  },
  textArea: { x: 0.1, y: 0.1, w: 0.8, h: 0.34 },
  justify: "center",
  title: { font: "cormorant", size: 0.105, color: "#2E3A28", weight: 600, lineHeight: 1.02 },
  subtitle: { font: "cormorant", size: 0.045, color: "#3F4D37", italic: true },
  names: { font: "cormorant", size: 0.045, color: "#3F4D37", italic: true },
  ornament: { kind: "dots", color: "#3F4D37" },
  spine: { color: "#2E3A28", font: "cormorant" },
  back: { color: "#2E3A28", font: "cormorant", area: { x: 0.12, y: 0.1, w: 0.76, h: 0.36 } },
};

const terracotta: CoverTemplate = {
  id: "terracotta",
  mood: "bright",
  texture: { kind: "grain", opacity: 0.16 },
  swatch: "radial-gradient(circle at 50% 110%,#f3d9b8 0 30%,#e9b48a 31% 40%,#8f3e27 41% 50%,transparent 51%),#c9724f",
  art: (g) => {
    const f = g.front;
    const colors = ["#8F3E27", "#E9B48A", "#F3D9B8", "#B85A3B", "#F7E6D0"];
    const arches = (cx: number, baseY: number, maxR: number, step: number) => {
      let out = "";
      let i = 0;
      for (let r = maxR; r > step * 0.8; r -= step, i++) {
        out += `<path d="M${n(cx - r)},${n(baseY)} A${n(r)},${n(r)} 0 0 1 ${n(cx + r)},${n(baseY)} Z" fill="${colors[i % colors.length]}"/>`;
      }
      return out;
    };
    const baseY = g.height + 0.5;
    let out = `${bg(g, "#C9724F")}`;
    out += `<circle cx="${n(f.x + f.w * 0.76)}" cy="${n(f.y + f.h * 0.5)}" r="${n(f.w * 0.1)}" fill="#F2C48D"/>`;
    out += arches(f.x + f.w * 0.42, baseY, f.w * 0.62, f.w * 0.075);
    if (g.back) out += arches(g.back.x + g.back.w * 0.25, baseY, g.back.w * 0.3, g.back.w * 0.05);
    return out;
  },
  textArea: { x: 0.1, y: 0.09, w: 0.8, h: 0.32 },
  justify: "start",
  title: { font: "playfair", size: 0.098, color: "#FBF1E4", weight: 400, lineHeight: 1.08 },
  subtitle: { font: "playfair", size: 0.042, color: "#FBE7CF", italic: true },
  names: { font: "montserrat", size: 0.027, color: "#FBE7CF", weight: 500, upper: true, tracking: 0.22 },
  spine: { color: "#FBF1E4", font: "playfair" },
  back: { color: "#FBF1E4", font: "playfair", area: { x: 0.12, y: 0.12, w: 0.76, h: 0.4 } },
};

const noir: CoverTemplate = {
  id: "noir",
  mood: "classic",
  texture: { kind: "grain", opacity: 0.18 },
  swatch: "linear-gradient(160deg,#1a1a1a,#0d0d0d)",
  art: (g) => {
    const f = g.front;
    const i = 11;
    const c = { x: f.x + f.w / 2, y: f.y + i };
    return `${bg(g, "#131313")}<rect x="${n(f.x + i)}" y="${n(f.y + i)}" width="${n(f.w - i * 2)}" height="${n(f.h - i * 2)}" fill="none" stroke="#B8975A" stroke-width="0.3"/><rect x="${n(c.x - 1.6)}" y="${n(c.y - 1.6)}" width="3.2" height="3.2" fill="#131313" stroke="#B8975A" stroke-width="0.3" transform="rotate(45 ${n(c.x)} ${n(c.y)})"/><rect x="${n(c.x - 1.6)}" y="${n(f.y + f.h - i - 1.6)}" width="3.2" height="3.2" fill="#131313" stroke="#B8975A" stroke-width="0.3" transform="rotate(45 ${n(c.x)} ${n(f.y + f.h - i)})"/>`;
  },
  textArea: { x: 0.15, y: 0.2, w: 0.7, h: 0.6 },
  justify: "center",
  title: { font: "playfair", size: 0.105, color: "#E8D2A2", weight: 400, italic: true, lineHeight: 1.08 },
  subtitle: { font: "playfair", size: 0.04, color: "#CDB27A", italic: true },
  names: { font: "montserrat", size: 0.025, color: "#B8975A", weight: 500, upper: true, tracking: 0.32 },
  ornament: { kind: "line", color: "#B8975A" },
  spine: { color: "#E8D2A2", font: "playfair" },
  back: { color: "#CDB27A", font: "playfair", mirror: true },
};

const hearts: CoverTemplate = {
  id: "hearts",
  mood: "romance",
  texture: { kind: "grain", opacity: 0.12 },
  swatch: "radial-gradient(ellipse at 50% 50%,#f6e9e1 0 30%,transparent 31%),#8b1e2d",
  art: (g, { uid }) => {
    const s = 7;
    const step = 13;
    let out = `<defs><path id="${uid}h" d="${HEART}"/>${shadowFilter(`${uid}s`)}</defs>${bg(g, "#8B1E2D")}<g fill="none" stroke="#B53B4C">`;
    let row = 0;
    for (let y = -step; y < g.height + step; y += step * 0.9, row++) {
      for (let x = -step + (row % 2 ? step / 2 : 0); x < g.width + step; x += step) {
        out += `<use href="#${uid}h" transform="translate(${n(x)},${n(y)}) scale(${s})" stroke-width="${n(0.35 / s)}"/>`;
      }
    }
    out += `</g>`;
    const f = g.front;
    const cx = f.x + f.w / 2;
    const cy = f.y + f.h * 0.48;
    const rx = f.w * 0.33;
    const ry = Math.min(f.h * 0.23, f.w * 0.3);
    out += `<ellipse cx="${n(cx + 0.4)}" cy="${n(cy + 0.9)}" rx="${n(rx)}" ry="${n(ry)}" fill="#000" opacity="0.3" filter="url(#${uid}s)"/><ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}" fill="#F7EBE3"/><ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx - 2.2)}" ry="${n(ry - 2.2)}" fill="none" stroke="#C98A8F" stroke-width="0.3"/>`;
    return out;
  },
  textArea: { x: 0.24, y: 0.33, w: 0.52, h: 0.3 },
  justify: "center",
  title: { font: "cormorant", size: 0.078, color: "#7A1B28", weight: 600, lineHeight: 1.05 },
  subtitle: { font: "cormorant", size: 0.04, color: "#9A4550", italic: true },
  names: { font: "cormorant", size: 0.04, color: "#9A4550", italic: true },
  ornament: { kind: "heart", color: "#B53B4C" },
  spine: { color: "#F7EBE3", font: "cormorant" },
  back: { color: "#F7EBE3", font: "cormorant", mirror: true },
};

const ocean: CoverTemplate = {
  id: "ocean",
  mood: "bright",
  texture: { kind: "grain", opacity: 0.1 },
  swatch: "linear-gradient(180deg,#1f4e6b,#6fa3b5)",
  art: (g, { uid }) => {
    const rand = rng(8);
    let waves = "";
    const lines = Math.round(g.height / 4.5);
    for (let i = 0; i < lines; i++) {
      const y = g.height * 0.38 + (i / lines) * g.height * 0.7;
      const amp = 1.5 + rand() * 3;
      const len = 26 + rand() * 20;
      const phase = rand() * len;
      let d = `M${n(-phase)},${n(y)}`;
      for (let x = -phase; x < g.width + len; x += len) {
        d += ` q${n(len / 4)},${n(-amp)} ${n(len / 2)},0 t${n(len / 2)},0`;
      }
      waves += `<path d="${d}" fill="none" stroke="#FFFFFF" stroke-width="${n(0.25 + rand() * 0.35)}" stroke-opacity="${n(0.12 + rand() * 0.28)}"/>`;
    }
    return `<defs><linearGradient id="${uid}bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#17405A"/><stop offset="0.55" stop-color="#2D6A86"/><stop offset="1" stop-color="#7FB2C1"/></linearGradient></defs><rect width="${n(g.width)}" height="${n(g.height)}" fill="url(#${uid}bg)"/>${waves}`;
  },
  textArea: { x: 0.1, y: 0.1, w: 0.8, h: 0.3 },
  justify: "center",
  title: { font: "cormorant", size: 0.105, color: "#FFFFFF", weight: 500, italic: true, lineHeight: 1.05 },
  subtitle: { font: "cormorant", size: 0.045, color: "#E3F0F4", italic: true },
  names: { font: "montserrat", size: 0.026, color: "#E3F0F4", weight: 500, upper: true, tracking: 0.25 },
  spine: { color: "#FFFFFF", font: "cormorant" },
  back: { color: "#FFFFFF", font: "cormorant", area: { x: 0.12, y: 0.1, w: 0.76, h: 0.3 } },
};

const terrazzo: CoverTemplate = {
  id: "terrazzo",
  mood: "bright",
  texture: { kind: "grain", opacity: 0.1 },
  swatch: "radial-gradient(circle at 20% 30%,#d9a48f 0 6%,transparent 7%),radial-gradient(circle at 70% 70%,#9db4a8 0 7%,transparent 8%),radial-gradient(circle at 80% 20%,#e4c590 0 5%,transparent 6%),#f1ece4",
  art: (g, { uid }) => {
    const rand = rng(31);
    const colors = ["#D9A48F", "#E4C590", "#9DB4A8", "#C77C6B", "#6D8A96", "#E8D5C4", "#2F3E46"];
    let chips = "";
    const count = Math.round((g.width * g.height) / 38);
    for (let i = 0; i < count; i++) {
      const cx = rand() * g.width;
      const cy = rand() * g.height;
      const r = 0.8 + Math.pow(rand(), 2) * 3.8;
      const k = 4 + Math.floor(rand() * 3);
      let d = "";
      for (let j = 0; j < k; j++) {
        const a = (j / k) * Math.PI * 2 + rand() * 0.8;
        const rr = r * (0.6 + rand() * 0.5);
        d += `${j ? "L" : "M"}${n(cx + Math.cos(a) * rr)},${n(cy + Math.sin(a) * rr)}`;
      }
      chips += `<path d="${d}Z" fill="${colors[Math.floor(rand() * colors.length)]}"/>`;
    }
    const r = frontRect(g, 0.14, 0.34, 0.72, 0.3);
    return `<defs>${shadowFilter(`${uid}s`)}</defs>${bg(g, "#F1ECE4")}${chips}${label(r, "#FAF7F2", { shadowId: `${uid}s`, rx: 0.3 })}`;
  },
  textArea: { x: 0.17, y: 0.36, w: 0.66, h: 0.26 },
  justify: "center",
  title: { font: "montserrat", size: 0.058, color: "#2E2A26", weight: 600, upper: true, tracking: 0.12, lineHeight: 1.15 },
  subtitle: { font: "montserrat", size: 0.03, color: "#6B635B", weight: 400 },
  names: { font: "montserrat", size: 0.026, color: "#6B635B", weight: 500, upper: true, tracking: 0.2 },
  ornament: { kind: "dots", color: "#C77C6B" },
  spine: { color: "#2E2A26", font: "montserrat" },
  back: { color: "#2E2A26", font: "montserrat", mirror: true },
};

const script: CoverTemplate = {
  id: "script",
  mood: "romance",
  texture: { kind: "grain", opacity: 0.1 },
  swatch: "linear-gradient(160deg,#f5e6df,#ecd3ca)",
  art: (g) => {
    const f = g.front;
    const i = 7;
    return `${bg(g, "#F2E0D9")}<rect x="${n(f.x + i)}" y="${n(f.y + i)}" width="${n(f.w - i * 2)}" height="${n(f.h - i * 2)}" fill="none" stroke="#C99A95" stroke-width="0.3"/>`;
  },
  textArea: { x: 0.12, y: 0.22, w: 0.76, h: 0.5 },
  justify: "center",
  title: { font: "badscript", size: 0.12, color: "#7A2E3A", lineHeight: 1.15 },
  subtitle: { font: "cormorant", size: 0.045, color: "#9A5A60", italic: true },
  names: { font: "cormorant", size: 0.045, color: "#9A5A60", italic: true },
  ornament: { kind: "heart", color: "#C99A95" },
  spine: { color: "#7A2E3A", font: "cormorant" },
  back: { color: "#7A2E3A", font: "cormorant", mirror: true },
};

const photo: CoverTemplate = {
  id: "photo",
  mood: "photo",
  swatch: "linear-gradient(180deg,#8a8a8a,#2b2b2b)",
  requiresPhoto: true,
  art: (g, { uid, photoHref }) => {
    const f = g.front;
    // Фото занимает лицевую сторону вместе с загибами (до правого, верхнего и нижнего края холста).
    const px = f.x;
    const pw = g.width - f.x;
    let out = `<defs><linearGradient id="${uid}sh" x1="0" y1="0" x2="0" y2="1"><stop offset="0.45" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.62"/></linearGradient></defs>${bg(g, "#1E1E1E")}`;
    if (photoHref) {
      out += `<image href="${photoHref.replace(/&/g, "&amp;")}" x="${n(px)}" y="0" width="${n(pw)}" height="${n(g.height)}" preserveAspectRatio="xMidYMid slice"/>`;
    } else {
      out += `<rect x="${n(px)}" y="0" width="${n(pw)}" height="${n(g.height)}" fill="#8C8C8C"/>`;
    }
    out += `<rect x="${n(px)}" y="0" width="${n(pw)}" height="${n(g.height)}" fill="url(#${uid}sh)"/>`;
    return out;
  },
  textArea: { x: 0.1, y: 0.6, w: 0.8, h: 0.32 },
  justify: "end",
  title: { font: "cormorant", size: 0.1, color: "#FFFFFF", weight: 600, lineHeight: 1.05 },
  subtitle: { font: "cormorant", size: 0.045, color: "#F2F2F2", italic: true },
  names: { font: "montserrat", size: 0.026, color: "#F2F2F2", weight: 500, upper: true, tracking: 0.25 },
  spine: { color: "#FFFFFF", font: "cormorant" },
  back: { color: "#E6E6E6", font: "cormorant", area: { x: 0.14, y: 0.3, w: 0.72, h: 0.4 } },
};

const builtIn = [blossom, linen, midnight, sage, terracotta, hearts, script, ocean, terrazzo, noir, photo, ...collectionTemplates, ...photoCollection];
const byId: Record<string, CoverTemplate> = Object.fromEntries(builtIn.map((t) => [t.id, t]));

/**
 * Рисованные обложки, у которых есть замена на снимке: из выбора убраны, но книги с ними
 * по-прежнему открываются и печатаются как раньше.
 */
const retired = new Set(["blossom", "sage", "terracotta", "noir", "hearts", "ocean", "terrazzo", "script", "tulips", "mountains"]);
for (const id of retired) byId[id] = { ...byId[id], hidden: true };

/** Все встроенные обложки, включая убранные из выбора. */
export const allCoverTemplates: CoverTemplate[] = builtIn.map((t) => byId[t.id]);

/** Встроенные обложки в порядке выбора: сначала снимки (чередуем настроения), затем рисованные. */
export const coverTemplates: CoverTemplate[] = [
  "peony", "sakura", "alatau", "tenderness", "velvet", "eucalyptus", "milkyway", "flax", "roses", "clouds", "saddle", "lavender",
  "dusk", "marble", "bouquet", "mist", "lights", "dried", "peaks", "party", "postcards", "meadow", "surf", "autumn", "steppe", "mint",
  "oyu", "constellation", "linen", "sunrise", "midnight", "herbarium", "deco", "leather", "letter", "lemons", "photo",
].map((id) => byId[id]);

/** Что видит клиент в выборе: опубликованные шаблоны из CRM, затем встроенные. */
export function pickerCovers(): CoverTemplate[] {
  const custom = activeCustomCovers();
  return custom.length ? [...custom, ...coverTemplates] : coverTemplates;
}

export function getCoverTemplate(id: string): CoverTemplate {
  return byId[id] ?? customCover(id) ?? linen;
}

/** Шаблон существует (встроенный — даже убранный из выбора — или из CRM). */
export function isKnownCover(id: string): boolean {
  return id in byId || !!customCover(id);
}

/** Название обложки на языке страницы: встроенные — из словаря, из CRM — своё. */
export function coverLabel(template: CoverTemplate, names: Record<string, string>, locale: string): string {
  return names[template.id] ?? template.name?.[locale as "ru" | "kk"] ?? template.name?.ru ?? template.id;
}

/**
 * Задняя крышка повторяет композицию лица — плашку, рамку, марку: тот же рисунок, построенный так,
 * будто лицо — это задняя крышка, и обрезанный по ней. Узоры во весь холст совпадают и стыкуются
 * без шва, а свои рисунки задней крышки шаблона этим слоем закрываются.
 */
function backMirror(template: CoverTemplate, g: CoverGeometry, ctx: ArtContext): string {
  if (!g.back || !template.back.mirror) return "";
  const b = g.back;
  const id = `${ctx.uid}bk`;
  const art = template.art({ width: g.width, height: g.height, front: b }, { uid: id, layer: "decor" });
  return `<clipPath id="${id}c"><rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}"/></clipPath><g clip-path="url(#${id}c)">${art}</g>`;
}

export function renderCoverSvg(
  template: CoverTemplate,
  g: CoverGeometry,
  ctx: ArtContext,
  opts: { pxPerMm?: number; noTexture?: boolean } = {},
): string {
  let texture = "";
  if (template.texture && !opts.noTexture) {
    const id = `${ctx.uid}tx`;
    const filter = template.texture.kind === "linen" ? linenFilter(id) : grainFilter(id);
    texture = `<defs>${filter}</defs><rect x="0" y="0" width="${n(g.width)}" height="${n(g.height)}" filter="url(#${id})" opacity="${template.texture.opacity}"/>`;
  }
  const size = opts.pxPerMm
    ? ` width="${Math.round(g.width * opts.pxPerMm)}" height="${Math.round(g.height * opts.pxPerMm)}"`
    : ` preserveAspectRatio="xMidYMid slice"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${n(g.width)} ${n(g.height)}"${size}>${template.art(g, ctx)}${backMirror(template, g, ctx)}${texture}</svg>`;
}

/**
 * Обрезает развёртку обложки до нужной стороны, чтобы браузер растрировал только её.
 * Фильтры фактуры заданы как «100% области просмотра» — после обрезки это размер стороны, а не развёртки,
 * и фактура пропадает на куске справа и снизу, поэтому размер области фильтра задаётся явно.
 */
export function cropSvg(svg: string, r: Rect, spread: { w: number; h: number }) {
  return svg
    .replace(/viewBox="[^"]*"/, `viewBox="${r.x} ${r.y} ${r.w} ${r.h}"`)
    .replace(/preserveAspectRatio="[^"]*"/, 'preserveAspectRatio="none"')
    .replace(/(<filter [^>]*?)width="100%" height="100%"/g, `$1width="${spread.w}" height="${spread.h}"`);
}

export interface CoverTextContent {
  title: string;
  subtitle: string;
  names: string;
}

export function coverNamesLine(author: string, recipient: string, hideRecipient: boolean) {
  const a = author.trim();
  const r = recipient.trim();
  if (hideRecipient || !r) return a;
  if (!a) return r;
  return `${a} & ${r}`;
}
