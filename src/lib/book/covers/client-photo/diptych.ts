import type { CoverTemplate } from "../types";
import { bg, n, photoSlot } from "../svg-kit";
import { BACK_AREA } from "./kit";

// ─── Диптих: два высоких кадра рядом в общей тонкой рамке ────────────────────

export const diptych: CoverTemplate = {
  id: "diptych",
  mood: "photo",
  requiresPhoto: true,
  photoSlots: 2,
  samples: ["mamahug", "daddy"],
  texture: { kind: "grain", opacity: 0.08 },
  swatch: "linear-gradient(90deg,#b9a3a6 0 49%,transparent 49% 51%,#c9b08f 51%) 50% 14%/76% 50% no-repeat,#efeae2",
  art: (g, ctx) => {
    const f = g.front;
    const W = Math.min(f.w * 0.76, f.h * 0.6);
    const H = Math.min(f.h * 0.52, W * 1.0);
    const x = f.x + (f.w - W) / 2;
    const y = f.y + f.h * 0.1;
    const gap = 3;
    const w = (W - gap) / 2;
    let out = bg(g, "#EFEAE2");
    out += photoSlot(ctx, 0, { x, y, w, h: H }, { scene: 0 });
    out += photoSlot(ctx, 1, { x: x + w + gap, y, w, h: H }, { scene: 2 });
    out += `<rect x="${n(x - 3.2)}" y="${n(y - 3.2)}" width="${n(W + 6.4)}" height="${n(H + 6.4)}" fill="none" stroke="#9C8B78" stroke-width="0.25"/>`;
    return out;
  },
  textArea: { x: 0.1, y: 0.66, w: 0.8, h: 0.29 },
  justify: "center",
  title: { font: "cormorant", size: 0.088, color: "#352B24", weight: 500, italic: true, lineHeight: 1.04 },
  subtitle: { font: "cormorant", size: 0.042, color: "#6A5B4F", italic: true },
  names: { font: "montserrat", size: 0.021, color: "#857464", weight: 500, upper: true, tracking: 0.32 },
  ornament: { kind: "line", color: "#9C8B78" },
  spine: { color: "#352B24", font: "cormorant" },
  back: { color: "#352B24", font: "cormorant", area: BACK_AREA },
};
