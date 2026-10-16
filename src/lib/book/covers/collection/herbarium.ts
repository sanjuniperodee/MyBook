import type { CoverTemplate } from "../types";
import { bg, n, rng } from "../svg-kit";
import { sprig, tape } from "./kit";

export const herbarium: CoverTemplate = {
  id: "herbarium",
  mood: "tender",
  texture: { kind: "linen", opacity: 0.22 },
  swatch: "linear-gradient(160deg,#f4efe4,#e9e1cf)",
  art: (g) => {
    const rand = rng(17);
    const f = g.front;
    let out = bg(g, "#F3EEE2");
    const baseX = f.x + f.w * 0.47;
    const baseY = f.y + f.h * 0.6;
    out += sprig(baseX, baseY, f.h * 0.44, rand, f.w * 0.06);
    out += sprig(baseX + f.w * 0.07, baseY + 2, f.h * 0.3, rand, f.w * 0.16);
    out += tape(baseX + 1.5, baseY - 2, f.w * 0.16, 5.5, -8);
    out += tape(baseX + f.w * 0.08, f.y + f.h * 0.2, f.w * 0.12, 5, 12);
    // Карандашная подпись-этикетка
    out += `<line x1="${n(f.x + f.w * 0.3)}" y1="${n(f.y + f.h * 0.9)}" x2="${n(f.x + f.w * 0.7)}" y2="${n(f.y + f.h * 0.9)}" stroke="#A89C84" stroke-width="0.2"/>`;
    if (g.back) out += sprig(g.back.x + g.back.w * 0.5, g.back.y + g.back.h * 0.55, g.back.h * 0.3, rand, -g.back.w * 0.05) + tape(g.back.x + g.back.w * 0.5, g.back.y + g.back.h * 0.53, g.back.w * 0.14, 5, 6);
    return out;
  },
  textArea: { x: 0.12, y: 0.64, w: 0.76, h: 0.25 },
  justify: "center",
  title: { font: "lora", size: 0.068, color: "#3E4431", weight: 400, italic: true, lineHeight: 1.12 },
  subtitle: { font: "lora", size: 0.036, color: "#6B6A55", italic: true },
  names: { font: "caveat", size: 0.058, color: "#6D5B3F", weight: 500 },
  spine: { color: "#3E4431", font: "lora" },
  back: { color: "#3E4431", font: "lora", area: { x: 0.14, y: 0.62, w: 0.72, h: 0.26 } },
};
