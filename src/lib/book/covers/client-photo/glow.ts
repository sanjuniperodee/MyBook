import type { CoverTemplate } from "../types";
import { bg, photoSlot, toneFilter } from "../svg-kit";
import { BACK_AREA, bleedRect, glow, shade } from "./kit";

// ─── Сияние: тёплый снимок во всю обложку с засветами, как на плёнке ──────────

export const glowCover: CoverTemplate = {
  id: "glow",
  mood: "photo",
  requiresPhoto: true,
  samples: ["couple"],
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
