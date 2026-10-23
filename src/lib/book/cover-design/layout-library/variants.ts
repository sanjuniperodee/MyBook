/**
 * Вторые макеты жанров — другие композиции, а не другие цвета: снимок в рамке с именами от руки поверх, камея в
 * рамке с флеронами, небо с облаками и холмом, книжная полоса с вертикальной строкой, бирка на шнурке, киноплёнка,
 * дуотон с узким прописным набором, ою на изумруде, линия-круг в пустоте, отпечаток с подписью, рассыпанные снимки
 * и баухаус из геометрии.
 */
import type { CoverLayout } from "../layouts";
import type { CoverLayer } from "../types";
import { design, EDGE, fade } from "./base";
import { kit } from "./kit";

/** Романтика: снимок под обрез, тонкая белая рамка, крупные имена от руки поверх и название прописными. */
const romanceScript: CoverLayout = {
  id: "romance-script",
  genre: "romance",
  build(ctx) {
    const K = kit(ctx);
    const inset = 0.06;
    return design({ kind: "color", color: "#3A2A2C" }, [
      K.image(0, "couple", { x: -0.06, y: -0.06, w: 1.12, h: 1.12 }, { overlay: { color: "#3A1F26", opacity: 0.22 } }),
      ...fade(K, 0.46, "#2A1418", 12, 0.02, 0.06),
      K.shape("frame", { x: inset, y: K.v(inset), w: 1 - inset * 2, h: 1 - K.v(inset) * 2 }, { stroke: "#FFFFFF", strokeWidth: 0.0025, opacity: 0.85 }),
      K.text("names", { x: 0.1, y: K.sq ? 0.5 : 0.6, w: 0.8, h: K.th(0.1, 2, 1.0) }, { font: "badscript", size: 0.1, color: "#FFFFFF", valign: "bottom", lineHeight: 1.0, shadow: { color: "#000000", x: 0.02, y: 0.03, opacity: 0.35 } }),
      K.text("title", { x: 0.14, y: K.sq ? 0.75 : 0.81, w: 0.72, h: K.th(0.034, 3, 1.3) }, { font: "cormorantsc", weight: 600, size: 0.034, upper: true, tracking: 0.24, color: "#FBEFEA", valign: "top", lineHeight: 1.3 }),
    ]);
  },
};

/** Семья: камея-медальон с сепией в двойной рамке, флероны по углам, название старинным шрифтом. */
const familyHeritage: CoverLayout = {
  id: "family-heritage",
  genre: "family",
  build(ctx) {
    const K = kit(ctx);
    const ink = "#5A3E2B";
    const f = 0.06;
    const fw = 0.1;
    const cw = K.sq ? 0.3 : 0.46;
    const ch = K.sq ? 0.32 : 0.4;
    const cy = 0.12;
    const corner = (x: number, y: number, r: number) => K.decor("fleuron", ink, { x, y, w: fw, h: K.v(fw) }, { rotate: r, opacity: 0.8 });
    const iy = K.v(f);
    const ty = cy + ch + (K.sq ? 0.05 : 0.065);
    const ts = K.sq ? 0.048 : 0.056;
    return design({ kind: "color", color: "#EFE6D4" }, [
      K.shape("double", { x: f, y: iy, w: 1 - f * 2, h: 1 - iy * 2 }, { stroke: ink, strokeWidth: 0.0025 }),
      corner(f + 0.02, iy + K.v(0.02), 0),
      corner(1 - f - 0.02 - fw, iy + K.v(0.02), 90),
      corner(1 - f - 0.02 - fw, 1 - iy - K.v(0.02) - K.v(fw), 180),
      corner(f + 0.02, 1 - iy - K.v(0.02) - K.v(fw), -90),
      K.shape("ellipse", { x: (1 - cw) / 2 - 0.015, y: cy - K.v(0.015), w: cw + 0.03, h: ch + K.v(0.03) }, { stroke: ink, strokeWidth: 0.002 }),
      K.image(0, "familydusk", { x: (1 - cw) / 2, y: cy, w: cw, h: ch }, { mask: "circle", mono: true, overlay: { color: "#7A4B26", opacity: 0.28 } }),
      K.text("title", { x: 0.15, y: ty, w: 0.7, h: K.th(ts, K.sq ? 2 : 3, 1.12) }, { font: "oldstandard", weight: 700, size: ts, upper: true, tracking: 0.08, color: "#3D2A1C", valign: "top", lineHeight: 1.12 }),
      K.decor("hedera", ink, { x: 0.46, y: ty + K.th(ts, K.sq ? 2 : 3, 1.12) + 0.012, w: 0.08, h: K.v(0.05) }),
      K.text("subtitle", { x: 0.15, y: ty + K.th(ts, K.sq ? 2 : 3, 1.12) + 0.012 + K.v(0.05) + 0.012, w: 0.7, h: K.th(0.036, 2) }, { font: "kurale", size: 0.036, color: ink, valign: "top" }),
      K.text("names", { x: 0.15, y: K.sq ? 0.86 : 0.875, w: 0.7, h: K.th(0.028, 1, 1.2) }, { font: "cormorantsc", weight: 600, size: 0.028, upper: true, tracking: 0.24, color: ink }),
    ]);
  },
};

/** Детская: небо с облаками и солнцем, снимок-открытка с наклоном, зелёный холм и название белым с тёмным контуром. */
const kidsSky: CoverLayout = {
  id: "kids-sky",
  genre: "kids",
  build(ctx) {
    const K = kit(ctx);
    const cloud = (x: number, y: number, s: number): CoverLayer[] => [
      K.shape("ellipse", { x, y: y + K.v(s * 0.18), w: s, h: K.v(s * 0.42) }, { fill: "#FFFFFF" }),
      K.shape("ellipse", { x: x + s * 0.2, y, w: s * 0.42, h: K.v(s * 0.42) }, { fill: "#FFFFFF" }),
      K.shape("ellipse", { x: x + s * 0.46, y: y + K.v(s * 0.06), w: s * 0.36, h: K.v(s * 0.36) }, { fill: "#FFFFFF" }),
    ];
    const pw = K.sq ? 0.42 : 0.56;
    const ph = K.v(pw) * 0.82;
    const hill = K.sq ? 0.66 : 0.68;
    return design({ kind: "gradient", from: "#7CC6F2", to: "#BFE6FA", angle: 90 }, [
      K.decor("sunburst", "#FFD45C", { x: 0.66, y: -K.v(0.02), w: 0.36, h: K.v(0.18) }, { rotate: 180, opacity: 0.9 }),
      K.shape("ellipse", { x: 0.74, y: -K.v(0.08), w: 0.2, h: K.v(0.2) }, { fill: "#FFD45C" }),
      ...cloud(0.06, 0.06, 0.28),
      ...cloud(0.62, K.sq ? 0.24 : 0.2, 0.22),
      K.shape("rect", { x: 0.5 - pw / 2 + 0.008, y: 0.15 + K.v(0.012), w: pw, h: ph }, { fill: "#1D4E7A", opacity: 0.18, rotate: -4 }),
      K.image(0, "newborn", { x: 0.5 - pw / 2, y: 0.15, w: pw, h: ph }, { mask: "rounded", radius: 0.06, border: { color: "#FFFFFF", width: 0.018 }, rotate: -4 }),
      K.shape("rect", { x: -0.06, y: hill + 0.1, w: 1.12, h: EDGE - hill - 0.1 }, { fill: "#5DAA52" }),
      K.shape("ellipse", { x: -0.2, y: hill, w: 1.26, h: 0.28 }, { fill: "#7DC46B", gradient: { to: "#5DAA52", angle: 90 } }),
      K.decor("confetti", "#FF8A5B", { x: 0.08, y: hill - K.v(0.08), w: 0.16, h: K.v(0.07) }),
      K.text("title", { x: 0.08, y: hill + 0.035, w: 0.84, h: K.th(0.08, 2, 1.08) }, { font: "comfortaa", weight: 700, size: 0.08, color: "#FFFFFF", valign: "top", lineHeight: 1.08, outline: { color: "#2E6B33", width: 0.06 } }),
      K.text("names", { x: 0.12, y: 0.9, w: 0.76, h: K.th(0.045) }, { font: "pangolin", size: 0.045, color: "#FFFFFF", valign: "bottom", outline: { color: "#2E6B33", width: 0.05 } }),
    ]);
  },
};

/** Биография: книжная полоса — тёмный корешок слева с вертикальной строкой имени, портрет и название справа. */
const biographyBand: CoverLayout = {
  id: "biography-band",
  genre: "biography",
  build(ctx) {
    const K = kit(ctx);
    const band = K.sq ? 0.22 : 0.26;
    const span = 0.4;
    const w = Math.min(1.3, span / K.k);
    const cx = band / 2 + 0.005;
    const cy = K.sq ? 0.68 : 0.7;
    const lx = band + 0.07;
    const pw = 1 - lx - 0.07;
    const ph = K.sq ? 0.42 : 0.44;
    return design({ kind: "color", color: "#F2EDE4" }, [
      K.shape("rect", { x: -0.06, y: -0.06, w: band + 0.06, h: 1.12 }, { fill: "#24372E" }),
      K.shape("rect", { x: band - 0.035, y: 0.08, w: 0.01, h: 0.84 }, { fill: "#C9A96E" }),
      K.text("names", { x: cx - w / 2, y: cy - K.th(0.032, 1, 1.2) / 2, w, h: K.th(0.032, 1, 1.2) }, { font: "intertight", weight: 600, size: 0.032, upper: true, tracking: 0.3, color: "#E9DDC4" }, { rotate: -90 }),
      K.text({ own: String(K.year) }, { x: 0.02, y: 0.075, w: band - 0.04, h: K.th(0.026, 1, 1.2) }, { font: "intertight", weight: 600, size: 0.026, tracking: 0.2, color: "#C9A96E" }),
      K.image(0, "daddy", { x: lx, y: 0.08, w: pw, h: ph }, { mono: true }),
      K.text("title", { x: lx, y: 0.08 + ph + 0.05, w: pw, h: K.th(0.074, 3, 1.05) }, { font: "literata", weight: 600, size: 0.074, color: "#1E2A24", align: "left", valign: "top", lineHeight: 1.05 }),
      K.text("subtitle", { x: lx, y: 0.88, w: pw, h: K.th(0.032, 2) }, { font: "literata", italic: true, size: 0.032, color: "#5B6B62", align: "left", valign: "bottom" }),
    ]);
  },
};

/** Подарок: бирка на шнурке с наклоном — название и имена на ней, веточка, крафтовый фон в горошек. */
const giftTag: CoverLayout = {
  id: "gift-tag",
  genre: "gift",
  build(ctx) {
    const K = kit(ctx);
    const tw = K.sq ? 0.6 : 0.68;
    const th = K.sq ? 0.5 : 0.48;
    const tx = (1 - tw) / 2;
    const ty = K.sq ? 0.27 : 0.28;
    const dots: CoverLayer[] = [];
    // Горошек редкий: слоёв у обложки не больше COVER_LIMITS.layers.
    for (let r = 0; r < 7; r++)
      for (let c = 0; c < 4; c++) {
        const x = 0.07 + c * 0.24 + (r % 2 ? 0.12 : 0);
        const y = 0.04 + r * K.v(0.17);
        if (y < EDGE - 0.02) dots.push(K.shape("ellipse", { x, y, w: 0.018, h: K.v(0.018) }, { fill: "#B88C5E", opacity: 0.45 }));
      }
    const holeY = ty + K.v(0.06);
    const tag: CoverLayer[] = [
      K.shape("rect", { x: tx + 0.01, y: ty + K.v(0.014), w: tw, h: th }, { fill: "#5B3A1E", radius: 0.05, opacity: 0.2 }),
      K.shape("rect", { x: tx, y: ty, w: tw, h: th }, { fill: "#FBF6EC", radius: 0.05, stroke: "#C6A57C", strokeWidth: 0.002 }),
      K.shape("ellipse", { x: 0.5 - 0.025, y: holeY - K.v(0.025), w: 0.05, h: K.v(0.05) }, { fill: "#D8BC93", stroke: "#B88C5E", strokeWidth: 0.003 }),
      K.decor("sprig", "#7C9A6B", { x: 0.5 - 0.14, y: ty + K.v(0.11), w: 0.28, h: K.v(0.09) }),
      K.text("title", { x: tx + 0.06, y: ty + K.v(0.11) + K.v(0.1), w: tw - 0.12, h: K.th(0.068, 3, 1.05) }, { font: "alice", size: K.sq ? 0.058 : 0.068, color: "#4A2E1A", valign: "top", lineHeight: 1.05 }),
      K.text("names", { x: tx + 0.06, y: ty + th - K.th(0.05) - 0.035, w: tw - 0.12, h: K.th(0.05) }, { font: "caveat", weight: 500, size: 0.05, color: "#A0522D", valign: "bottom" }),
    ];
    return design({ kind: "color", color: "#D9BE96" }, [
      ...dots,
      K.shape("rect", { x: 0.5 - 0.005, y: -0.06, w: 0.01, h: holeY + 0.06 }, { fill: "#8A2E2E" }),
      ...K.group(tag, 0.5, holeY, -5),
      K.text("subtitle", { x: 0.12, y: 0.9, w: 0.76, h: K.th(0.03, 1, 1.2) }, { font: "cormorantsc", weight: 600, size: 0.03, upper: true, tracking: 0.2, color: "#5B3A1E", valign: "bottom" }),
    ]);
  },
};

/** Фотоальбом: киноплёнка — три кадра на чёрной ленте с перфорацией поперёк крышки, название сверху, имена снизу. */
const photoFilm: CoverLayout = {
  id: "photo-film",
  genre: "photo",
  build(ctx) {
    const K = kit(ctx);
    const sh = K.sq ? 0.34 : 0.3;
    const sy = K.sq ? 0.36 : 0.37;
    const fw = 0.29;
    const gap = 0.03;
    const x0 = (1 - (fw * 3 + gap * 2)) / 2;
    const fh = sh - K.v(0.07) * 2;
    const holes: CoverLayer[] = [];
    for (let i = 0; i < 16; i++) {
      const x = -0.04 + i * 0.07;
      holes.push(K.shape("rect", { x, y: sy + K.v(0.018), w: 0.035, h: K.v(0.032) }, { fill: "#F5F1EA", radius: 0.2 }));
      holes.push(K.shape("rect", { x, y: sy + sh - K.v(0.018) - K.v(0.032), w: 0.035, h: K.v(0.032) }, { fill: "#F5F1EA", radius: 0.2 }));
    }
    const stock = ["autumnlove", "friends", "familydusk"];
    return design({ kind: "color", color: "#F5F1EA" }, [
      K.shape("rect", { x: -0.06, y: sy, w: 1.12, h: sh }, { fill: "#141414" }),
      ...holes,
      ...[0, 1, 2].map((i) => K.image(i, stock[i], { x: x0 + i * (fw + gap), y: sy + K.v(0.07), w: fw, h: fh })),
      K.text("title", { x: 0.1, y: 0.08, w: 0.8, h: K.th(0.072, 3, 1.05) }, { font: "intertight", weight: 800, size: 0.072, color: "#141414", align: "left", valign: "top", lineHeight: 1.05 }),
      K.text("subtitle", { x: 0.1, y: sy + sh + 0.045, w: 0.8, h: K.th(0.034, 2) }, { font: "intertight", size: 0.034, color: "#5A5752", align: "left", valign: "top" }),
      K.text("names", { x: 0.1, y: 0.9, w: 0.55, h: K.th(0.028, 1, 1.2) }, { font: "intertight", weight: 600, size: 0.028, upper: true, tracking: 0.2, color: "#141414", align: "left", valign: "bottom" }),
      K.text({ own: String(K.year) }, { x: 0.65, y: 0.9, w: 0.25, h: K.th(0.028, 1, 1.2) }, { font: "intertight", weight: 600, size: 0.028, tracking: 0.2, color: "#E0262F", align: "right", valign: "bottom" }),
    ]);
  },
};

/** Современная проза: дуотон — ч/б пейзаж под синим тоном, узкий прописной Oswald во всю ширину, красная черта. */
const fictionDuotone: CoverLayout = {
  id: "fiction-duotone",
  genre: "fiction",
  build(ctx) {
    const K = kit(ctx);
    return design({ kind: "color", color: "#1B2A44" }, [
      K.image(0, "mist", { x: -0.06, y: -0.06, w: 1.12, h: 1.12 }, { mono: true, overlay: { color: "#1C3D6E", opacity: 0.55 } }),
      ...fade(K, 0.42, "#0D1626", 12, 0.022, 0.07),
      K.text("names", { x: 0.1, y: 0.07, w: 0.8, h: K.th(0.03, 1, 1.2) }, { font: "oswald", weight: 400, size: 0.03, upper: true, tracking: 0.32, color: "#DDE6F2", align: "left", valign: "top" }),
      K.shape("rect", { x: 0.1, y: K.sq ? 0.56 : 0.58, w: 0.12, h: 0.012 }, { fill: "#E0262F" }),
      K.text("title", { x: 0.1, y: K.sq ? 0.6 : 0.62, w: 0.84, h: K.th(0.1, 3, 0.98) }, { font: "oswald", weight: 600, size: 0.1, upper: true, color: "#FFFFFF", align: "left", valign: "top", lineHeight: 0.98 }),
      K.text("subtitle", { x: 0.1, y: 0.9, w: 0.8, h: K.th(0.03, 1, 1.2) }, { font: "spectral", italic: true, size: 0.032, color: "#C5D1E2", align: "left", valign: "bottom" }),
    ]);
  },
};

/** Премиум: изумрудная обложка с золотым ою (рисунок шаблона), название и имена — в его области, рога-кошкар. */
const premiumOyu: CoverLayout = {
  id: "premium-oyu",
  genre: "premium",
  template: "oyu",
  build(ctx) {
    const K = kit(ctx);
    const gold = "#E9CF93";
    return design({ kind: "template" }, [
      K.text("title", { x: 0.14, y: 0.53, w: 0.72, h: K.th(0.085, 2, 1.05) }, { font: "cormorant", weight: 500, size: K.sq ? 0.07 : 0.085, color: gold, valign: "middle", lineHeight: 1.05 }),
      K.decor("ram", "#C9A45C", { x: 0.44, y: 0.53 + K.th(0.085, 2, 1.05) + 0.01, w: 0.12, h: K.v(0.07) }),
      K.text("names", { x: 0.14, y: 0.53 + K.th(0.085, 2, 1.05) + 0.01 + K.v(0.07) + 0.012, w: 0.72, h: K.th(0.026, 1, 1.2) }, { font: "cormorantsc", weight: 600, size: 0.03, upper: true, tracking: 0.3, color: "#C9A45C", valign: "top" }),
      K.text("subtitle", { x: 0.16, y: 0.53 + K.th(0.085, 2, 1.05) + 0.01 + K.v(0.07) + 0.012 + K.th(0.03, 1, 1.2) + 0.02, w: 0.68, h: K.th(0.038, 2) }, { font: "cormorant", italic: true, weight: 500, size: 0.038, color: "#D8BC80", valign: "top" }),
    ]);
  },
};

/** Минимализм: тёмное поле, одна тонкая окружность и маленькое название прописными в её центре. */
const minimalCircle: CoverLayout = {
  id: "minimal-circle",
  genre: "minimal",
  build(ctx) {
    const K = kit(ctx);
    const d = K.sq ? 0.56 : 0.66;
    const cy = K.sq ? 0.42 : 0.44;
    const top = cy - K.v(d) / 2;
    return design({ kind: "color", color: "#151515" }, [
      K.shape("ellipse", { x: (1 - d) / 2, y: top, w: d, h: K.v(d) }, { stroke: "#E8E2D6", strokeWidth: 0.0018 }),
      K.text("title", { x: 0.5 - d * 0.36, y: cy - K.th(0.04, 3, 1.35) / 2, w: d * 0.72, h: K.th(0.04, 3, 1.35) }, { font: "raleway", weight: 400, size: 0.04, upper: true, tracking: 0.26, color: "#F2EDE4", lineHeight: 1.35 }),
      K.text("names", { x: 0.1, y: 0.88, w: 0.8, h: K.th(0.026, 1, 1.2) }, { font: "raleway", weight: 600, size: 0.026, upper: true, tracking: 0.34, color: "#8E877C", valign: "bottom" }),
    ]);
  },
};

/** Крупное фото: отпечаток в белом паспарту — снимок почти во всю крышку, подпись-название курсивом на белом поле внизу. */
const bigphotoPrint: CoverLayout = {
  id: "bigphoto-print",
  genre: "bigphoto",
  build(ctx) {
    const K = kit(ctx);
    const m = 0.07;
    const ph = K.sq ? 0.7 : 0.74;
    return design({ kind: "color", color: "#FBFAF7" }, [
      K.image(0, "weddingstairs", { x: m, y: K.v(m), w: 1 - m * 2, h: ph }),
      K.text("title", { x: m, y: K.v(m) + ph + 0.025, w: 1 - m * 2, h: K.th(0.062, 2, 1.05) }, { font: "playfair", italic: true, size: 0.062, color: "#1F1D1B", align: "left", valign: "top", lineHeight: 1.05 }),
      K.text("names", { x: m, y: 0.915, w: 0.6, h: K.th(0.026, 1, 1.2) }, { font: "intertight", weight: 600, size: 0.026, upper: true, tracking: 0.2, color: "#7B756D", align: "left", valign: "bottom" }),
      K.text({ own: String(K.year) }, { x: 0.63, y: 0.915, w: 0.3, h: K.th(0.026, 1, 1.2) }, { font: "playfair", italic: true, size: 0.03, color: "#7B756D", align: "right", valign: "bottom" }),
    ]);
  },
};

/** Коллаж: снимки рассыпаны по шалфейному полю с наклонами и тенями, название — на кремовой плашке с наклоном. */
const collageScatter: CoverLayout = {
  id: "collage-scatter",
  genre: "collage",
  build(ctx) {
    const K = kit(ctx);
    const s = K.sq ? 0.34 : 0.42;
    const shots = K.sq
      ? [
          { x: 0.05, y: 0.05, r: -8, st: "sunsetwalk" },
          { x: 0.58, y: 0.06, r: 6, st: "laughter" },
          { x: 0.06, y: 0.58, r: 5, st: "bouquethands" },
          { x: 0.6, y: 0.56, r: -6, st: "autumnlove" },
        ]
      : [
          { x: 0.04, y: 0.05, r: -8, st: "sunsetwalk" },
          { x: 0.54, y: 0.04, r: 6, st: "laughter" },
          { x: 0.05, y: 0.64, r: 5, st: "bouquethands" },
          { x: 0.53, y: 0.66, r: -6, st: "autumnlove" },
        ];
    const layers: CoverLayer[] = [];
    shots.forEach((p, i) => {
      const box = { x: p.x, y: p.y, w: s, h: K.v(s) };
      layers.push(K.shape("rect", { ...box, x: box.x + 0.008, y: box.y + K.v(0.012) }, { fill: "#2E3B2C", opacity: 0.22, rotate: p.r }));
      layers.push(K.image(i, p.st, box, { border: { color: "#FFFFFF", width: 0.014 }, rotate: p.r }));
    });
    const pw = 0.74;
    const ph = K.th(0.075, 2, 1.05) + K.th(0.045) + 0.07;
    const py = 0.5 - ph / 2;
    const plate: CoverLayer[] = [
      K.shape("rect", { x: (1 - pw) / 2, y: py, w: pw, h: ph }, { fill: "#FBF5EA" }),
      K.text("title", { x: (1 - pw) / 2 + 0.04, y: py + 0.025, w: pw - 0.08, h: K.th(0.075, 2, 1.05) }, { font: "yeseva", size: 0.075, color: "#2F3E2C", lineHeight: 1.05 }),
      K.text("names", { x: (1 - pw) / 2 + 0.04, y: py + 0.035 + K.th(0.075, 2, 1.05), w: pw - 0.08, h: K.th(0.045) }, { font: "caveat", weight: 500, size: 0.048, color: "#8B5E3C", valign: "top" }),
    ];
    return design({ kind: "color", color: "#A9B79C" }, [...layers, ...K.group(plate, 0.5, 0.5, -3)]);
  },
};

/** Арт: баухаус — синий круг уходит за край, красный ромб, чёрные линии и крупный прописной набор на горчичном. */
const artBauhaus: CoverLayout = {
  id: "art-bauhaus",
  genre: "art",
  build(ctx) {
    const K = kit(ctx);
    return design({ kind: "color", color: "#E7B142" }, [
      K.shape("ellipse", { x: -0.2, y: EDGE - K.v(K.sq ? 0.5 : 0.8), w: K.sq ? 0.5 : 0.8, h: K.v(K.sq ? 0.5 : 0.8) }, { fill: "#1D3A6E" }),
      K.shape("rect", { x: 0.62, y: K.sq ? 0.44 : 0.46, w: 0.24, h: K.v(0.24) }, { fill: "#D93A2B", rotate: 45 }),
      K.shape("line", { x: 0.1, y: K.sq ? 0.38 : 0.4, w: 0.8, h: 0.012 }, { stroke: "#151515", strokeWidth: 0.004 }),
      K.shape("ellipse", { x: 0.74, y: K.sq ? 0.8 : 0.82, w: 0.12, h: K.v(0.12) }, { stroke: "#151515", strokeWidth: 0.004 }),
      K.text("title", { x: 0.1, y: 0.08, w: 0.82, h: K.th(0.088, 3, 1.0) }, { font: "montalt", weight: 600, size: 0.088, upper: true, color: "#151515", align: "left", valign: "bottom", lineHeight: 1.0 }),
      K.text("names", { x: 0.1, y: (K.sq ? 0.38 : 0.4) + 0.02, w: 0.6, h: K.th(0.03, 2, 1.25) }, { font: "montalt", weight: 600, size: 0.03, upper: true, tracking: 0.16, color: "#151515", align: "left", valign: "top", lineHeight: 1.25 }),
      K.text("subtitle", { x: 0.1, y: (K.sq ? 0.38 : 0.4) + 0.03 + K.th(0.03, 2, 1.25), w: 0.5, h: K.th(0.03, 2) }, { font: "intertight", size: 0.03, color: "#3B2E12", align: "left", valign: "top" }),
    ]);
  },
};

export const variantLayouts: CoverLayout[] = [romanceScript, familyHeritage, kidsSky, biographyBand, giftTag, photoFilm, fictionDuotone, premiumOyu, minimalCircle, bigphotoPrint, collageScatter, artBauhaus];
