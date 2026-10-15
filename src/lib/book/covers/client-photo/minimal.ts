import type { CoverTemplate } from "../types";
import { bg, liftShadow, photoSlot } from "../svg-kit";
import { BACK_AREA } from "./kit";

// ─── Минимализм: небольшой снимок на льне и тихая типографика ────────────────

export const minimal: CoverTemplate = {
  id: "minimal",
  mood: "photo",
  requiresPhoto: true,
  samples: ["bouquethands"],
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
