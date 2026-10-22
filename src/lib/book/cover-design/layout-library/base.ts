/**
 * Двенадцать основных макетов — по одному на жанр. У каждого своя композиция: окно-арка, полароиды на столе, круг
 * в цветных пятнах, портрет над тёмной полосой, лента подарка, сетка фотоальбома, крупная типографика, рамка ар-деко,
 * швейцарский минимализм, снимок под обрез, мозаика и ботаническая арт-обложка.
 */
import type { CoverLayout } from "../layouts";
import type { CoverBackground, CoverDesign, CoverLayer } from "../types";
import { kit, type Kit } from "./kit";

/**
 * Слои макетов заходят за край крышки не дальше EDGE (доли): дальше начинается край листа развёртки, а узел за
 * краем листа react-pdf переносит на новую страницу.
 */
export const EDGE = 1.06;

export const design = (background: CoverBackground, layers: CoverLayer[]): CoverDesign => ({ v: 1, background, layers });

/** Затемнение к низу крышки от y: полупрозрачные полосы внахлёст — плавнее одной (градиента прозрачности в PDF нет). */
export function fade(K: Kit, y: number, color = "#120D0A", steps = 12, step = 0.018, opacity = 0.055): CoverLayer[] {
  return Array.from({ length: steps }, (_, i) => K.shape("rect", { x: -0.06, y: y + i * step, w: 1.12, h: EDGE - y - i * step }, { fill: color, opacity }));
}

/** Романтика: снимок в арочном окне с золотой обводкой, сердечки, курсивное название и имена от руки. */
const romanceArch: CoverLayout = {
  id: "romance-arch",
  genre: "romance",
  build(ctx) {
    const K = kit(ctx);
    const aw = K.sq ? 0.46 : 0.64;
    const ah = K.sq ? 0.46 : 0.47;
    const ax = (1 - aw) / 2;
    const ay = K.sq ? 0.07 : 0.075;
    const pad = 0.022;
    const titleY = ay + ah + (K.sq ? 0.07 : 0.075);
    const titleH = K.th(0.085, 2, 1.05);
    return design({ kind: "gradient", from: "#FBF2EF", to: "#F0D6D3", angle: 90 }, [
      K.shape("arch", { x: ax - pad, y: ay - K.v(pad), w: aw + pad * 2, h: ah + K.v(pad) + 0.012 }, { stroke: "#C49A6C", strokeWidth: 0.0025 }),
      K.image(0, "weddingbeach", { x: ax, y: ay, w: aw, h: ah }, { mask: "arch", border: { color: "#FFFFFF", width: 0.01 } }),
      K.decor("hearts", "#C9767F", { x: 0.44, y: ay + ah + 0.022, w: 0.12, h: K.v(0.05) }),
      K.text("title", { x: 0.1, y: titleY, w: 0.8, h: titleH }, { font: "cormorant", weight: 500, italic: true, size: 0.085, color: "#7A2E3A", lineHeight: 1.05, valign: "top" }),
      K.text("names", { x: 0.12, y: titleY + titleH + 0.012, w: 0.76, h: K.th(0.056) }, { font: "badscript", size: 0.056, color: "#B4606C", valign: "top" }),
      K.text("subtitle", { x: 0.12, y: 0.905, w: 0.76, h: K.th(0.026, 1, 1.2) }, { font: "cormorantsc", weight: 600, size: 0.026, upper: true, tracking: 0.22, color: "#9A7A76" }),
    ]);
  },
};

/** Семья: три снимка-полароида на тёплой бумаге (с тенью и скотчем), название влево и подпись от руки. */
const familyPolaroids: CoverLayout = {
  id: "family-polaroids",
  genre: "family",
  build(ctx) {
    const K = kit(ctx);
    const pw = K.sq ? 0.36 : 0.46;
    const ph = K.v(pw) * 1.08;
    const shots = [
      { i: 0, stock: "family", x: K.sq ? 0.08 : 0.06, y: 0.07, r: -7 },
      { i: 1, stock: "mamahug", x: K.sq ? 0.56 : 0.48, y: K.sq ? 0.09 : 0.12, r: 5 },
      { i: 2, stock: "daddy", x: K.sq ? 0.32 : 0.24, y: K.sq ? 0.3 : 0.36, r: -2 },
    ];
    const layers: CoverLayer[] = [];
    for (const s of shots) {
      const box = { x: s.x, y: s.y, w: pw, h: ph };
      layers.push(K.shape("rect", { ...box, x: box.x + 0.006, y: box.y + K.v(0.009) }, { fill: "#3A2A1C", rotate: s.r, opacity: 0.16 }));
      layers.push(K.image(s.i, s.stock, box, { border: { color: "#FFFFFF", width: 0.016 }, rotate: s.r }));
      layers.push(K.shape("rect", { x: s.x + pw / 2 - 0.06, y: s.y - K.v(0.012), w: 0.12, h: K.v(0.032) }, { fill: "#E9DCC4", rotate: s.r + 4, opacity: 0.85 }));
    }
    const ty = K.sq ? 0.7 : 0.735;
    return design({ kind: "color", color: "#F3ECE1" }, [
      ...layers,
      K.text("title", { x: 0.1, y: ty, w: 0.8, h: K.th(0.075, 2, 1.05) }, { font: "ebgaramond", weight: 500, size: 0.075, color: "#3B2A20", align: "left", valign: "bottom", lineHeight: 1.05 }),
      K.shape("line", { x: 0.1, y: ty + K.th(0.075, 2, 1.05) + 0.022, w: 0.16, h: 0.012 }, { stroke: "#9C6B45", strokeWidth: 0.003 }),
      K.text("names", { x: 0.1, y: ty + K.th(0.075, 2, 1.05) + 0.036, w: 0.8, h: K.th(0.055) }, { font: "caveat", weight: 500, size: 0.055, color: "#8A5A3B", align: "left", valign: "top" }),
    ]);
  },
};

/** Детская: круглый снимок с белой каймой и кольцом, яркие пятна по углам, звёзды и конфетти, округлый шрифт. */
const kidsBubbles: CoverLayout = {
  id: "kids-bubbles",
  genre: "kids",
  build(ctx) {
    const K = kit(ctx);
    const d = K.sq ? 0.46 : 0.62;
    const cx = (1 - d) / 2;
    const cy = K.sq ? 0.1 : 0.1;
    const ty = cy + K.v(d) + (K.sq ? 0.05 : 0.06);
    return design({ kind: "color", color: "#FFF3D6" }, [
      K.shape("ellipse", { x: -0.18, y: -K.v(0.14), w: 0.5, h: K.v(0.5) }, { fill: "#FFB4A2" }),
      K.shape("ellipse", { x: 0.74, y: K.sq ? 0.5 : 0.42, w: 0.42, h: K.v(0.42) }, { fill: "#9ED8D0" }),
      K.shape("ellipse", { x: 0.7, y: -K.v(0.08), w: 0.22, h: K.v(0.22) }, { fill: "#FFD166" }),
      K.shape("ellipse", { x: -0.08, y: K.sq ? 0.76 : 0.82, w: 0.3, h: K.v(0.3) }, { fill: "#A7C7F2" }),
      K.shape("ellipse", { x: cx - 0.025, y: cy - K.v(0.025), w: d + 0.05, h: K.v(d + 0.05) }, { stroke: "#FF7B54", strokeWidth: 0.012 }),
      K.image(0, "laughter", { x: cx, y: cy, w: d, h: K.v(d) }, { mask: "circle", border: { color: "#FFFFFF", width: 0.016 } }),
      K.decor("stars", "#FF7B54", { x: 0.06, y: cy + K.v(d) * 0.55, w: 0.18, h: K.v(0.11) }),
      K.decor("confetti", "#FF7B54", { x: 0.74, y: cy + 0.02, w: 0.18, h: K.v(0.08) }, { rotate: 12 }),
      K.text("title", { x: 0.1, y: ty, w: 0.8, h: K.th(0.082, 2, 1.1) }, { font: "comfortaa", weight: 700, size: 0.082, color: "#2B3A67", valign: "top", lineHeight: 1.1 }),
      K.text("names", { x: 0.12, y: ty + K.th(0.082, 2, 1.1) + 0.012, w: 0.76, h: K.th(0.05) }, { font: "pangolin", size: 0.05, color: "#E2603C", valign: "top" }),
    ]);
  },
};

/** Биография: чёрно-белый портрет под обрез на верхних двух третях, тёмная полоса с золотой линейкой и названием влево. */
const biographyPortrait: CoverLayout = {
  id: "biography-portrait",
  genre: "biography",
  build(ctx) {
    const K = kit(ctx);
    const split = K.sq ? 0.5 : 0.62;
    return design({ kind: "color", color: "#1C1A18" }, [
      K.image(0, "weddingbw", { x: -0.06, y: -0.05, w: 1.12, h: split + 0.05 }, { mono: true }),
      K.shape("line", { x: 0.1, y: split + 0.06, w: 0.12, h: 0.012 }, { stroke: "#C8A46A", strokeWidth: 0.004 }),
      K.text("names", { x: 0.1, y: split + 0.085, w: 0.8, h: K.th(0.03, 1, 1.2) }, { font: "intertight", weight: 600, size: 0.03, upper: true, tracking: 0.24, color: "#C8A46A", align: "left", valign: "top" }),
      K.text("title", { x: 0.1, y: split + 0.085 + K.th(0.03, 1, 1.2) + 0.015, w: 0.8, h: K.th(0.08, 2, 1.05) }, { font: "notodisplay", weight: 600, size: 0.08, color: "#F4EEE6", align: "left", valign: "top", lineHeight: 1.05 }),
      K.text("subtitle", { x: 0.1, y: 0.9, w: 0.8, h: K.th(0.034) }, { font: "spectral", italic: true, size: 0.034, color: "#B9B1A6", align: "left", valign: "bottom" }),
    ]);
  },
};

/** Подарок: обложка-коробка — золотая лента крест-накрест с розеткой, название и имена на винном фоне. */
const giftRibbon: CoverLayout = {
  id: "gift-ribbon",
  genre: "gift",
  build(ctx) {
    const K = kit(ctx);
    const rx = K.sq ? 0.72 : 0.7;
    const ry = K.sq ? 0.68 : 0.7;
    const band = 0.085;
    const gold = { fill: "#E3C27E", gradient: { to: "#B48A4A", angle: 0 } };
    const knot = 0.16;
    return design({ kind: "gradient", from: "#8E2433", to: "#5E1520", angle: 120 }, [
      K.shape("rect", { x: rx, y: -0.06, w: band, h: 1.12 }, gold),
      K.shape("rect", { x: -0.06, y: ry, w: 1.12, h: K.v(band) }, { ...gold, gradient: { to: "#B48A4A", angle: 90 } }),
      K.shape("ellipse", { x: rx + band / 2 - knot / 2, y: ry + K.v(band) / 2 - K.v(knot) / 2, w: knot, h: K.v(knot) }, { fill: "#C9A060", stroke: "#F1DCA7", strokeWidth: 0.004 }),
      K.decor("sparkle", "#FFF4D8", { x: rx + band / 2 - 0.035, y: ry + K.v(band) / 2 - K.v(0.035), w: 0.07, h: K.v(0.07) }),
      K.text("title", { x: 0.1, y: 0.13, w: rx - 0.16, h: K.th(0.085, 3, 1.05) }, { font: "prata", size: 0.085, color: "#FBF1E4", align: "left", valign: "top", lineHeight: 1.05 }),
      K.text("names", { x: 0.1, y: 0.13 + K.th(0.085, 3, 1.05) + 0.02, w: rx - 0.14, h: K.th(0.05, 2) }, { font: "badscript", size: 0.05, color: "#E3C27E", align: "left", valign: "top" }),
      K.text("subtitle", { x: 0.1, y: ry - 0.08, w: rx - 0.14, h: K.th(0.028, 2) }, { font: "cormorantsc", weight: 600, size: 0.028, upper: true, tracking: 0.2, color: "#E8C9CC", align: "left", valign: "bottom" }),
    ]);
  },
};

/** Фотоальбом: сетка из четырёх снимков с тонкими промежутками на белом, под ней плотный заголовок и год справа. */
const photoGrid: CoverLayout = {
  id: "photo-grid",
  genre: "photo",
  build(ctx) {
    const K = kit(ctx);
    const m = 0.08;
    const gap = 0.018;
    const cw = (1 - m * 2 - gap) / 2;
    const ch = K.sq ? 0.3 : 0.31;
    const top = 0.07;
    const stock = ["couple", "family", "friends", "sunsetwalk"];
    const cells: CoverLayer[] = [0, 1, 2, 3].map((i) => K.image(i, stock[i], { x: m + (i % 2) * (cw + gap), y: top + Math.floor(i / 2) * (ch + K.v(gap)), w: cw, h: ch }));
    const ty = top + ch * 2 + K.v(gap) + (K.sq ? 0.055 : 0.06);
    return design({ kind: "color", color: "#FAF8F4" }, [
      ...cells,
      K.text("title", { x: m, y: ty, w: 0.84, h: K.th(0.06, 2, 1.05) }, { font: "geologica", weight: 800, size: 0.06, upper: true, tracking: 0.02, color: "#1E1E1E", align: "left", valign: "top", lineHeight: 1.05 }),
      K.text("names", { x: m, y: 0.9, w: 0.6, h: K.th(0.028, 1, 1.2) }, { font: "intertight", weight: 600, size: 0.028, upper: true, tracking: 0.18, color: "#6F6A64", align: "left", valign: "bottom" }),
      K.text({ own: String(K.year) }, { x: 0.62, y: 0.9, w: 0.3, h: K.th(0.028, 1, 1.2) }, { font: "intertight", weight: 600, size: 0.028, tracking: 0.18, color: "#6F6A64", align: "right", valign: "bottom" }),
    ]);
  },
};

/** Современная проза: крупная типографика прописными на глубоком фоне, коралловый круг уходит за край, тонкая линия. */
const fictionType: CoverLayout = {
  id: "fiction-type",
  genre: "fiction",
  build(ctx) {
    const K = kit(ctx);
    return design({ kind: "gradient", from: "#16323A", to: "#0E1F2B", angle: 100 }, [
      K.shape("ellipse", { x: K.sq ? 0.56 : 0.46, y: -K.v(K.sq ? 0.19 : 0.2), w: K.sq ? 0.62 : 0.78, h: K.v(K.sq ? 0.62 : 0.78) }, { fill: "#E07A5F" }),
      K.shape("ellipse", { x: K.sq ? 0.66 : 0.62, y: K.v(K.sq ? 0.24 : 0.36), w: 0.14, h: K.v(0.14) }, { fill: "#F2CC8F" }),
      K.text("names", { x: 0.1, y: 0.07, w: 0.5, h: K.th(0.028, 2, 1.25) }, { font: "intertight", weight: 600, size: 0.028, upper: true, tracking: 0.22, color: "#F2E9DC", align: "left", valign: "top", lineHeight: 1.25 }),
      K.text("title", { x: 0.1, y: K.sq ? 0.47 : 0.42, w: 0.82, h: K.th(0.115, 3, 0.98) }, { font: "geologica", weight: 800, size: 0.115, upper: true, color: "#F2E9DC", align: "left", valign: "top", lineHeight: 0.98 }),
      K.shape("line", { x: 0.1, y: 0.86, w: 0.8, h: 0.012 }, { stroke: "#F2E9DC", strokeWidth: 0.002 }),
      K.text("subtitle", { x: 0.1, y: 0.875, w: 0.8, h: K.th(0.032, 1, 1.2) }, { font: "spectral", italic: true, size: 0.032, color: "#C9D3D3", align: "left", valign: "top" }),
    ]);
  },
};

/** Премиум: чёрный бархат, золотая двойная рамка с флеронами в углах, лавровый венок и прописные с разрядкой. */
const premiumDeco: CoverLayout = {
  id: "premium-deco",
  genre: "premium",
  build(ctx) {
    const K = kit(ctx);
    const gold = "#CDAE72";
    const f = 0.075;
    const fw = 0.11;
    const corner = (x: number, y: number, r: number) => K.decor("fleuron", gold, { x, y, w: fw, h: K.v(fw) }, { rotate: r });
    const iy = K.v(f);
    const mid = K.sq ? 0.36 : 0.38;
    return design({ kind: "gradient", from: "#1B1A1C", to: "#0C0B0D", angle: 90 }, [
      K.shape("double", { x: f, y: iy, w: 1 - f * 2, h: 1 - iy * 2 }, { stroke: gold, strokeWidth: 0.003 }),
      corner(f + 0.025, iy + K.v(0.025), 0),
      corner(1 - f - 0.025 - fw, iy + K.v(0.025), 90),
      corner(1 - f - 0.025 - fw, 1 - iy - K.v(0.025) - K.v(fw), 180),
      corner(f + 0.025, 1 - iy - K.v(0.025) - K.v(fw), -90),
      K.decor("laurel", gold, { x: 0.39, y: mid - K.v(0.2), w: 0.22, h: K.v(0.17) }),
      K.text("title", { x: 0.16, y: mid, w: 0.68, h: K.th(0.062, 3, 1.18) }, { font: "forum", size: 0.062, upper: true, tracking: 0.16, color: "#E9D3A2", valign: "top", lineHeight: 1.18 }),
      K.decor("vignette", gold, { x: 0.36, y: mid + K.th(0.062, 3, 1.18) + 0.02, w: 0.28, h: K.v(0.03) }),
      K.text("names", { x: 0.16, y: mid + K.th(0.062, 3, 1.18) + 0.065, w: 0.68, h: K.th(0.034) }, { font: "cormorantsc", weight: 600, size: 0.034, upper: true, tracking: 0.28, color: gold, valign: "top" }),
      K.text("subtitle", { x: 0.18, y: 0.8, w: 0.64, h: K.th(0.032, 2) }, { font: "spectral", italic: true, size: 0.032, color: "#A99A80", valign: "top" }),
    ]);
  },
};

/** Минимализм: швейцарская сетка — огромное светлое название сверху влево, тонкая линия, красный квадрат и выходные строки внизу. */
const minimalSwiss: CoverLayout = {
  id: "minimal-swiss",
  genre: "minimal",
  build(ctx) {
    const K = kit(ctx);
    return design({ kind: "color", color: "#F1EFEA" }, [
      K.text("title", { x: 0.1, y: 0.09, w: 0.8, h: K.th(0.1, 4, 1.02) }, { font: "raleway", weight: 300, size: 0.1, upper: true, tracking: 0.02, color: "#151515", align: "left", valign: "top", lineHeight: 1.02 }),
      K.shape("rect", { x: 0.1, y: 0.66, w: 0.07, h: K.v(0.07) }, { fill: "#D9472B" }),
      K.shape("line", { x: 0.1, y: 0.78, w: 0.8, h: 0.012 }, { stroke: "#151515", strokeWidth: 0.0018 }),
      K.text("subtitle", { x: 0.1, y: 0.8, w: 0.55, h: K.th(0.03, 2, 1.25) }, { font: "intertight", size: 0.03, color: "#4A4A4A", align: "left", valign: "top", lineHeight: 1.25 }),
      K.text("names", { x: 0.1, y: 0.9, w: 0.8, h: K.th(0.028, 1, 1.2) }, { font: "intertight", weight: 600, size: 0.028, upper: true, tracking: 0.2, color: "#151515", align: "left", valign: "bottom" }),
    ]);
  },
};

/** Крупное фото: снимок под обрез на всю крышку, затемнённая полоса внизу, название крупно и имена прописными. */
const bigphotoFull: CoverLayout = {
  id: "bigphoto-full",
  genre: "bigphoto",
  build(ctx) {
    const K = kit(ctx);
    const band = K.sq ? 0.66 : 0.68;
    return design({ kind: "color", color: "#1F1A17" }, [
      K.image(0, "sunsetwalk", { x: -0.06, y: -0.06, w: 1.12, h: 1.12 }),
      ...fade(K, band - 0.14),
      K.text("title", { x: 0.1, y: band + 0.035, w: 0.8, h: K.th(0.09, 2, 1.05) }, { font: "prata", size: 0.09, color: "#FFFFFF", valign: "top", lineHeight: 1.05, shadow: { color: "#000000", x: 0.02, y: 0.03, opacity: 0.35 } }),
      K.text("names", { x: 0.1, y: 0.9, w: 0.8, h: K.th(0.03, 1, 1.2) }, { font: "intertight", weight: 600, size: 0.03, upper: true, tracking: 0.26, color: "#F3E6D2", valign: "bottom" }),
    ]);
  },
};

/** Коллаж: мозаика из пяти снимков с белыми швами и белая плашка с названием поверх стыка. */
const collageMosaic: CoverLayout = {
  id: "collage-mosaic",
  genre: "collage",
  build(ctx) {
    const K = kit(ctx);
    const g = 0.014;
    const gv = K.v(g);
    const stock = ["couple", "bouquethands", "weddingstairs", "autumnlove", "tenderness"];
    const top = 0;
    const big = { x: 0, y: top, w: 0.6 - g / 2, h: 0.58 };
    const r1 = { x: 0.6 + g / 2, y: top, w: 0.4 - g / 2, h: 0.29 - gv / 2 };
    const r2 = { x: 0.6 + g / 2, y: 0.29 + gv / 2, w: 0.4 - g / 2, h: 0.29 - gv / 2 };
    const b1 = { x: 0, y: 0.58 + gv, w: 0.42 - g / 2, h: 0.42 - gv };
    const b2 = { x: 0.42 + g / 2, y: 0.58 + gv, w: 0.58 - g / 2, h: 0.42 - gv };
    // Ячейки у края — за обрез, чтобы под кантом не осталось белой полоски.
    const bleed = (b: { x: number; y: number; w: number; h: number }) => {
      const o = { ...b };
      if (o.x <= 0) {
        o.w += 0.06;
        o.x -= 0.06;
      }
      if (o.y <= 0) {
        o.h += 0.05;
        o.y -= 0.05;
      }
      if (o.x + o.w >= 0.999) o.w += 0.05;
      if (o.y + o.h >= 0.999) o.h += 0.05;
      return o;
    };
    const cells = [big, r1, r2, b1, b2].map((b, i) => K.image(i, stock[i], bleed(b)));
    const pw = 0.66;
    const ph = K.th(0.07, 2, 1.05) + K.th(0.04) + 0.06;
    const py = K.sq ? 0.4 : 0.42;
    return design({ kind: "color", color: "#FFFFFF" }, [
      ...cells,
      K.shape("rect", { x: (1 - pw) / 2, y: py, w: pw, h: ph }, { fill: "#FFFFFF", radius: 0.02 }),
      K.text("title", { x: (1 - pw) / 2 + 0.04, y: py + 0.02, w: pw - 0.08, h: K.th(0.07, 2, 1.05) }, { font: "yeseva", size: 0.07, color: "#2B2B2B", valign: "middle", lineHeight: 1.05 }),
      K.text("names", { x: (1 - pw) / 2 + 0.04, y: py + 0.03 + K.th(0.07, 2, 1.05), w: pw - 0.08, h: K.th(0.045) }, { font: "caveat", weight: 500, size: 0.045, color: "#B0485A", valign: "top" }),
    ]);
  },
};

/** Арт: тёмно-зелёный фон, золотая ботаническая ветвь и солнце-веер, крупный «&» за именами, название Yeseva. */
const artBotanical: CoverLayout = {
  id: "art-botanical",
  genre: "art",
  build(ctx) {
    const K = kit(ctx);
    const gold = "#D7B26E";
    return design({ kind: "gradient", from: "#22402F", to: "#142519", angle: 70 }, [
      K.decor("sunburst", "#2F5641", { x: 0.18, y: K.sq ? 0.02 : 0.05, w: 0.64, h: K.v(0.32) }),
      K.decor("botanical", gold, { x: K.sq ? 0.02 : -0.02, y: K.sq ? 0.42 : 0.44, w: 0.3, h: K.sq ? 0.58 : 0.6 }, { rotate: -8 }),
      K.decor("botanical", gold, { x: K.sq ? 0.76 : 0.76, y: K.sq ? 0.5 : 0.54, w: 0.24, h: K.sq ? 0.5 : 0.48 }, { rotate: 14, opacity: 0.7 }),
      K.text("title", { x: 0.12, y: K.sq ? 0.2 : 0.22, w: 0.76, h: K.th(0.088, 3, 1.05) }, { font: "yeseva", size: 0.088, color: "#F3E7CF", valign: "top", lineHeight: 1.05 }),
      K.text({ own: "&" }, { x: 0.3, y: K.sq ? 0.55 : 0.565, w: 0.4, h: K.th(0.3, 1, 1) }, { font: "lobster", size: 0.3, color: "#2F5641", lineHeight: 1 }, { opacity: 0.5 }),
      K.text("names", { x: 0.16, y: K.sq ? 0.63 : 0.64, w: 0.68, h: K.th(0.036, 2, 1.3) }, { font: "cormorantsc", weight: 600, size: 0.036, upper: true, tracking: 0.24, color: gold, lineHeight: 1.3 }),
      K.text("subtitle", { x: 0.2, y: 0.86, w: 0.6, h: K.th(0.032, 2) }, { font: "cormorant", italic: true, weight: 500, size: 0.034, color: "#CFC3A8", valign: "top" }),
    ]);
  },
};

export const baseLayouts: CoverLayout[] = [romanceArch, familyPolaroids, kidsBubbles, biographyPortrait, giftRibbon, photoGrid, fictionType, premiumDeco, minimalSwiss, bigphotoFull, collageMosaic, artBotanical];
