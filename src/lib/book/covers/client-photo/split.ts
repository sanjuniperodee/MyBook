import type { CoverTemplate } from "../types";
import { bg, n, photoSlot } from "../svg-kit";
import { BACK_AREA } from "./kit";

// ─── Журнал: снимок на верхних двух третях, снизу цветная плашка с текстом слева ─

export const split: CoverTemplate = {
  id: "split",
  mood: "photo",
  requiresPhoto: true,
  samples: ["sunsetwalk"],
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
