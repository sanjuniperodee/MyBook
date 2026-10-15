import type { CoverTemplate } from "../types";
import { bg, n, photoSlot, toneFilter } from "../svg-kit";
import { BACK_AREA } from "./kit";

// ─── Дымка: снимок растворяется в тёплой бумаге, название — на бумаге ─────────

export const fade: CoverTemplate = {
  id: "fade",
  mood: "photo",
  requiresPhoto: true,
  samples: ["weddingbeach"],
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
