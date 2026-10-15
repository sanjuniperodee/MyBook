import type { CoverTemplate } from "../types";
import { bg, n, photoSlot } from "../svg-kit";

export const photo: CoverTemplate = {
  id: "photo",
  mood: "photo",
  swatch: "linear-gradient(180deg,#8a8a8a,#2b2b2b)",
  requiresPhoto: true,
  samples: ["couple"],
  art: (g, ctx) => {
    const f = g.front;
    // Фото занимает лицевую сторону вместе с загибами (до правого, верхнего и нижнего края холста).
    const r = { x: f.x, y: 0, w: g.width - f.x, h: g.height };
    const { uid } = ctx;
    return `<defs><linearGradient id="${uid}sh" x1="0" y1="0" x2="0" y2="1"><stop offset="0.45" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.62"/></linearGradient></defs>${bg(g, "#1E1E1E")}${photoSlot(ctx, 0, r)}<rect x="${n(r.x)}" y="0" width="${n(r.w)}" height="${n(g.height)}" fill="url(#${uid}sh)"/>`;
  },
  textArea: { x: 0.1, y: 0.6, w: 0.8, h: 0.32 },
  justify: "end",
  title: { font: "cormorant", size: 0.1, color: "#FFFFFF", weight: 600, lineHeight: 1.05 },
  subtitle: { font: "cormorant", size: 0.045, color: "#F2F2F2", italic: true },
  names: { font: "montserrat", size: 0.026, color: "#F2F2F2", weight: 500, upper: true, tracking: 0.25 },
  spine: { color: "#FFFFFF", font: "cormorant" },
  back: { color: "#E6E6E6", font: "cormorant", area: { x: 0.14, y: 0.3, w: 0.72, h: 0.4 } },
};
