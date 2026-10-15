import type { CoverTemplate } from "../types";
import { bg, photoSlot } from "../svg-kit";
import { BACK_AREA } from "./kit";

// ─── Сетка: шесть кадров в ровной сетке над названием ────────────────────────

export const grid: CoverTemplate = {
  id: "grid",
  mood: "photo",
  requiresPhoto: true,
  photoSlots: 6,
  samples: ["couple", "family", "laughter", "daddy", "mamahug", "weddingbeach"],
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
