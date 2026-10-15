import type { CoverTemplate } from "../types";
import { bg, n, photoSlot } from "../svg-kit";
import { BACK_AREA } from "./kit";

// ─── Коллаж: большой кадр и два поменьше, как в фотокниге ────────────────────

export const collage: CoverTemplate = {
  id: "collage",
  mood: "photo",
  requiresPhoto: true,
  photoSlots: 3,
  samples: ["weddingbeach", "bouquethands", "couple"],
  swatch: "linear-gradient(#9aa6a0,#9aa6a0) 50% 6%/84% 39% no-repeat,linear-gradient(#c9a58c,#c9a58c) 8% 66%/41% 21% no-repeat,linear-gradient(#b7a3bf,#b7a3bf) 92% 66%/41% 21% no-repeat,#f7f3ee",
  art: (g, ctx) => {
    const f = g.front;
    const m = f.w * 0.075;
    const gap = 2.6;
    const W = f.w - m * 2;
    const x = f.x + m;
    const y = f.y + m;
    const h1 = f.h * 0.4;
    const h2 = f.h * 0.215;
    const w2 = (W - gap) / 2;
    let out = bg(g, "#F7F3EE");
    out += photoSlot(ctx, 0, { x, y, w: W, h: h1 }, { scene: 1 });
    out += photoSlot(ctx, 1, { x, y: y + h1 + gap, w: w2, h: h2 }, { scene: 2 });
    out += photoSlot(ctx, 2, { x: x + w2 + gap, y: y + h1 + gap, w: w2, h: h2 }, { scene: 3 });
    const ly = y + h1 + gap + h2 + f.h * 0.035;
    out += `<line x1="${n(f.x + f.w / 2 - 6)}" y1="${n(ly)}" x2="${n(f.x + f.w / 2 + 6)}" y2="${n(ly)}" stroke="#C2A88F" stroke-width="0.3"/>`;
    return out;
  },
  textArea: { x: 0.08, y: 0.725, w: 0.84, h: 0.23 },
  justify: "center",
  title: { font: "playfair", size: 0.07, color: "#2A2421", weight: 400, lineHeight: 1.08 },
  subtitle: { font: "playfair", size: 0.035, color: "#6E625A", italic: true },
  names: { font: "montserrat", size: 0.021, color: "#8A7C72", weight: 500, upper: true, tracking: 0.3 },
  ornament: { kind: "line", color: "#C2A88F" },
  spine: { color: "#2A2421", font: "playfair" },
  back: { color: "#2A2421", font: "playfair", area: BACK_AREA },
};
