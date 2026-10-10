/**
 * Обложки с фотографиями клиента: окна и рамки (арка, медальон, паспарту, галерея, круг), карточки
 * (полароид, стопка, марка, ретро), снимок во всю обложку (глянец, монохром, сияние, дуотон, индиго),
 * журнальные раскладки (журнал, дымка, обрывок, ленты, минимализм) и коллажи на несколько снимков.
 *
 * Пока фото не выбрано, место заполняет снимок-пример из коллекции (samples, assets/cover-photos) —
 * там, где вызывающий умеет его загрузить; иначе рисованный пейзаж (cover-kit). В печать примеры не попадают:
 * без своих фото заказ не оформить. Обложки на готовых снимках (фото — часть дизайна) — в covers-photo.ts.
 * Оборот у них свой — спокойный фон в цвет лица: композицию с фото на задней крышке не повторяем.
 * Правила скорости растрирования — в cover-kit.ts.
 */
import type { CoverTemplate } from "./covers";
import type { CoverGeometry, Rect } from "./formats";
import {
  bg,
  liftShadow,
  n,
  petalPath,
  photoSlot,
  postmark,
  rng,
  scallopPath,
  tape,
  toneFilter,
  tornEdgePath,
  type ArtContext,
} from "./cover-kit";
import { HEART, SPARKLE } from "./motifs";

/** Область текста на обороте — по центру крышки. */
const BACK_AREA: Rect = { x: 0.14, y: 0.27, w: 0.72, h: 0.46 };

function rectFrame(f: Rect, inset: number, stroke: string, width: number, opacity = 1) {
  return `<rect x="${n(f.x + inset)}" y="${n(f.y + inset)}" width="${n(f.w - inset * 2)}" height="${n(f.h - inset * 2)}" fill="none" stroke="${stroke}" stroke-width="${width}"${opacity < 1 ? ` stroke-opacity="${opacity}"` : ""}/>`;
}

function ellipsePath(cx: number, cy: number, rx: number, ry: number) {
  return `M${n(cx - rx)},${n(cy)} A${n(rx)},${n(ry)} 0 1 0 ${n(cx + rx)},${n(cy)} A${n(rx)},${n(ry)} 0 1 0 ${n(cx - rx)},${n(cy)}Z`;
}

const rectPath = (r: Rect) => `M${n(r.x)},${n(r.y)} h${n(r.w)} v${n(r.h)} h${n(-r.w)}Z`;

/** Лицо с загибами: снимок «во всю» уходит за край крышки сверху, снизу и справа. */
const bleedRect = (g: CoverGeometry): Rect => ({ x: g.front.x, y: 0, w: g.width - g.front.x, h: g.height });

/** Четырёхлучевая звёздочка-блик. */
const sparkle = (cx: number, cy: number, s: number, fill: string) => `<path d="${SPARKLE}" fill="${fill}" transform="translate(${n(cx - s / 2)},${n(cy - s / 2)}) scale(${n(s)})"/>`;

/** «Фольга»: золотой градиент поперёк лица — металл переливается, а не лежит плоской краской. */
function foil(id: string, f: Rect, stops = ["#F4E2A8", "#C9A45C", "#8C6A2F", "#DCC07E", "#F2DD9E", "#B08A45"]) {
  return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${n(f.x)}" y1="${n(f.y)}" x2="${n(f.x + f.w)}" y2="${n(f.y + f.h)}">${stops.map((c, i) => `<stop offset="${n(i / (stops.length - 1))}" stop-color="${c}"/>`).join("")}</linearGradient>`;
}

/** Вертикальный градиент на весь холст. */
function vGradient(id: string, stops: [number, string, number?][]) {
  return `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">${stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a !== undefined ? ` stop-opacity="${a}"` : ""}/>`).join("")}</linearGradient>`;
}

/** Затемнение по высоте поверх снимка «во всю» — под текст. */
function shade(g: CoverGeometry, id: string, stops: [number, string, number][]) {
  const r = bleedRect(g);
  return `<defs>${vGradient(id, stops)}</defs><rect x="${n(r.x)}" y="0" width="${n(r.w)}" height="${n(g.height)}" fill="url(#${id})"/>`;
}

/** Мягкое радиальное свечение (свет лампы, блик плёнки). */
function glow(id: string, cx: number, cy: number, r: number, color: string, opacity: number, rect: Rect) {
  return `<defs><radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}"><stop offset="0" stop-color="${color}" stop-opacity="${opacity}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient></defs><rect x="${n(rect.x)}" y="${n(rect.y)}" width="${n(rect.w)}" height="${n(rect.h)}" fill="url(#${id})"/>`;
}

function duotoneFilter(id: string, stops: string[]) {
  const channels = (hex: string) => [1, 3, 5].map((i) => n(parseInt(hex.slice(i, i + 2), 16) / 255));
  const c = stops.map(channels);
  const table = (k: number) => c.map((x) => x[k]).join(" ");
  return `<filter id="${id}" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0 0 0 1 0"/><feComponentTransfer><feFuncR type="table" tableValues="${table(0)}"/><feFuncG type="table" tableValues="${table(1)}"/><feFuncB type="table" tableValues="${table(2)}"/></feComponentTransfer></filter>`;
}

/**
 * Карточка-полароид с фото: белое поле, снимок, тонкая кромка, тень. Возвращает разметку и прямоугольник карточки.
 * deg — поворот вокруг центра карточки; его же получает редактор кадра.
 */
function polaroidCard(ctx: ArtContext, slot: number, cx: number, cy: number, cw: number, deg: number, opts: { scene?: number; uid: string; ratio?: number }) {
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

function archPath(x: number, y: number, w: number, h: number) {
  const r = w / 2;
  return `M${n(x)},${n(y + h)} L${n(x)},${n(y + r)} A${n(r)},${n(r)} 0 0 1 ${n(x + w)},${n(y + r)} L${n(x + w)},${n(y + h)}Z`;
}

const arch: CoverTemplate = {
  id: "arch",
  mood: "photo",
  requiresPhoto: true,
  samples: ["dusk"],
  texture: { kind: "grain", opacity: 0.1 },
  swatch: "radial-gradient(ellipse 30% 29% at 50% 40%,#c99a7e 0 98%,transparent 100%),#efe5d8",
  art: (g, ctx) => {
    const f = g.front;
    const w = Math.min(f.w * 0.6, f.h * 0.42);
    const h = Math.min(f.h * 0.55, w * 1.45);
    const x = f.x + (f.w - w) / 2;
    const y = f.y + f.h * 0.09;
    const line = "#A8724F";
    let out = bg(g, "#EFE5D8");
    // Арка-тень цвета обожжённой глины — сдвинута вправо и вниз, как цветной блок на постере.
    out += `<path d="${archPath(x + w * 0.13, y + w * 0.1, w, h - w * 0.1)}" fill="#D9AC8C"/>`;
    out += photoSlot(ctx, 0, { x, y, w, h }, { clip: archPath(x, y, w, h), scene: 0 });
    const o = 3.4;
    out += `<path d="${archPath(x - o, y - o, w + o * 2, h + o)}" fill="none" stroke="${line}" stroke-width="0.3"/>`;
    const base = y + h + 0.01;
    out += `<line x1="${n(x - o - 9)}" y1="${n(base)}" x2="${n(x + w + o + 9)}" y2="${n(base)}" stroke="${line}" stroke-width="0.3"/>`;
    for (const cx of [x - o - 10.5, x + w + o + 10.5]) out += `<circle cx="${n(cx)}" cy="${n(base)}" r="0.7" fill="${line}"/>`;
    out += sparkle(x - o - 5, y + w * 0.12, 4.4, line) + sparkle(x - o - 9.5, y + w * 0.3, 2.2, line);
    return out;
  },
  textArea: { x: 0.1, y: 0.675, w: 0.8, h: 0.28 },
  justify: "center",
  title: { font: "cormorant", size: 0.084, color: "#4A3426", weight: 500, italic: true, lineHeight: 1.05 },
  subtitle: { font: "cormorant", size: 0.04, color: "#7A5A45", italic: true },
  names: { font: "montserrat", size: 0.022, color: "#8A6A55", weight: 500, upper: true, tracking: 0.28 },
  ornament: { kind: "line", color: "#A8724F" },
  spine: { color: "#4A3426", font: "cormorant" },
  back: { color: "#4A3426", font: "cormorant", area: BACK_AREA },
};

// ─── Полароид: снимок на скотче поверх ещё двух карточек, подпись от руки ────

const polaroid: CoverTemplate = {
  id: "polaroid",
  mood: "photo",
  requiresPhoto: true,
  samples: ["surf"],
  texture: { kind: "linen", opacity: 0.2 },
  swatch: "linear-gradient(176deg,transparent 0 12%,#fff 12% 64%,transparent 64%),#e8ded0",
  art: (g, ctx) => {
    const f = g.front;
    const { uid } = ctx;
    const cw = Math.min(f.w * 0.66, f.h * 0.47);
    const cx = f.x + f.w / 2;
    const cy = f.y + f.h * 0.37;
    let out = bg(g, "#E8DED0");
    // Под снимком — ещё две пустые карточки: стопка, а не одинокая фотография.
    const ch = cw * 1.17;
    for (const [dx, dy, deg, k] of [
      [-2.5, 1.5, 5, "a"],
      [2, 0.5, -8, "b"],
    ] as const) {
      const r = { x: cx + dx - cw / 2, y: cy + dy - ch / 2, w: cw, h: ch };
      const rot = `rotate(${deg} ${n(cx + dx)} ${n(cy + dy)})`;
      out += liftShadow(r, `${uid}${k}`, { transform: rot, strength: 0.6 }) + `<rect x="${n(r.x)}" y="${n(r.y)}" width="${n(cw)}" height="${n(ch)}" fill="#F6F2EA" transform="${rot}"/>`;
    }
    const card = polaroidCard(ctx, 0, cx, cy, cw, -2.5, { scene: 2, uid: `${uid}c` });
    out += card.svg;
    // Сердечко от руки в нижнем поле карточки
    const hs = card.bottom * 0.3;
    const hx = card.card.x + cw - card.pad - hs * 1.8;
    const hy = card.card.y + card.pad + card.ph + (card.bottom - hs * 0.92) / 2;
    out += `<g transform="${card.rot}"><path d="${HEART}" fill="none" stroke="#C0485A" stroke-width="${n(0.4 / hs)}" stroke-linejoin="round" transform="translate(${n(hx)},${n(hy)}) scale(${n(hs)}) rotate(-8 0.5 0.46)"/></g>`;
    out += tape(cx - cw * 0.02, card.card.y + 0.4, cw * 0.34, cw * 0.09, -4, "#EAD9C2", 0.86);
    return out;
  },
  textArea: { x: 0.1, y: 0.67, w: 0.8, h: 0.29 },
  justify: "center",
  title: { font: "caveat", size: 0.1, color: "#3B302A", weight: 500, lineHeight: 1.0 },
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
  samples: ["tenderness"],
  texture: { kind: "grain", opacity: 0.14 },
  swatch: "radial-gradient(ellipse 24% 22% at 50% 38%,#b9a27e 0 92%,#cdae70 93% 100%,transparent 101%),radial-gradient(circle at 50% 42%,#5e2230,#2c0d15)",
  art: (g, ctx) => {
    const f = g.front;
    const { uid } = ctx;
    const gold = `url(#${uid}au)`;
    const cx = f.x + f.w / 2;
    const cy = f.y + f.h * 0.37;
    const ry = Math.min(f.h * 0.235, f.w * 0.3);
    const rx = ry * 0.8;
    let out = `<defs>${foil(`${uid}au`, f)}<radialGradient id="${uid}bg" gradientUnits="userSpaceOnUse" cx="${n(cx)}" cy="${n(f.y + f.h * 0.4)}" r="${n(Math.max(f.w, f.h) * 0.75)}"><stop offset="0" stop-color="#6A2736"/><stop offset="0.6" stop-color="#43141F"/><stop offset="1" stop-color="#260A11"/></radialGradient></defs><rect width="${n(g.width)}" height="${n(g.height)}" fill="url(#${uid}bg)"/>`;
    out += rectFrame(f, 7, "#CDAE70", 0.5) + rectFrame(f, 8.6, "#CDAE70", 0.18);
    // Ромбики на углах внутренней рамки
    for (const [x, y] of [
      [f.x + 7, f.y + 7],
      [f.x + f.w - 7, f.y + 7],
      [f.x + 7, f.y + f.h - 7],
      [f.x + f.w - 7, f.y + f.h - 7],
    ])
      out += `<path d="M${n(x)},${n(y - 2.2)} L${n(x + 2.2)},${n(y)} L${n(x)},${n(y + 2.2)} L${n(x - 2.2)},${n(y)}Z" fill="#CDAE70"/>`;
    out += `<path d="${ellipsePath(cx, cy + 1.6, rx + 2, ry + 2)}" fill="#000" fill-opacity="0.35"/>`;
    out += photoSlot(ctx, 0, { x: cx - rx, y: cy - ry, w: rx * 2, h: ry * 2 }, { clip: ellipsePath(cx, cy, rx, ry), scene: 3 });
    out += `<path d="${ellipsePath(cx, cy, rx + 1.3, ry + 1.3)}" fill="none" stroke="${gold}" stroke-width="1.6"/><path d="${ellipsePath(cx, cy, rx + 3.2, ry + 3.2)}" fill="none" stroke="${gold}" stroke-width="0.25"/>`;
    // Жемчужная нить вокруг рамы
    const beads = 64;
    for (let i = 0; i < beads; i++) {
      const t = (i / beads) * Math.PI * 2;
      out += `<circle cx="${n(cx + (rx + 4.6) * Math.cos(t))}" cy="${n(cy + (ry + 4.6) * Math.sin(t))}" r="0.42" fill="${gold}"/>`;
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
    out += `<path d="M${n(cx)},${n(bottom - 1.8)} L${n(cx + 1.8)},${n(bottom)} L${n(cx)},${n(bottom + 1.8)} L${n(cx - 1.8)},${n(bottom)}Z" fill="${gold}"/>`;
    out += sparkle(cx, cy - ry - 8.5, 4.2, gold);
    return out;
  },
  textArea: { x: 0.12, y: 0.655, w: 0.76, h: 0.29 },
  justify: "center",
  title: { font: "cormorant", size: 0.084, color: "#E9CD91", weight: 600, lineHeight: 1.05 },
  subtitle: { font: "cormorant", size: 0.04, color: "#D8BA80", italic: true },
  names: { font: "montserrat", size: 0.022, color: "#CDAE70", weight: 500, upper: true, tracking: 0.3 },
  ornament: { kind: "star", color: "#CDAE70" },
  spine: { color: "#E9CD91", font: "cormorant" },
  back: { color: "#D8BA80", font: "cormorant", area: BACK_AREA },
};

// ─── Паспарту: снимок в белом паспарту со скошенным вырезом на синем льне ─────

const passepartout: CoverTemplate = {
  id: "passepartout",
  mood: "photo",
  requiresPhoto: true,
  samples: ["alatau"],
  texture: { kind: "linen", opacity: 0.32 },
  swatch: "linear-gradient(transparent 0 8%,#f7f3ec 8% 64%,transparent 64%) 50% 0/78% 100% no-repeat,#33414f",
  art: (g, ctx) => {
    const f = g.front;
    const { uid } = ctx;
    const mw = Math.min(f.w * 0.78, f.h * 0.6);
    const mat = { x: f.x + (f.w - mw) / 2, y: f.y + f.h * 0.08, w: mw, h: Math.min(f.h * 0.56, mw * 1.08) };
    const inset = mw * 0.075;
    const win = { x: mat.x + inset, y: mat.y + inset, w: mat.w - inset * 2, h: mat.h - inset * 2 };
    let out = bg(g, "#33414F");
    out += liftShadow(mat, `${uid}s`, { strength: 1.6 });
    out += `<rect x="${n(mat.x)}" y="${n(mat.y)}" width="${n(mat.w)}" height="${n(mat.h)}" fill="#F7F3EC"/>`;
    out += rectFrame(mat, 2.4, "#C9B48A", 0.2);
    // Скос выреза: светлые грани сверху и слева, затенённые снизу и справа — свет падает слева сверху.
    const b = 1.3;
    const o = { x: win.x - b, y: win.y - b, w: win.w + b * 2, h: win.h + b * 2 };
    out += `<path d="M${n(o.x)},${n(o.y)} L${n(o.x + o.w)},${n(o.y)} L${n(win.x + win.w)},${n(win.y)} L${n(win.x)},${n(win.y)} L${n(win.x)},${n(win.y + win.h)} L${n(o.x)},${n(o.y + o.h)}Z" fill="#FFFFFF"/>`;
    out += `<path d="M${n(o.x + o.w)},${n(o.y)} L${n(o.x + o.w)},${n(o.y + o.h)} L${n(o.x)},${n(o.y + o.h)} L${n(win.x)},${n(win.y + win.h)} L${n(win.x + win.w)},${n(win.y + win.h)} L${n(win.x + win.w)},${n(win.y)}Z" fill="#DDD3C3"/>`;
    out += photoSlot(ctx, 0, win, { scene: 1 });
    out += `<rect x="${n(win.x)}" y="${n(win.y)}" width="${n(win.w)}" height="${n(win.h)}" fill="none" stroke="#000" stroke-opacity="0.2" stroke-width="0.2"/>`;
    return out;
  },
  textArea: { x: 0.12, y: 0.67, w: 0.76, h: 0.28 },
  justify: "center",
  title: { font: "cormorant", size: 0.082, color: "#F2E7D2", weight: 500, lineHeight: 1.06 },
  subtitle: { font: "cormorant", size: 0.04, color: "#D2C6B0", italic: true },
  names: { font: "montserrat", size: 0.022, color: "#BDB09A", weight: 500, upper: true, tracking: 0.3 },
  ornament: { kind: "line", color: "#BDB09A" },
  spine: { color: "#F2E7D2", font: "cormorant" },
  back: { color: "#E6DCC8", font: "cormorant", area: BACK_AREA },
};

// ─── Сердце: фото в форме сердца с белой каймой на пудровом фоне ─────────────

const heart: CoverTemplate = {
  id: "heart",
  mood: "photo",
  requiresPhoto: true,
  samples: ["tenderness"],
  texture: { kind: "grain", opacity: 0.08 },
  swatch: "radial-gradient(circle at 37% 30%,#d9a3a8 0 17%,transparent 18%),radial-gradient(circle at 63% 30%,#d9a3a8 0 17%,transparent 18%),conic-gradient(from 135deg at 50% 58%,#d9a3a8 0 90deg,transparent 90deg),#f5deda",
  art: (g, ctx) => {
    const f = g.front;
    const { uid } = ctx;
    const rand = rng(83);
    const s = Math.min(f.w * 0.72, (f.h * 0.5) / 0.92);
    const x0 = f.x + (f.w - s) / 2;
    const y0 = f.y + f.h * 0.08;
    let out = `<defs><radialGradient id="${uid}bg" gradientUnits="userSpaceOnUse" cx="${n(f.x + f.w / 2)}" cy="${n(y0 + s * 0.4)}" r="${n(Math.max(f.w, f.h) * 0.8)}"><stop offset="0" stop-color="#FAEAE6"/><stop offset="1" stop-color="#EECBC6"/></radialGradient></defs><rect width="${n(g.width)}" height="${n(g.height)}" fill="url(#${uid}bg)"/>`;
    // Редкие сердечки, будто рассыпанные конфетти
    for (let i = 0; i < Math.round((g.width * g.height) / 900); i++) {
      const hs = 2.2 + rand() * 2.4;
      out += `<path d="${HEART}" fill="#D99A9F" fill-opacity="${n(0.25 + rand() * 0.3)}" transform="translate(${n(rand() * g.width)},${n(rand() * g.height)}) rotate(${n((rand() - 0.5) * 50)}) scale(${n(hs)})"/>`;
    }
    const tr = `translate(${n(x0)},${n(y0)}) scale(${n(s)})`;
    const k = (s + 6) / s;
    const tr2 = `translate(${n(x0 + s * 0.5 * (1 - k))},${n(y0 + s * 0.46 * (1 - k))}) scale(${n(s * k)})`;
    out += `<defs><filter id="${uid}hs" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.4"/></filter></defs><path d="${HEART}" fill="#7C2236" fill-opacity="0.22" filter="url(#${uid}hs)" transform="translate(0.6 2.4) ${tr2}"/>`;
    out += `<path d="${HEART}" fill="#FFFFFF" transform="${tr2}"/>`;
    out += photoSlot(ctx, 0, { x: x0, y: y0, w: s, h: s * 0.92 }, { clip: HEART, clipTransform: tr, scene: 0 });
    const k2 = (s + 13) / s;
    out += `<path d="${HEART}" fill="none" stroke="#C4566A" stroke-width="${n(0.3 / (s * k2))}" transform="translate(${n(x0 + s * 0.5 * (1 - k2))},${n(y0 + s * 0.46 * (1 - k2))}) scale(${n(s * k2)})"/>`;
    return out;
  },
  textArea: { x: 0.1, y: 0.62, w: 0.8, h: 0.32 },
  justify: "center",
  title: { font: "cormorant", size: 0.088, color: "#7C2236", weight: 500, italic: true, lineHeight: 1.05 },
  subtitle: { font: "cormorant", size: 0.042, color: "#9C4B5B", italic: true },
  names: { font: "cormorant", size: 0.045, color: "#9C4B5B", italic: true },
  ornament: { kind: "heart", color: "#C4566A" },
  spine: { color: "#7C2236", font: "cormorant" },
  back: { color: "#7C2236", font: "cormorant", area: BACK_AREA },
};

// ─── Глянец: фото во всю обложку, крупное название-«шапка» слева, как у журнала ─

const magazine: CoverTemplate = {
  id: "magazine",
  mood: "photo",
  requiresPhoto: true,
  samples: ["sakura"],
  swatch: "linear-gradient(180deg,#2a2a2a,#7d7d7d 55%,#4a4a4a)",
  art: (g, ctx) => {
    const { uid } = ctx;
    let out = bg(g, "#1B1B1B") + photoSlot(ctx, 0, bleedRect(g), { scene: 1 });
    out += shade(g, `${uid}sh`, [
      [0, "#000", 0.6],
      [0.4, "#000", 0],
      [0.8, "#000", 0],
      [1, "#000", 0.32],
    ]);
    const f = g.front;
    out += `<line x1="${n(f.x + f.w * 0.08)}" y1="${n(f.y + f.h - 11)}" x2="${n(f.x + f.w * 0.92)}" y2="${n(f.y + f.h - 11)}" stroke="#FFFFFF" stroke-opacity="0.75" stroke-width="0.25"/>`;
    return out;
  },
  textArea: { x: 0.08, y: 0.06, w: 0.84, h: 0.34 },
  justify: "start",
  align: "left",
  namesFirst: true,
  title: { font: "playfair", size: 0.112, color: "#FFFFFF", weight: 400, lineHeight: 0.98 },
  subtitle: { font: "playfair", size: 0.042, color: "#F4F1EC", italic: true },
  names: { font: "montserrat", size: 0.022, color: "#F4F1EC", weight: 600, upper: true, tracking: 0.34 },
  ornament: { kind: "line", color: "#FFFFFF" },
  spine: { color: "#FFFFFF", font: "playfair" },
  back: { color: "#E9E9E9", font: "playfair", area: BACK_AREA },
};

// ─── Дуотон и Индиго: фото в два цвета ───────────────────────────────────────

function duo(id: string, stops: string[], base: string, swatch: string, sample: string, text: { title: string; soft: string }): CoverTemplate {
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

const duotone = duo("duotone", ["#3F1232", "#C8607A", "#FCE6D6"], "#4A1638", "linear-gradient(180deg,#f3b9a8,#c8607a 50%,#4a1638)", "alatau", { title: "#FFF3EA", soft: "#FBDCCD" });
const indigo = duo("indigo", ["#101B36", "#3F6AA6", "#EAF1F8"], "#14213D", "linear-gradient(180deg,#e6eef5,#3f6aa6 50%,#14213d)", "mist", { title: "#F4F8FC", soft: "#CFDDEE" });

// ─── Коллаж: большой кадр и два поменьше, как в фотокниге ────────────────────

const collage: CoverTemplate = {
  id: "collage",
  mood: "photo",
  requiresPhoto: true,
  photoSlots: 3,
  samples: ["tenderness", "alatau", "dusk"],
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
    const ly = y + h1 + gap + h2 + f.h * 0.035;
    out += `<line x1="${n(f.x + f.w / 2 - 6)}" y1="${n(ly)}" x2="${n(f.x + f.w / 2 + 6)}" y2="${n(ly)}" stroke="#C2A88F" stroke-width="0.3"/>`;
    return out;
  },
  textArea: { x: 0.08, y: 0.725, w: 0.84, h: 0.23 },
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
  samples: ["dusk", "meadow", "peaks", "sakura"],
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
  samples: ["peaks", "sakura", "surf"],
  texture: { kind: "grain", opacity: 0.16 },
  swatch: "linear-gradient(-5deg,transparent 0 22%,#141110 22% 49%,transparent 49%),#3a3230",
  art: (g, ctx) => {
    const f = g.front;
    const { uid } = ctx;
    const bgColor = "#2E2725";
    const sh = Math.min(f.h * 0.27, f.w * 0.38);
    const cx = f.x + f.w / 2;
    const cy = f.y + f.h * 0.63;
    const hb = sh * 0.16;
    const fh = sh - hb * 2 - 1.2;
    const gap = 3.2;
    const fw = Math.min(fh * 1.32, (f.w * 0.92 - gap * 2) / 3);
    const x0 = f.x - 30;
    const x1 = g.width + 30;
    const top = cy - sh / 2;
    const faceRect = { x: f.x, y: 0, w: g.width - f.x, h: g.height };
    let out = bg(g, bgColor);
    // Тёплые засветы плёнки — сверху слева и мягче справа внизу
    out += glow(`${uid}g1`, f.x + f.w * 0.12, f.y + f.h * 0.1, f.w * 0.85, "#D9834A", 0.5, faceRect);
    out += glow(`${uid}g2`, f.x + f.w * 0.95, f.y + f.h * 0.98, f.w * 0.6, "#B4475A", 0.35, faceRect);
    out += `<defs><clipPath id="${uid}fc"><rect x="${n(f.x)}" y="0" width="${n(g.width - f.x)}" height="${n(g.height)}"/></clipPath><filter id="${uid}ss" x="-10%" y="-40%" width="120%" height="180%"><feGaussianBlur stdDeviation="2.2"/></filter></defs>`;
    let strip = `<rect x="${n(x0)}" y="${n(top + 2.2)}" width="${n(x1 - x0)}" height="${n(sh)}" fill="#000" fill-opacity="0.45" filter="url(#${uid}ss)"/>`;
    strip += `<rect x="${n(x0)}" y="${n(top)}" width="${n(x1 - x0)}" height="${n(sh)}" fill="#14110F"/>`;
    // Перфорация — сквозь неё виден фон
    for (let x = x0; x < x1; x += 4.6)
      for (const y of [top + hb * 0.25, top + sh - hb * 0.75]) strip += `<rect x="${n(x)}" y="${n(y)}" width="2.4" height="${n(hb * 0.5)}" rx="0.5" fill="#3A302D"/>`;
    const fx0 = cx - (fw * 3 + gap * 2) / 2;
    const deg = -5;
    for (let i = 0; i < 3; i++) {
      const fx = fx0 + i * (fw + gap);
      strip += photoSlot(ctx, i, { x: fx, y: cy - fh / 2, w: fw, h: fh }, { scene: i + 1, rotate: { deg, cx, cy } });
      // Оранжевые метки кадров на кромке
      strip += `<path d="M${n(fx + fw / 2 - 1)},${n(top + sh - hb * 0.08)} l1,-1.2 l1,1.2Z" fill="#D88A3D"/>`;
    }
    out += `<g clip-path="url(#${uid}fc)"><g transform="rotate(${deg} ${n(cx)} ${n(cy)})">${strip}</g></g>`;
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

// ─── Монохром: чёрно-белый снимок во всю обложку в тонкой белой рамке ────────

const mono: CoverTemplate = {
  id: "mono",
  mood: "photo",
  requiresPhoto: true,
  samples: ["peaks"],
  texture: { kind: "grain", opacity: 0.18 },
  swatch: "linear-gradient(180deg,#9a9a9a,#3a3a3a 70%,#111)",
  art: (g, ctx) => {
    const { uid } = ctx;
    const f = g.front;
    let out = `<defs>${toneFilter(`${uid}bw`, "mono")}</defs>${bg(g, "#121212")}`;
    out += photoSlot(ctx, 0, bleedRect(g), { scene: 1, filter: `${uid}bw` });
    out += shade(g, `${uid}sh`, [
      [0.45, "#000", 0],
      [1, "#000", 0.72],
    ]);
    out += rectFrame(f, 7, "#FFFFFF", 0.3, 0.85);
    return out;
  },
  textArea: { x: 0.12, y: 0.63, w: 0.76, h: 0.29 },
  justify: "end",
  title: { font: "playfair", size: 0.098, color: "#FFFFFF", weight: 400, lineHeight: 1.04 },
  subtitle: { font: "playfair", size: 0.04, color: "#E2E2E2", italic: true },
  names: { font: "montserrat", size: 0.022, color: "#E2E2E2", weight: 500, upper: true, tracking: 0.36 },
  ornament: { kind: "line", color: "#FFFFFF" },
  spine: { color: "#FFFFFF", font: "playfair" },
  back: { color: "#E2E2E2", font: "playfair", area: BACK_AREA },
};

// ─── Сияние: тёплый снимок во всю обложку с засветами, как на плёнке ──────────

const glowCover: CoverTemplate = {
  id: "glow",
  mood: "photo",
  requiresPhoto: true,
  samples: ["meadow"],
  texture: { kind: "grain", opacity: 0.14 },
  swatch: "radial-gradient(circle at 85% 10%,#ffb36b,transparent 45%),radial-gradient(circle at 10% 80%,#ff7f8e,transparent 40%),linear-gradient(180deg,#c89a7a,#6e4a3a)",
  art: (g, ctx) => {
    const { uid } = ctx;
    const f = g.front;
    const r = bleedRect(g);
    let out = `<defs>${toneFilter(`${uid}w`, "warm")}</defs>${bg(g, "#3A2620")}`;
    out += photoSlot(ctx, 0, r, { scene: 2, filter: `${uid}w` });
    out += glow(`${uid}a`, f.x + f.w * 1.02, f.y - f.h * 0.02, f.w * 0.9, "#FF9A4D", 0.62, r);
    out += glow(`${uid}b`, f.x - f.w * 0.05, f.y + f.h * 0.88, f.w * 0.7, "#FF6B86", 0.42, r);
    out += shade(g, `${uid}sh`, [
      [0.5, "#2A1410", 0],
      [1, "#2A1410", 0.62],
    ]);
    return out;
  },
  textArea: { x: 0.1, y: 0.62, w: 0.8, h: 0.3 },
  justify: "end",
  title: { font: "cormorant", size: 0.112, color: "#FFF6EC", weight: 500, italic: true, lineHeight: 1.0 },
  subtitle: { font: "cormorant", size: 0.046, color: "#FCE3CF", italic: true },
  names: { font: "montserrat", size: 0.022, color: "#FCE3CF", weight: 500, upper: true, tracking: 0.32 },
  ornament: { kind: "star", color: "#FFD9B0" },
  spine: { color: "#FFF6EC", font: "cormorant" },
  back: { color: "#FCE3CF", font: "cormorant", area: BACK_AREA },
};

// ─── Журнал: снимок на верхних двух третях, снизу цветная плашка с текстом слева ─

const split: CoverTemplate = {
  id: "split",
  mood: "photo",
  requiresPhoto: true,
  samples: ["dusk"],
  texture: { kind: "grain", opacity: 0.1 },
  swatch: "linear-gradient(180deg,#b9a3a6 0 60%,#9c4a33 60%)",
  art: (g, ctx) => {
    const f = g.front;
    const band = f.y + f.h * 0.6;
    let out = bg(g, "#9C4A33");
    out += photoSlot(ctx, 0, { x: f.x, y: 0, w: g.width - f.x, h: band }, { scene: 0 });
    out += `<rect x="${n(f.x)}" y="${n(band)}" width="${n(g.width - f.x)}" height="0.9" fill="#E9C9A8"/>`;
    return out;
  },
  textArea: { x: 0.09, y: 0.655, w: 0.82, h: 0.29 },
  justify: "start",
  align: "left",
  namesFirst: true,
  title: { font: "playfair", size: 0.09, color: "#FBF1E6", weight: 400, lineHeight: 1.02 },
  subtitle: { font: "playfair", size: 0.04, color: "#F0D3BC", italic: true },
  names: { font: "montserrat", size: 0.021, color: "#F0D3BC", weight: 600, upper: true, tracking: 0.32 },
  ornament: { kind: "line", color: "#E9C9A8" },
  spine: { color: "#FBF1E6", font: "playfair" },
  back: { color: "#FBF1E6", font: "playfair", area: BACK_AREA },
};

// ─── Дымка: снимок растворяется в тёплой бумаге, название — на бумаге ─────────

const fade: CoverTemplate = {
  id: "fade",
  mood: "photo",
  requiresPhoto: true,
  samples: ["meadow"],
  texture: { kind: "grain", opacity: 0.1 },
  swatch: "linear-gradient(180deg,#c7ad94 0,#d9c7b3 45%,#f4eee6 68%)",
  art: (g, ctx) => {
    const f = g.front;
    const { uid } = ctx;
    const paper = "#F4EEE6";
    const h = f.y + f.h * 0.7;
    let out = `<defs>${toneFilter(`${uid}t`, "fade")}</defs>${bg(g, paper)}`;
    out += photoSlot(ctx, 0, { x: f.x, y: 0, w: g.width - f.x, h }, { scene: 0, filter: `${uid}t` });
    const y0 = f.y + f.h * 0.36;
    out += `<defs><linearGradient id="${uid}fd" gradientUnits="userSpaceOnUse" x1="0" y1="${n(y0)}" x2="0" y2="${n(h)}"><stop offset="0" stop-color="${paper}" stop-opacity="0"/><stop offset="0.55" stop-color="${paper}" stop-opacity="0.72"/><stop offset="1" stop-color="${paper}"/></linearGradient></defs>`;
    out += `<rect x="${n(f.x)}" y="${n(y0)}" width="${n(g.width - f.x)}" height="${n(h - y0 + 0.5)}" fill="url(#${uid}fd)"/>`;
    return out;
  },
  textArea: { x: 0.1, y: 0.63, w: 0.8, h: 0.29 },
  justify: "center",
  title: { font: "cormorant", size: 0.1, color: "#3E2F25", weight: 500, italic: true, lineHeight: 1.02 },
  subtitle: { font: "cormorant", size: 0.044, color: "#6E5A4B", italic: true },
  names: { font: "montserrat", size: 0.022, color: "#86705F", weight: 500, upper: true, tracking: 0.3 },
  ornament: { kind: "line", color: "#A8896F" },
  spine: { color: "#3E2F25", font: "cormorant" },
  back: { color: "#3E2F25", font: "cormorant", area: BACK_AREA },
};

// ─── Обрывок: снимок сверху, снизу — лист бумаги с рваным краем ──────────────

const torn: CoverTemplate = {
  id: "torn",
  mood: "photo",
  requiresPhoto: true,
  samples: ["surf"],
  texture: { kind: "grain", opacity: 0.12 },
  swatch: "linear-gradient(176deg,#6fb0b5 0 60%,#f6f1e8 62%)",
  art: (g, ctx) => {
    const f = g.front;
    const { uid } = ctx;
    const edge = f.y + f.h * 0.6;
    let out = bg(g, "#F6F1E8");
    out += photoSlot(ctx, 0, { x: f.x, y: 0, w: g.width - f.x, h: edge + 6 }, { scene: 1 });
    const x0 = f.x - 6;
    const x1 = g.width + 2;
    // Лист и его тень — только на лице: на корешке и обороте фон и так цвета бумаги.
    out += `<defs><filter id="${uid}ts" x="-5%" y="-30%" width="110%" height="160%"><feGaussianBlur stdDeviation="1.3"/></filter><clipPath id="${uid}tc"><rect x="${n(f.x)}" y="0" width="${n(g.width - f.x)}" height="${n(g.height)}"/></clipPath></defs><g clip-path="url(#${uid}tc)">`;
    out += `<path d="${tornEdgePath(x0, x1, edge - 0.6, 1.1, 7, g.height + 2)}" fill="#000" fill-opacity="0.32" filter="url(#${uid}ts)"/>`;
    // Белые волокна на линии отрыва, под ними — сам лист
    out += `<path d="${tornEdgePath(x0, x1, edge, 1.1, 7, g.height + 2)}" fill="#FFFFFF"/>`;
    out += `<path d="${tornEdgePath(x0, x1, edge + 1.3, 0.9, 13, g.height + 2)}" fill="#F6F1E8"/></g>`;
    return out;
  },
  textArea: { x: 0.1, y: 0.645, w: 0.8, h: 0.3 },
  justify: "center",
  title: { font: "cormorant", size: 0.098, color: "#24343A", weight: 500, italic: true, lineHeight: 1.02 },
  subtitle: { font: "cormorant", size: 0.044, color: "#4E6268", italic: true },
  names: { font: "caveat", size: 0.05, color: "#3D6F78", weight: 500 },
  ornament: { kind: "dots", color: "#7FA8AE" },
  spine: { color: "#24343A", font: "cormorant" },
  back: { color: "#24343A", font: "cormorant", area: BACK_AREA },
};

// ─── Галерея: картина в золочёной раме с подсветкой на изумрудной стене ───────

const gallery: CoverTemplate = {
  id: "gallery",
  mood: "photo",
  requiresPhoto: true,
  samples: ["peony"],
  texture: { kind: "linen", opacity: 0.22 },
  swatch: "linear-gradient(transparent 0 12%,#c9a45c 12% 62%,transparent 62%) 50% 0/62% 100% no-repeat,radial-gradient(circle at 50% 20%,#3d5f50,#1c3029)",
  art: (g, ctx) => {
    const f = g.front;
    const { uid } = ctx;
    const W = Math.min(f.w * 0.64, f.h * 0.42);
    const H = W * 1.24;
    const x = f.x + (f.w - W) / 2;
    const y = f.y + f.h * 0.115;
    const fw = W * 0.075;
    const mat = W * 0.09;
    const cx = x + W / 2;
    let out = `<defs>${foil(`${uid}au`, { x, y, w: W, h: H })}<radialGradient id="${uid}wall" gradientUnits="userSpaceOnUse" cx="${n(cx)}" cy="${n(y + H * 0.25)}" r="${n(Math.max(f.w, f.h) * 0.8)}"><stop offset="0" stop-color="#3F6352"/><stop offset="0.55" stop-color="#26423A"/><stop offset="1" stop-color="#162822"/></radialGradient></defs>`;
    out += `<rect width="${n(g.width)}" height="${n(g.height)}" fill="url(#${uid}wall)"/>`;
    // Свет лампы над картиной — мягкий конус вниз
    out += `<defs><linearGradient id="${uid}cone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF1CF" stop-opacity="0.32"/><stop offset="1" stop-color="#FFF1CF" stop-opacity="0"/></linearGradient><filter id="${uid}cb" x="-20%" y="-10%" width="140%" height="120%"><feGaussianBlur stdDeviation="3"/></filter></defs>`;
    out += `<path d="M${n(cx - W * 0.16)},${n(y - fw * 0.5)} L${n(cx + W * 0.16)},${n(y - fw * 0.5)} L${n(cx + W * 0.62)},${n(y + H * 0.75)} L${n(cx - W * 0.62)},${n(y + H * 0.75)}Z" fill="url(#${uid}cone)" filter="url(#${uid}cb)"/>`;
    const frame = { x, y, w: W, h: H };
    out += liftShadow(frame, `${uid}s`, { strength: 1.8 });
    out += `<rect x="${n(x)}" y="${n(y)}" width="${n(W)}" height="${n(H)}" fill="url(#${uid}au)"/>`;
    // Профиль багета: тёмная канавка и светлая кромка
    out += rectFrame(frame, fw * 0.35, "#6E5121", 0.35, 0.8) + rectFrame(frame, fw * 0.08, "#FFF0C2", 0.25, 0.7);
    const inner = { x: x + fw, y: y + fw, w: W - fw * 2, h: H - fw * 2 };
    out += `<rect x="${n(inner.x)}" y="${n(inner.y)}" width="${n(inner.w)}" height="${n(inner.h)}" fill="#F6F1E6"/>`;
    out += `<rect x="${n(inner.x)}" y="${n(inner.y)}" width="${n(inner.w)}" height="1.1" fill="#000" fill-opacity="0.12"/>`;
    const win = { x: inner.x + mat, y: inner.y + mat, w: inner.w - mat * 2, h: inner.h - mat * 2 };
    out += photoSlot(ctx, 0, win, { scene: 0 });
    out += `<rect x="${n(win.x)}" y="${n(win.y)}" width="${n(win.w)}" height="${n(win.h)}" fill="none" stroke="#000" stroke-opacity="0.22" stroke-width="0.25"/>`;
    // Латунная лампа-подсветка над рамой
    const lw = W * 0.34;
    out += `<path d="M${n(cx - 0.4)},${n(y - fw * 0.2)} L${n(cx - 0.4)},${n(y - fw * 1.2)} L${n(cx + 0.4)},${n(y - fw * 1.2)} L${n(cx + 0.4)},${n(y - fw * 0.2)}Z" fill="url(#${uid}au)"/>`;
    out += `<rect x="${n(cx - lw / 2)}" y="${n(y - fw * 1.9)}" width="${n(lw)}" height="${n(fw * 0.8)}" rx="${n(fw * 0.4)}" fill="url(#${uid}au)"/>`;
    return out;
  },
  textArea: { x: 0.12, y: 0.665, w: 0.76, h: 0.29 },
  justify: "center",
  title: { font: "cormorant", size: 0.082, color: "#EBD39C", weight: 600, lineHeight: 1.05 },
  subtitle: { font: "cormorant", size: 0.04, color: "#D7C190", italic: true },
  names: { font: "montserrat", size: 0.021, color: "#C9AE74", weight: 500, upper: true, tracking: 0.32 },
  ornament: { kind: "line", color: "#C9AE74" },
  spine: { color: "#EBD39C", font: "cormorant" },
  back: { color: "#D7C190", font: "cormorant", area: BACK_AREA },
};

// ─── Марка: снимок на почтовой марке со штемпелем, кайма авиапочты ───────────

const stamp: CoverTemplate = {
  id: "stamp",
  mood: "photo",
  requiresPhoto: true,
  samples: ["sakura"],
  texture: { kind: "grain", opacity: 0.12 },
  swatch: "repeating-linear-gradient(45deg,#c8443f 0 6px,#f3ecdf 6px 12px,#2f5d8c 12px 18px,#f3ecdf 18px 24px)",
  art: (g, ctx) => {
    const f = g.front;
    const { uid } = ctx;
    const paper = "#F3ECDF";
    let out = bg(g, paper);
    // Кайма авиапочты по лицу: наклонные полоски красный — бумага — синий — бумага
    const inset = 5;
    const bw = 4.2;
    const outer = { x: f.x + inset, y: f.y + inset, w: f.w - inset * 2, h: f.h - inset * 2 };
    const innerR = { x: outer.x + bw, y: outer.y + bw, w: outer.w - bw * 2, h: outer.h - bw * 2 };
    out += `<defs><pattern id="${uid}am" patternUnits="userSpaceOnUse" width="16" height="16" patternTransform="rotate(45)"><rect width="4" height="16" fill="#C8443F"/><rect x="8" width="4" height="16" fill="#2F5D8C"/></pattern><clipPath id="${uid}bd"><path d="${rectPath(outer)} ${rectPath({ ...innerR, x: innerR.x + innerR.w, w: -innerR.w })}" clip-rule="evenodd"/></clipPath></defs>`;
    out += `<g clip-path="url(#${uid}bd)"><rect x="${n(outer.x)}" y="${n(outer.y)}" width="${n(outer.w)}" height="${n(outer.h)}" fill="url(#${uid}am)"/></g>`;
    const sw = Math.min(f.w * 0.56, f.h * 0.4);
    const sh = sw * 1.2;
    const cx = f.x + f.w / 2;
    const sy = f.y + f.h * 0.115;
    const cy = sy + sh / 2;
    const deg = -2.5;
    const st = { x: cx - sw / 2, y: sy, w: sw, h: sh };
    const rot = `rotate(${deg} ${n(cx)} ${n(cy)})`;
    out += liftShadow(st, `${uid}s`, { transform: rot, strength: 0.9 });
    let body = `<rect x="${n(st.x)}" y="${n(st.y)}" width="${n(sw)}" height="${n(sh)}" fill="#FFFDF8"/>`;
    const m = sw * 0.075;
    const win = { x: st.x + m, y: st.y + m, w: sw - m * 2, h: sh - m * 2.6 };
    body += photoSlot(ctx, 0, win, { scene: 0, rotate: { deg, cx, cy } });
    body += `<rect x="${n(win.x)}" y="${n(win.y)}" width="${n(win.w)}" height="${n(win.h)}" fill="none" stroke="#2F2A26" stroke-opacity="0.35" stroke-width="0.25"/>`;
    // Номинал марки — маленькое сердечко в нижнем поле
    const hs = m * 0.9;
    const below = win.y + win.h;
    body += `<path d="${HEART}" fill="#C8443F" transform="translate(${n(cx - hs / 2)},${n(below + (st.y + sh - below - hs * 0.92) / 2)}) scale(${n(hs)})"/>`;
    // Зубцы перфорации: «дырки» цветом бумаги по краю марки
    const r = 1.05;
    const step = 3.1;
    for (let x = st.x + step / 2; x < st.x + sw; x += step) for (const y of [st.y, st.y + sh]) body += `<circle cx="${n(x)}" cy="${n(y)}" r="${r}" fill="${paper}"/>`;
    for (let y = st.y + step / 2; y < st.y + sh; y += step) for (const x of [st.x, st.x + sw]) body += `<circle cx="${n(x)}" cy="${n(y)}" r="${r}" fill="${paper}"/>`;
    out += `<g transform="${rot}">${body}</g>`;
    out += postmark(st.x + sw * 0.92, st.y + sh * 0.12, sw * 0.17, "#2B2B33", 0.5);
    return out;
  },
  textArea: { x: 0.12, y: 0.63, w: 0.76, h: 0.3 },
  justify: "center",
  title: { font: "playfair", size: 0.08, color: "#2B2A33", weight: 400, italic: true, lineHeight: 1.05 },
  subtitle: { font: "playfair", size: 0.038, color: "#5C5A66", italic: true },
  names: { font: "caveat", size: 0.055, color: "#2F5D8C", weight: 500 },
  ornament: { kind: "heart", color: "#C8443F" },
  spine: { color: "#2B2A33", font: "playfair" },
  back: { color: "#2B2A33", font: "playfair", area: BACK_AREA },
};

// ─── Ретро: снимок в сепии с фигурным краем на старой бумаге ──────────────────

const vintage: CoverTemplate = {
  id: "retro",
  mood: "photo",
  requiresPhoto: true,
  samples: ["alatau"],
  texture: { kind: "grain", opacity: 0.2 },
  swatch: "radial-gradient(ellipse at 50% 38%,#f8f2e6 0 30%,transparent 31%),radial-gradient(circle,#eadcc3,#c9b28c)",
  art: (g, ctx) => {
    const f = g.front;
    const { uid } = ctx;
    let out = `<defs>${toneFilter(`${uid}sp`, "sepia")}<radialGradient id="${uid}pp" gradientUnits="userSpaceOnUse" cx="${n(f.x + f.w / 2)}" cy="${n(f.y + f.h * 0.45)}" r="${n(Math.max(f.w, f.h) * 0.75)}"><stop offset="0.35" stop-color="#EEE2CB"/><stop offset="1" stop-color="#CDB590"/></radialGradient></defs><rect width="${n(g.width)}" height="${n(g.height)}" fill="url(#${uid}pp)"/>`;
    out += rectFrame(f, 7.5, "#8C6A43", 0.35) + rectFrame(f, 9, "#8C6A43", 0.15);
    const cw = Math.min(f.w * 0.62, f.h * 0.44);
    const ch = cw * 1.12;
    const cx = f.x + f.w / 2;
    const cy = f.y + f.h * 0.355;
    const card = { x: cx - cw / 2, y: cy - ch / 2, w: cw, h: ch };
    const deg = 2.5;
    const rot = `rotate(${deg} ${n(cx)} ${n(cy)})`;
    const edge = scallopPath(card, 2.6);
    out += liftShadow(card, `${uid}s`, { path: edge, transform: rot, strength: 0.9 });
    out += `<g transform="${rot}"><path d="${edge}" fill="#F9F4EA"/>`;
    const m = cw * 0.07;
    const win = { x: card.x + m, y: card.y + m, w: cw - m * 2, h: ch - m * 2 };
    out += photoSlot(ctx, 0, win, { scene: 2, filter: `${uid}sp`, rotate: { deg, cx, cy } });
    out += `<rect x="${n(win.x)}" y="${n(win.y)}" width="${n(win.w)}" height="${n(win.h)}" fill="none" stroke="#5A4128" stroke-opacity="0.25" stroke-width="0.2"/></g>`;
    return out;
  },
  textArea: { x: 0.13, y: 0.63, w: 0.74, h: 0.3 },
  justify: "center",
  title: { font: "cormorant", size: 0.072, color: "#4A3420", weight: 600, upper: true, tracking: 0.08, lineHeight: 1.12 },
  subtitle: { font: "cormorant", size: 0.042, color: "#6E5236", italic: true },
  names: { font: "cormorant", size: 0.044, color: "#6E5236", italic: true },
  ornament: { kind: "star", color: "#8C6A43" },
  spine: { color: "#4A3420", font: "cormorant" },
  back: { color: "#4A3420", font: "cormorant", area: BACK_AREA },
};

// ─── Круг: снимок в круге, кольцо и цветной круг-тень на шалфейном фоне ───────

const circle: CoverTemplate = {
  id: "circle",
  mood: "photo",
  requiresPhoto: true,
  samples: ["lavender"],
  texture: { kind: "grain", opacity: 0.1 },
  swatch: "radial-gradient(circle at 50% 37%,#b5a6c6 0 27%,transparent 28%),#c7ccb6",
  art: (g, ctx) => {
    const f = g.front;
    const r = Math.min(f.w * 0.31, f.h * 0.215);
    const cx = f.x + f.w / 2;
    const cy = f.y + f.h * 0.355;
    const line = "#F5F1E6";
    let out = bg(g, "#C5CBB3");
    out += `<circle cx="${n(cx + r * 0.16)}" cy="${n(cy + r * 0.13)}" r="${n(r)}" fill="#ABB396"/>`;
    out += photoSlot(ctx, 0, { x: cx - r, y: cy - r, w: r * 2, h: r * 2 }, { clip: ellipsePath(cx, cy, r, r), scene: 3 });
    out += `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r + 4)}" fill="none" stroke="${line}" stroke-width="0.35"/>`;
    // Метки на кольце — по сторонам света, как на циферблате
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      out += `<circle cx="${n(cx + Math.cos(a) * (r + 4))}" cy="${n(cy + Math.sin(a) * (r + 4))}" r="0.8" fill="${line}"/>`;
    }
    return out;
  },
  textArea: { x: 0.1, y: 0.63, w: 0.8, h: 0.31 },
  justify: "center",
  title: { font: "cormorant", size: 0.088, color: "#2F3A2A", weight: 500, lineHeight: 1.04 },
  subtitle: { font: "cormorant", size: 0.042, color: "#4A5642", italic: true },
  names: { font: "montserrat", size: 0.021, color: "#4F5B46", weight: 500, upper: true, tracking: 0.32 },
  ornament: { kind: "dots", color: "#F5F1E6" },
  spine: { color: "#2F3A2A", font: "cormorant" },
  back: { color: "#2F3A2A", font: "cormorant", area: BACK_AREA },
};

// ─── Ленты: снимок сквозь вертикальные прорези разной высоты ──────────────────

const strips: CoverTemplate = {
  id: "strips",
  mood: "photo",
  requiresPhoto: true,
  samples: ["peaks"],
  texture: { kind: "grain", opacity: 0.08 },
  swatch: "linear-gradient(90deg,#9cb0c0 0 22%,transparent 22% 26%,#9cb0c0 26% 48%,transparent 48% 52%,#9cb0c0 52% 74%,transparent 74% 78%,#9cb0c0 78%) 50% 20%/84% 50% no-repeat,#f2eee8",
  art: (g, ctx) => {
    const f = g.front;
    const { uid } = ctx;
    const R = { x: f.x + f.w * 0.08, y: f.y + f.h * 0.07, w: f.w * 0.84, h: f.h * 0.58 };
    const k = 4;
    const gap = 2.4;
    const sw = (R.w - gap * (k - 1)) / k;
    const tops = [0.07, 0, 0.11, 0.03];
    const bottoms = [0.04, 0.1, 0, 0.07];
    const rects = Array.from({ length: k }, (_, i) => ({ x: R.x + i * (sw + gap), y: R.y + R.h * tops[i], w: sw, h: R.h * (1 - tops[i] - bottoms[i]) }));
    let out = bg(g, "#F2EEE8");
    out += `<defs><clipPath id="${uid}sl">${rects.map((r) => `<rect x="${n(r.x)}" y="${n(r.y)}" width="${n(r.w)}" height="${n(r.h)}"/>`).join("")}</clipPath></defs>`;
    for (const [i, r] of rects.entries()) out += liftShadow(r, `${uid}s${i}`, { strength: 0.5 });
    out += `<g clip-path="url(#${uid}sl)">${photoSlot(ctx, 0, R, { scene: 1 })}</g>`;
    return out;
  },
  textArea: { x: 0.08, y: 0.68, w: 0.84, h: 0.27 },
  justify: "center",
  title: { font: "playfair", size: 0.08, color: "#22272E", weight: 400, lineHeight: 1.05 },
  subtitle: { font: "playfair", size: 0.038, color: "#5B636D", italic: true },
  names: { font: "montserrat", size: 0.021, color: "#6E7782", weight: 600, upper: true, tracking: 0.34 },
  ornament: { kind: "line", color: "#9AA6B2" },
  spine: { color: "#22272E", font: "playfair" },
  back: { color: "#22272E", font: "playfair", area: BACK_AREA },
};

// ─── Минимализм: небольшой снимок на льне и тихая типографика ────────────────

const minimal: CoverTemplate = {
  id: "minimal",
  mood: "photo",
  requiresPhoto: true,
  samples: ["dusk"],
  texture: { kind: "linen", opacity: 0.28 },
  swatch: "linear-gradient(#b8a7a8,#b8a7a8) 50% 26%/52% 44% no-repeat,#e9e4da",
  art: (g, ctx) => {
    const f = g.front;
    const { uid } = ctx;
    const w = Math.min(f.w * 0.52, f.h * 0.36);
    const h = w * 1.25;
    const r = { x: f.x + (f.w - w) / 2, y: f.y + f.h * 0.13, w, h };
    let out = bg(g, "#E9E4DA");
    out += liftShadow(r, `${uid}s`, { strength: 0.55 });
    out += photoSlot(ctx, 0, r, { scene: 0 });
    return out;
  },
  textArea: { x: 0.12, y: 0.64, w: 0.76, h: 0.28 },
  justify: "center",
  title: { font: "cormorant", size: 0.07, color: "#2E2A26", weight: 500, upper: true, tracking: 0.14, lineHeight: 1.15 },
  subtitle: { font: "cormorant", size: 0.04, color: "#6A625A", italic: true },
  names: { font: "montserrat", size: 0.019, color: "#7A7168", weight: 500, upper: true, tracking: 0.4 },
  ornament: { kind: "line", color: "#9A8F84" },
  spine: { color: "#2E2A26", font: "cormorant" },
  back: { color: "#2E2A26", font: "cormorant", area: BACK_AREA },
};

// ─── Диптих: два высоких кадра рядом в общей тонкой рамке ────────────────────

const diptych: CoverTemplate = {
  id: "diptych",
  mood: "photo",
  requiresPhoto: true,
  photoSlots: 2,
  samples: ["dusk", "meadow"],
  texture: { kind: "grain", opacity: 0.08 },
  swatch: "linear-gradient(90deg,#b9a3a6 0 49%,transparent 49% 51%,#c9b08f 51%) 50% 14%/76% 50% no-repeat,#efeae2",
  art: (g, ctx) => {
    const f = g.front;
    const W = Math.min(f.w * 0.76, f.h * 0.6);
    const H = Math.min(f.h * 0.52, W * 1.0);
    const x = f.x + (f.w - W) / 2;
    const y = f.y + f.h * 0.1;
    const gap = 3;
    const w = (W - gap) / 2;
    let out = bg(g, "#EFEAE2");
    out += photoSlot(ctx, 0, { x, y, w, h: H }, { scene: 0 });
    out += photoSlot(ctx, 1, { x: x + w + gap, y, w, h: H }, { scene: 2 });
    out += `<rect x="${n(x - 3.2)}" y="${n(y - 3.2)}" width="${n(W + 6.4)}" height="${n(H + 6.4)}" fill="none" stroke="#9C8B78" stroke-width="0.25"/>`;
    return out;
  },
  textArea: { x: 0.1, y: 0.66, w: 0.8, h: 0.29 },
  justify: "center",
  title: { font: "cormorant", size: 0.088, color: "#352B24", weight: 500, italic: true, lineHeight: 1.04 },
  subtitle: { font: "cormorant", size: 0.042, color: "#6A5B4F", italic: true },
  names: { font: "montserrat", size: 0.021, color: "#857464", weight: 500, upper: true, tracking: 0.32 },
  ornament: { kind: "line", color: "#9C8B78" },
  spine: { color: "#352B24", font: "cormorant" },
  back: { color: "#352B24", font: "cormorant", area: BACK_AREA },
};

// ─── Стопка: три полароида веером на крафтовой бумаге ────────────────────────

const stack: CoverTemplate = {
  id: "stack",
  mood: "photo",
  requiresPhoto: true,
  photoSlots: 3,
  samples: ["sakura", "surf", "meadow"],
  texture: { kind: "grain", opacity: 0.22 },
  swatch: "linear-gradient(-8deg,transparent 0 30%,#fff 30% 60%,transparent 60%) 30% 20%/40% 50% no-repeat,linear-gradient(7deg,transparent 0 30%,#fff 30% 60%,transparent 60%) 70% 20%/40% 50% no-repeat,#d6c2a0",
  art: (g, ctx) => {
    const f = g.front;
    const { uid } = ctx;
    const cw = Math.min(f.w * 0.46, f.h * 0.33);
    const cy = f.y + f.h * 0.36;
    const cx = f.x + f.w / 2;
    let out = bg(g, "#D6C2A0");
    // Сначала задние карточки (места 1 и 2), сверху — главная (место 0)
    out += polaroidCard(ctx, 1, cx - cw * 0.5, cy - cw * 0.06, cw, -9, { scene: 1, uid: `${uid}b` }).svg;
    out += polaroidCard(ctx, 2, cx + cw * 0.5, cy - cw * 0.1, cw, 8, { scene: 3, uid: `${uid}c` }).svg;
    const main = polaroidCard(ctx, 0, cx, cy + cw * 0.12, cw * 1.04, -1.5, { scene: 2, uid: `${uid}a` });
    out += main.svg;
    out += tape(cx + cw * 0.05, main.card.y + 0.4, cw * 0.36, cw * 0.1, 3, "#F1E6CF", 0.85);
    return out;
  },
  textArea: { x: 0.1, y: 0.64, w: 0.8, h: 0.31 },
  justify: "center",
  title: { font: "caveat", size: 0.1, color: "#3A2C20", weight: 500, lineHeight: 1.0 },
  subtitle: { font: "caveat", size: 0.056, color: "#5E4A38", weight: 500 },
  names: { font: "montserrat", size: 0.021, color: "#5E4A38", weight: 600, upper: true, tracking: 0.3 },
  ornament: { kind: "heart", color: "#B5473F" },
  spine: { color: "#3A2C20", font: "caveat" },
  back: { color: "#3A2C20", font: "caveat", area: BACK_AREA },
};

// ─── Сетка: шесть кадров в ровной сетке над названием ────────────────────────

const grid: CoverTemplate = {
  id: "grid",
  mood: "photo",
  requiresPhoto: true,
  photoSlots: 6,
  samples: ["dusk", "sakura", "meadow", "surf", "tenderness", "peaks"],
  swatch: "repeating-linear-gradient(90deg,#b7a8b0 0 31%,#fbf9f5 31% 34.5%) 50% 10%/86% 30% no-repeat,repeating-linear-gradient(90deg,#a9b9b2 0 31%,#fbf9f5 31% 34.5%) 50% 46%/86% 30% no-repeat,#fbf9f5",
  art: (g, ctx) => {
    const f = g.front;
    const m = f.w * 0.07;
    const gap = 2;
    const W = f.w - m * 2;
    const cols = 3;
    const cw = (W - gap * (cols - 1)) / cols;
    const ch = Math.min(cw * 1.5, (f.h * 0.6 - gap) / 2);
    const x0 = f.x + m;
    const y0 = f.y + m;
    let out = bg(g, "#FBF9F5");
    for (let i = 0; i < 6; i++) {
      const c = i % cols;
      const r = Math.floor(i / cols);
      out += photoSlot(ctx, i, { x: x0 + c * (cw + gap), y: y0 + r * (ch + gap), w: cw, h: ch }, { scene: i });
    }
    return out;
  },
  textArea: { x: 0.08, y: 0.67, w: 0.84, h: 0.29 },
  justify: "center",
  title: { font: "playfair", size: 0.074, color: "#26211E", weight: 400, lineHeight: 1.06 },
  subtitle: { font: "playfair", size: 0.036, color: "#6B6058", italic: true },
  names: { font: "montserrat", size: 0.021, color: "#857A71", weight: 500, upper: true, tracking: 0.32 },
  ornament: { kind: "dots", color: "#C3B2A3" },
  spine: { color: "#26211E", font: "playfair" },
  back: { color: "#26211E", font: "playfair", area: BACK_AREA },
};

export const clientPhotoTemplates: CoverTemplate[] = [
  arch,
  polaroid,
  medallion,
  passepartout,
  heart,
  magazine,
  duotone,
  indigo,
  collage,
  mosaic,
  film,
  mono,
  glowCover,
  split,
  fade,
  torn,
  gallery,
  stamp,
  vintage,
  circle,
  strips,
  minimal,
  diptych,
  stack,
  grid,
];

/** Порядок в выборе: чередуем окна, карточки, «во всю» и коллажи. */
export const clientPhotoOrder = [
  "fade", "arch", "polaroid", "gallery", "magazine", "heart", "stack", "mono", "medallion", "split", "stamp", "circle",
  "collage", "glow", "torn", "passepartout", "retro", "diptych", "strips", "duotone", "mosaic", "minimal", "film", "grid", "indigo",
];
