/**
 * Обложки с фотографиями клиента: арка, полароид, медальон, паспарту, сердце, глянец, дуотон
 * и коллажи на несколько снимков. Пока фото не выбрано, на его месте пейзаж-заглушка (cover-kit).
 * Обложки на готовых снимках (фото — часть дизайна) — в covers-photo.ts.
 * Оборот у них свой — спокойный фон в цвет лица: композицию с фото на задней крышке не повторяем.
 * Правила скорости растрирования — в cover-kit.ts.
 */
import type { CoverTemplate } from "./covers";
import type { Rect } from "./formats";
import { bg, n, petalPath, photoSlot, rng, shadowFilter } from "./cover-kit";
import { HEART } from "./motifs";

/** Область текста на обороте — по центру крышки. */
const BACK_AREA: Rect = { x: 0.14, y: 0.27, w: 0.72, h: 0.46 };

/** Мягкая тень под карточкой или паспарту. */
function softShadow(r: Rect, filterId: string, opts: { dy?: number; opacity?: number; transform?: string } = {}) {
  return `<rect x="${n(r.x + 0.5)}" y="${n(r.y + (opts.dy ?? 1.1))}" width="${n(r.w)}" height="${n(r.h)}" fill="#000" fill-opacity="${opts.opacity ?? 0.3}" filter="url(#${filterId})"${opts.transform ? ` transform="${opts.transform}"` : ""}/>`;
}

function rectFrame(f: Rect, inset: number, stroke: string, width: number, opacity = 1) {
  return `<rect x="${n(f.x + inset)}" y="${n(f.y + inset)}" width="${n(f.w - inset * 2)}" height="${n(f.h - inset * 2)}" fill="none" stroke="${stroke}" stroke-width="${width}"${opacity < 1 ? ` stroke-opacity="${opacity}"` : ""}/>`;
}

function ellipsePath(cx: number, cy: number, rx: number, ry: number) {
  return `M${n(cx - rx)},${n(cy)} A${n(rx)},${n(ry)} 0 1 0 ${n(cx + rx)},${n(cy)} A${n(rx)},${n(ry)} 0 1 0 ${n(cx - rx)},${n(cy)}Z`;
}

// ─── Арка: фото в арочном окне на тёплом песке ───────────────────────────────

function archPath(x: number, y: number, w: number, h: number) {
  const r = w / 2;
  return `M${n(x)},${n(y + h)} L${n(x)},${n(y + r)} A${n(r)},${n(r)} 0 0 1 ${n(x + w)},${n(y + r)} L${n(x + w)},${n(y + h)}Z`;
}

const arch: CoverTemplate = {
  id: "arch",
  mood: "photo",
  requiresPhoto: true,
  texture: { kind: "grain", opacity: 0.1 },
  swatch: "radial-gradient(ellipse 31% 30% at 50% 40%,#c8a48c 0 98%,transparent 100%),#efe5d8",
  art: (g, ctx) => {
    const f = g.front;
    const w = f.w * 0.62;
    const h = Math.min(f.h * 0.56, w * 1.42);
    const x = f.x + (f.w - w) / 2;
    const y = f.y + f.h * 0.1;
    const line = "#A8724F";
    let out = bg(g, "#EFE5D8");
    // Солнце выглядывает из-за арки справа сверху
    out += `<circle cx="${n(x + w * 0.97)}" cy="${n(y + w * 0.17)}" r="${n(w * 0.17)}" fill="#E4B691"/>`;
    out += photoSlot(ctx, 0, { x, y, w, h }, { clip: archPath(x, y, w, h), scene: 0 });
    const o = 3.2;
    out += `<path d="${archPath(x - o, y - o, w + o * 2, h + o)}" fill="none" stroke="${line}" stroke-width="0.35"/>`;
    out += `<line x1="${n(x - o - 7)}" y1="${n(y + h)}" x2="${n(x + w + o + 7)}" y2="${n(y + h)}" stroke="${line}" stroke-width="0.35"/>`;
    return out;
  },
  textArea: { x: 0.1, y: 0.705, w: 0.8, h: 0.24 },
  justify: "start",
  title: { font: "cormorant", size: 0.084, color: "#4A3426", weight: 500, italic: true, lineHeight: 1.05 },
  subtitle: { font: "cormorant", size: 0.04, color: "#7A5A45", italic: true },
  names: { font: "montserrat", size: 0.023, color: "#8A6A55", weight: 500, upper: true, tracking: 0.28 },
  ornament: { kind: "line", color: "#A8724F" },
  spine: { color: "#4A3426", font: "cormorant" },
  back: { color: "#4A3426", font: "cormorant", area: BACK_AREA },
};

// ─── Полароид: снимок на скотче, подпись от руки ─────────────────────────────

const polaroid: CoverTemplate = {
  id: "polaroid",
  mood: "photo",
  requiresPhoto: true,
  texture: { kind: "linen", opacity: 0.2 },
  swatch: "linear-gradient(176deg,transparent 0 12%,#fff 12% 64%,transparent 64%),#e8ded0",
  art: (g, ctx) => {
    const f = g.front;
    const { uid } = ctx;
    const cw = Math.min(f.w * 0.68, f.h * 0.5);
    const pad = cw * 0.06;
    const pw = cw - pad * 2;
    const bottom = cw * 0.24;
    const ch = pad + pw + bottom;
    const cx = f.x + f.w / 2;
    const cy = f.y + f.h * 0.37;
    const x = cx - cw / 2;
    const y = cy - ch / 2;
    const rot = `rotate(-3 ${n(cx)} ${n(cy)})`;
    let out = `<defs>${shadowFilter(`${uid}s`)}</defs>${bg(g, "#E8DED0")}`;
    out += softShadow({ x, y, w: cw, h: ch }, `${uid}s`, { transform: rot, opacity: 0.3, dy: 1.5 });
    out += `<g transform="${rot}"><rect x="${n(x)}" y="${n(y)}" width="${n(cw)}" height="${n(ch)}" fill="#FFFFFF"/>`;
    out += photoSlot(ctx, 0, { x: x + pad, y: y + pad, w: pw, h: pw }, { scene: 2 });
    out += `<rect x="${n(x + pad)}" y="${n(y + pad)}" width="${n(pw)}" height="${n(pw)}" fill="none" stroke="#000" stroke-opacity="0.08" stroke-width="0.2"/>`;
    // Сердечко от руки в нижнем поле карточки
    const hs = bottom * 0.34;
    out += `<path d="${HEART}" fill="none" stroke="#C0485A" stroke-width="${n(0.45 / hs)}" stroke-linejoin="round" transform="translate(${n(x + cw - pad - hs * 1.6)},${n(y + pad + pw + (bottom - hs * 0.92) / 2)}) scale(${n(hs)}) rotate(-8 0.5 0.46)"/>`;
    // Скотч на верхних углах
    const tw = cw * 0.3;
    const th = cw * 0.085;
    for (const [tx, a] of [
      [x + cw * 0.08, -38],
      [x + cw * 0.92, 38],
    ] as const)
      out += `<rect x="${n(-tw / 2)}" y="${n(-th / 2)}" width="${n(tw)}" height="${n(th)}" fill="#EBC6B8" fill-opacity="0.82" transform="translate(${n(tx)},${n(y + th * 0.15)}) rotate(${a})"/>`;
    return `${out}</g>`;
  },
  textArea: { x: 0.1, y: 0.72, w: 0.8, h: 0.22 },
  justify: "start",
  title: { font: "caveat", size: 0.11, color: "#3B302A", weight: 500, lineHeight: 1.0 },
  subtitle: { font: "caveat", size: 0.058, color: "#6B5A4E", weight: 500 },
  names: { font: "montserrat", size: 0.022, color: "#7D6B5E", weight: 500, upper: true, tracking: 0.26 },
  ornament: { kind: "heart", color: "#C0485A" },
  spine: { color: "#3B302A", font: "caveat" },
  back: { color: "#3B302A", font: "caveat", area: BACK_AREA },
};

// ─── Медальон: овальный портрет в золотой раме с лавровым венком ─────────────

const medallion: CoverTemplate = {
  id: "medallion",
  mood: "photo",
  requiresPhoto: true,
  texture: { kind: "grain", opacity: 0.14 },
  swatch: "radial-gradient(ellipse 24% 22% at 50% 38%,#b9a27e 0 92%,#cdae70 93% 100%,transparent 101%),radial-gradient(circle at 50% 42%,#5e2230,#2c0d15)",
  art: (g, ctx) => {
    const f = g.front;
    const { uid } = ctx;
    const gold = "#CDAE70";
    const cx = f.x + f.w / 2;
    const cy = f.y + f.h * 0.37;
    const ry = f.h * 0.24;
    const rx = ry * 0.8;
    let out = `<defs><radialGradient id="${uid}bg" gradientUnits="userSpaceOnUse" cx="${n(cx)}" cy="${n(f.y + f.h * 0.42)}" r="${n(f.h * 0.75)}"><stop offset="0" stop-color="#5E2230"/><stop offset="1" stop-color="#2C0D15"/></radialGradient></defs><rect width="${n(g.width)}" height="${n(g.height)}" fill="url(#${uid}bg)"/>`;
    out += rectFrame(f, 7, gold, 0.5) + rectFrame(f, 8.6, gold, 0.18);
    out += photoSlot(ctx, 0, { x: cx - rx, y: cy - ry, w: rx * 2, h: ry * 2 }, { clip: ellipsePath(cx, cy, rx, ry), scene: 3 });
    out += `<path d="${ellipsePath(cx, cy, rx + 1.4, ry + 1.4)}" fill="none" stroke="${gold}" stroke-width="1"/><path d="${ellipsePath(cx, cy, rx + 3.1, ry + 3.1)}" fill="none" stroke="${gold}" stroke-width="0.25"/>`;
    // Жемчужная нить вокруг рамы
    const beads = 64;
    for (let i = 0; i < beads; i++) {
      const t = (i / beads) * Math.PI * 2;
      out += `<circle cx="${n(cx + (rx + 4.5) * Math.cos(t))}" cy="${n(cy + (ry + 4.5) * Math.sin(t))}" r="0.42" fill="${gold}"/>`;
    }
    // Лавровый венок по нижней половине рамы
    const R = { x: rx + 8.5, y: ry + 8.5 };
    const rand = rng(61);
    const branch = (side: 1 | -1) => {
      const deg = (k: number) => ((90 + side * k) * Math.PI) / 180;
      const p = (t: number) => ({ x: cx + R.x * Math.cos(t), y: cy + R.y * Math.sin(t) });
      const a = p(deg(6));
      const b = p(deg(128));
      let s = `<path d="M${n(a.x)},${n(a.y)} A${n(R.x)},${n(R.y)} 0 0 ${side > 0 ? 1 : 0} ${n(b.x)},${n(b.y)}" fill="none" stroke="${gold}" stroke-width="0.45" stroke-linecap="round"/>`;
      const steps = 10;
      for (let i = 0; i < steps; i++) {
        const t = deg(12 + i * 11.5);
        const q = p(t);
        // Направление роста ветки — по касательной к эллипсу
        const dir = (Math.atan2(R.y * Math.cos(t) * side, -R.x * Math.sin(t) * side) * 180) / Math.PI;
        const len = 6.4 * (1 - (i / steps) * 0.42);
        for (const off of [-38, 38]) s += `<path d="${petalPath(len, 0.36)}" fill="${gold}" transform="translate(${n(q.x)},${n(q.y)}) rotate(${n(dir + off + (rand() - 0.5) * 8)})"/>`;
        if (i % 3 === 1) s += `<circle cx="${n(q.x + Math.cos(((dir + 90) * Math.PI) / 180) * 2.4)}" cy="${n(q.y + Math.sin(((dir + 90) * Math.PI) / 180) * 2.4)}" r="0.7" fill="${gold}"/>`;
      }
      return s;
    };
    out += branch(1) + branch(-1);
    const bottom = cy + R.y;
    out += `<path d="M${n(cx)},${n(bottom - 1.6)} L${n(cx + 1.6)},${n(bottom)} L${n(cx)},${n(bottom + 1.6)} L${n(cx - 1.6)},${n(bottom)}Z" fill="${gold}"/>`;
    return out;
  },
  textArea: { x: 0.12, y: 0.705, w: 0.76, h: 0.22 },
  justify: "start",
  title: { font: "cormorant", size: 0.084, color: "#E9CD91", weight: 600, lineHeight: 1.05 },
  subtitle: { font: "cormorant", size: 0.04, color: "#D8BA80", italic: true },
  names: { font: "montserrat", size: 0.022, color: "#CDAE70", weight: 500, upper: true, tracking: 0.3 },
  ornament: { kind: "star", color: "#CDAE70" },
  spine: { color: "#E9CD91", font: "cormorant" },
  back: { color: "#D8BA80", font: "cormorant", area: BACK_AREA },
};

// ─── Паспарту: снимок в белом паспарту на синем льне ─────────────────────────

const passepartout: CoverTemplate = {
  id: "passepartout",
  mood: "photo",
  requiresPhoto: true,
  texture: { kind: "linen", opacity: 0.32 },
  swatch: "linear-gradient(transparent 0 8%,#f7f3ec 8% 64%,transparent 64%) 50% 0/78% 100% no-repeat,#33414f",
  art: (g, ctx) => {
    const f = g.front;
    const { uid } = ctx;
    const mat = { x: f.x + f.w * 0.11, y: f.y + f.h * 0.08, w: f.w * 0.78, h: f.h * 0.56 };
    const inset = f.w * 0.055;
    const win = { x: mat.x + inset, y: mat.y + inset, w: mat.w - inset * 2, h: mat.h - inset * 2 };
    let out = `<defs>${shadowFilter(`${uid}s`)}</defs>${bg(g, "#33414F")}`;
    out += softShadow(mat, `${uid}s`, { opacity: 0.45, dy: 1.3 });
    out += `<rect x="${n(mat.x)}" y="${n(mat.y)}" width="${n(mat.w)}" height="${n(mat.h)}" fill="#F7F3EC"/>`;
    // Скос выреза паспарту: светлая кромка вокруг окна
    out += `<rect x="${n(win.x - 0.9)}" y="${n(win.y - 0.9)}" width="${n(win.w + 1.8)}" height="${n(win.h + 1.8)}" fill="#E6DED1"/>`;
    out += photoSlot(ctx, 0, win, { scene: 1 });
    out += `<rect x="${n(win.x)}" y="${n(win.y)}" width="${n(win.w)}" height="${n(win.h)}" fill="none" stroke="#000" stroke-opacity="0.18" stroke-width="0.2"/>`;
    return out;
  },
  textArea: { x: 0.12, y: 0.69, w: 0.76, h: 0.24 },
  justify: "start",
  title: { font: "cormorant", size: 0.082, color: "#F2E7D2", weight: 500, lineHeight: 1.06 },
  subtitle: { font: "cormorant", size: 0.04, color: "#D2C6B0", italic: true },
  names: { font: "montserrat", size: 0.022, color: "#BDB09A", weight: 500, upper: true, tracking: 0.3 },
  ornament: { kind: "line", color: "#BDB09A" },
  spine: { color: "#F2E7D2", font: "cormorant" },
  back: { color: "#E6DCC8", font: "cormorant", area: BACK_AREA },
};

// ─── Сердце: фото в форме сердца на пудровом фоне ────────────────────────────

const heart: CoverTemplate = {
  id: "heart",
  mood: "photo",
  requiresPhoto: true,
  texture: { kind: "grain", opacity: 0.08 },
  swatch: "radial-gradient(circle at 37% 30%,#d9a3a8 0 17%,transparent 18%),radial-gradient(circle at 63% 30%,#d9a3a8 0 17%,transparent 18%),conic-gradient(from 135deg at 50% 58%,#d9a3a8 0 90deg,transparent 90deg),#f5deda",
  art: (g, ctx) => {
    const f = g.front;
    const rand = rng(83);
    let out = bg(g, "#F5DEDA");
    // Россыпь маленьких сердечек-контуров по всему холсту
    for (let y = 4; y < g.height; y += 15)
      for (let x = (Math.round(y / 15) % 2) * 7.5 + 3; x < g.width; x += 15) {
        const s = 3.2 + rand() * 1.6;
        out += `<path d="${HEART}" fill="none" stroke="#E7BCB8" stroke-width="${n(0.3 / s)}" transform="translate(${n(x + (rand() - 0.5) * 5)},${n(y + (rand() - 0.5) * 5)}) rotate(${n((rand() - 0.5) * 40)}) scale(${n(s)})"/>`;
      }
    const s = Math.min(f.w * 0.74, (f.h * 0.52) / 0.92);
    const x0 = f.x + (f.w - s) / 2;
    const y0 = f.y + f.h * 0.075;
    const tr = `translate(${n(x0)},${n(y0)}) scale(${n(s)})`;
    // Белая кайма: обводка под фото, снаружи видна её половина
    out += `<path d="${HEART}" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="${n(6 / s)}" stroke-linejoin="round" transform="${tr}"/>`;
    out += photoSlot(ctx, 0, { x: x0, y: y0, w: s, h: s * 0.92 }, { clip: HEART, clipTransform: tr, scene: 0 });
    // Тонкий контур снаружи — то же сердце, увеличенное вокруг его центра
    const k = (s + 11) / s;
    out += `<path d="${HEART}" fill="none" stroke="#C4566A" stroke-width="${n(0.35 / (s * k))}" transform="translate(${n(x0 + s * 0.5 * (1 - k))},${n(y0 + s * 0.46 * (1 - k))}) scale(${n(s * k)})"/>`;
    return out;
  },
  textArea: { x: 0.1, y: 0.66, w: 0.8, h: 0.27 },
  justify: "start",
  title: { font: "cormorant", size: 0.088, color: "#7C2236", weight: 500, italic: true, lineHeight: 1.05 },
  subtitle: { font: "cormorant", size: 0.042, color: "#9C4B5B", italic: true },
  names: { font: "cormorant", size: 0.045, color: "#9C4B5B", italic: true },
  ornament: { kind: "heart", color: "#C4566A" },
  spine: { color: "#7C2236", font: "cormorant" },
  back: { color: "#7C2236", font: "cormorant", area: BACK_AREA },
};

// ─── Глянец: фото во всю обложку, название сверху, как у журнала ─────────────

const magazine: CoverTemplate = {
  id: "magazine",
  mood: "photo",
  requiresPhoto: true,
  swatch: "linear-gradient(180deg,#2a2a2a,#7d7d7d 55%,#4a4a4a)",
  art: (g, ctx) => {
    const f = g.front;
    const { uid } = ctx;
    const r = { x: f.x, y: 0, w: g.width - f.x, h: g.height };
    let out = `<defs><linearGradient id="${uid}sh" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0.62"/><stop offset="0.42" stop-color="#000" stop-opacity="0"/><stop offset="0.78" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.38"/></linearGradient></defs>`;
    out += bg(g, "#1B1B1B") + photoSlot(ctx, 0, r, { scene: 1 });
    out += `<rect x="${n(r.x)}" y="0" width="${n(r.w)}" height="${n(g.height)}" fill="url(#${uid}sh)"/>`;
    out += rectFrame(f, 7, "#FFFFFF", 0.3, 0.8);
    return out;
  },
  textArea: { x: 0.1, y: 0.075, w: 0.8, h: 0.3 },
  justify: "start",
  title: { font: "playfair", size: 0.1, color: "#FFFFFF", weight: 400, lineHeight: 1.02 },
  subtitle: { font: "playfair", size: 0.042, color: "#F4F1EC", italic: true },
  names: { font: "montserrat", size: 0.023, color: "#F4F1EC", weight: 500, upper: true, tracking: 0.34 },
  ornament: { kind: "line", color: "#FFFFFF" },
  spine: { color: "#FFFFFF", font: "playfair" },
  back: { color: "#E9E9E9", font: "playfair", area: BACK_AREA },
};

// ─── Дуотон: фото в два цвета — сливовый и персиковый ────────────────────────

/** Цвет #RRGGBB → доли 0–1 для таблицы feComponentTransfer. */
const channels = (hex: string) => [1, 3, 5].map((i) => n(parseInt(hex.slice(i, i + 2), 16) / 255));

function duotoneFilter(id: string, stops: string[]) {
  const c = stops.map(channels);
  const table = (k: number) => c.map((x) => x[k]).join(" ");
  return `<filter id="${id}" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0 0 0 1 0"/><feComponentTransfer><feFuncR type="table" tableValues="${table(0)}"/><feFuncG type="table" tableValues="${table(1)}"/><feFuncB type="table" tableValues="${table(2)}"/></feComponentTransfer></filter>`;
}

const duotone: CoverTemplate = {
  id: "duotone",
  mood: "photo",
  requiresPhoto: true,
  texture: { kind: "grain", opacity: 0.1 },
  swatch: "linear-gradient(180deg,#f3b9a8,#c8607a 50%,#4a1638)",
  art: (g, ctx) => {
    const f = g.front;
    const { uid } = ctx;
    const r = { x: f.x, y: 0, w: g.width - f.x, h: g.height };
    let out = `<defs>${duotoneFilter(`${uid}duo`, ["#3F1232", "#C8607A", "#FCE6D6"])}<linearGradient id="${uid}sh" x1="0" y1="0" x2="0" y2="1"><stop offset="0.5" stop-color="#3F1232" stop-opacity="0"/><stop offset="1" stop-color="#3F1232" stop-opacity="0.8"/></linearGradient></defs>`;
    out += bg(g, "#4A1638");
    out += `<g filter="url(#${uid}duo)">${photoSlot(ctx, 0, r, { scene: 3 })}</g>`;
    out += `<rect x="${n(r.x)}" y="0" width="${n(r.w)}" height="${n(g.height)}" fill="url(#${uid}sh)"/>`;
    return out;
  },
  textArea: { x: 0.09, y: 0.6, w: 0.82, h: 0.33 },
  justify: "end",
  title: { font: "playfair", size: 0.112, color: "#FFF3EA", weight: 400, italic: true, lineHeight: 1.0 },
  subtitle: { font: "playfair", size: 0.043, color: "#FBDCCD", italic: true },
  names: { font: "montserrat", size: 0.023, color: "#FBDCCD", weight: 500, upper: true, tracking: 0.3 },
  ornament: { kind: "line", color: "#FBDCCD" },
  spine: { color: "#FFF3EA", font: "playfair" },
  back: { color: "#FBDCCD", font: "playfair", area: BACK_AREA },
};

// ─── Коллаж: большой кадр и два поменьше, как в фотокниге ────────────────────

const collage: CoverTemplate = {
  id: "collage",
  mood: "photo",
  requiresPhoto: true,
  photoSlots: 3,
  swatch: "linear-gradient(#9aa6a0,#9aa6a0) 50% 6%/84% 39% no-repeat,linear-gradient(#c9a58c,#c9a58c) 8% 66%/41% 21% no-repeat,linear-gradient(#b7a3bf,#b7a3bf) 92% 66%/41% 21% no-repeat,#f7f3ee",
  art: (g, ctx) => {
    const f = g.front;
    const m = f.w * 0.075;
    const gap = 2.6;
    const W = f.w - m * 2;
    const x = f.x + m;
    const y = f.y + m;
    const h1 = f.h * 0.4;
    const h2 = f.h * 0.215;
    const w2 = (W - gap) / 2;
    let out = bg(g, "#F7F3EE");
    out += photoSlot(ctx, 0, { x, y, w: W, h: h1 }, { scene: 1 });
    out += photoSlot(ctx, 1, { x, y: y + h1 + gap, w: w2, h: h2 }, { scene: 2 });
    out += photoSlot(ctx, 2, { x: x + w2 + gap, y: y + h1 + gap, w: w2, h: h2 }, { scene: 3 });
    return out;
  },
  textArea: { x: 0.08, y: 0.715, w: 0.84, h: 0.24 },
  justify: "center",
  title: { font: "playfair", size: 0.07, color: "#2A2421", weight: 400, lineHeight: 1.08 },
  subtitle: { font: "playfair", size: 0.035, color: "#6E625A", italic: true },
  names: { font: "montserrat", size: 0.021, color: "#8A7C72", weight: 500, upper: true, tracking: 0.3 },
  ornament: { kind: "line", color: "#C2A88F" },
  spine: { color: "#2A2421", font: "playfair" },
  back: { color: "#2A2421", font: "playfair", area: BACK_AREA },
};

// ─── Мозаика: четыре снимка и название на светлой полосе посередине ──────────

const mosaic: CoverTemplate = {
  id: "mosaic",
  mood: "photo",
  requiresPhoto: true,
  photoSlots: 4,
  swatch: "linear-gradient(90deg,#9aa6a0 0 49%,transparent 49% 51%,#c9a58c 51%) 0 0/100% 33% no-repeat,linear-gradient(90deg,#b7a3bf 0 49%,transparent 49% 51%,#d8b4a0 51%) 0 100%/100% 33% no-repeat,#f4eee5",
  art: (g, ctx) => {
    const f = g.front;
    const gap = 2.4;
    const bandTop = f.y + f.h * 0.335;
    const bandBottom = f.y + f.h * 0.665;
    const xm = f.x + f.w / 2;
    const left = { x: f.x, w: xm - gap / 2 - f.x };
    const right = { x: xm + gap / 2, w: g.width - xm - gap / 2 };
    let out = bg(g, "#F4EEE5");
    // Ряды уходят под загибы сверху, снизу и справа — край печати без белых полос
    out += photoSlot(ctx, 0, { x: left.x, y: 0, w: left.w, h: bandTop }, { scene: 0 });
    out += photoSlot(ctx, 1, { x: right.x, y: 0, w: right.w, h: bandTop }, { scene: 1 });
    out += photoSlot(ctx, 2, { x: left.x, y: bandBottom, w: left.w, h: g.height - bandBottom }, { scene: 2 });
    out += photoSlot(ctx, 3, { x: right.x, y: bandBottom, w: right.w, h: g.height - bandBottom }, { scene: 3 });
    for (const y of [bandTop + 5, bandBottom - 5])
      out += `<line x1="${n(f.x + f.w * 0.2)}" y1="${n(y)}" x2="${n(f.x + f.w * 0.8)}" y2="${n(y)}" stroke="#B9A48E" stroke-width="0.25"/>`;
    return out;
  },
  textArea: { x: 0.08, y: 0.37, w: 0.84, h: 0.26 },
  justify: "center",
  title: { font: "cormorant", size: 0.085, color: "#2E2622", weight: 500, lineHeight: 1.04 },
  subtitle: { font: "cormorant", size: 0.04, color: "#6E5E52", italic: true },
  names: { font: "montserrat", size: 0.022, color: "#8A7A6E", weight: 500, upper: true, tracking: 0.3 },
  ornament: { kind: "dots", color: "#B9A48E" },
  spine: { color: "#2E2622", font: "cormorant" },
  back: { color: "#2E2622", font: "cormorant", area: BACK_AREA },
};

// ─── Плёнка: три кадра на киноленте, пересекающей обложку ────────────────────

const film: CoverTemplate = {
  id: "film",
  mood: "photo",
  requiresPhoto: true,
  photoSlots: 3,
  texture: { kind: "grain", opacity: 0.14 },
  swatch: "linear-gradient(-5deg,transparent 0 22%,#141110 22% 49%,transparent 49%),#3a3230",
  art: (g, ctx) => {
    const f = g.front;
    const { uid } = ctx;
    const bgColor = "#3A3230";
    const sh = f.h * 0.27;
    const cx = f.x + f.w / 2;
    const cy = f.y + f.h * 0.63;
    const hb = sh * 0.16;
    const fh = sh - hb * 2 - 1.2;
    const gap = 3.2;
    const fw = Math.min(fh * 1.32, (f.w * 0.92 - gap * 2) / 3);
    const x0 = f.x - 30;
    const x1 = g.width + 30;
    const top = cy - sh / 2;
    let out = `<defs><radialGradient id="${uid}glow" gradientUnits="userSpaceOnUse" cx="${n(f.x + f.w * 0.15)}" cy="${n(f.y + f.h * 0.12)}" r="${n(f.w * 0.75)}"><stop offset="0" stop-color="#C77A45" stop-opacity="0.45"/><stop offset="1" stop-color="#C77A45" stop-opacity="0"/></radialGradient><clipPath id="${uid}fc"><rect x="${n(f.x)}" y="0" width="${n(g.width - f.x)}" height="${n(g.height)}"/></clipPath></defs>`;
    out += bg(g, bgColor) + `<rect x="${n(f.x)}" y="0" width="${n(g.width - f.x)}" height="${n(g.height)}" fill="url(#${uid}glow)"/>`;
    let strip = `<rect x="${n(x0)}" y="${n(top)}" width="${n(x1 - x0)}" height="${n(sh)}" fill="#141110"/>`;
    // Перфорация — сквозь неё виден фон
    for (let x = x0; x < x1; x += 4.6)
      for (const y of [top + hb * 0.25, top + sh - hb * 0.75]) strip += `<rect x="${n(x)}" y="${n(y)}" width="2.4" height="${n(hb * 0.5)}" rx="0.5" fill="${bgColor}"/>`;
    const fx0 = cx - (fw * 3 + gap * 2) / 2;
    for (let i = 0; i < 3; i++) {
      const fx = fx0 + i * (fw + gap);
      strip += photoSlot(ctx, i, { x: fx, y: cy - fh / 2, w: fw, h: fh }, { scene: i + 1 });
      // Оранжевые метки кадров на кромке
      strip += `<path d="M${n(fx + fw / 2 - 1)},${n(top + sh - hb * 0.08)} l1,-1.2 l1,1.2Z" fill="#D88A3D"/>`;
    }
    out += `<g clip-path="url(#${uid}fc)"><g transform="rotate(-5 ${n(cx)} ${n(cy)})">${strip}</g></g>`;
    return out;
  },
  textArea: { x: 0.1, y: 0.09, w: 0.8, h: 0.33 },
  justify: "start",
  title: { font: "cormorant", size: 0.1, color: "#F3E9DB", weight: 500, italic: true, lineHeight: 1.04 },
  subtitle: { font: "cormorant", size: 0.042, color: "#D9CCB9", italic: true },
  names: { font: "montserrat", size: 0.022, color: "#CDBFA9", weight: 500, upper: true, tracking: 0.32 },
  ornament: { kind: "line", color: "#CDBFA9" },
  spine: { color: "#F3E9DB", font: "cormorant" },
  back: { color: "#E2D6C3", font: "cormorant", area: BACK_AREA },
};

export const clientPhotoTemplates: CoverTemplate[] = [arch, polaroid, medallion, passepartout, heart, magazine, duotone, collage, mosaic, film];
