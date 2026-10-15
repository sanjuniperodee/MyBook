import type { CoverTemplate } from "../types";
import { liftShadow, n, photoSlot, scallopPath, toneFilter } from "../svg-kit";
import { BACK_AREA, rectFrame } from "./kit";

// ─── Ретро: снимок в сепии с фигурным краем на старой бумаге ──────────────────

export const vintage: CoverTemplate = {
  id: "retro",
  mood: "photo",
  requiresPhoto: true,
  samples: ["weddingstairs"],
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
