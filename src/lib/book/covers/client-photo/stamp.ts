import type { CoverTemplate } from "../types";
import { bg, liftShadow, n, photoSlot, postmark } from "../svg-kit";
import { BACK_AREA, rectPath } from "./kit";
import { HEART } from "../../motifs";

// ─── Марка: снимок на почтовой марке со штемпелем, кайма авиапочты ───────────

export const stamp: CoverTemplate = {
  id: "stamp",
  mood: "photo",
  requiresPhoto: true,
  samples: ["daddy"],
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
