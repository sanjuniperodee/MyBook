import type { CoverTemplate } from "../types";
import { bg, n, photoSlot } from "../svg-kit";
import { BACK_AREA, bleedRect, shade } from "./kit";

// ─── Глянец: фото во всю обложку, крупное название-«шапка» слева, как у журнала ─

export const magazine: CoverTemplate = {
  id: "magazine",
  mood: "photo",
  requiresPhoto: true,
  samples: ["autumnlove"],
  swatch: "linear-gradient(180deg,#2a2a2a,#7d7d7d 55%,#4a4a4a)",
  art: (g, ctx) => {
    const { uid } = ctx;
    let out = bg(g, "#1B1B1B") + photoSlot(ctx, 0, bleedRect(g), { scene: 1 });
    out += shade(g, `${uid}sh`, [
      [0, "#000", 0.6],
      [0.4, "#000", 0],
      [0.8, "#000", 0],
      [1, "#000", 0.32],
    ]);
    const f = g.front;
    out += `<line x1="${n(f.x + f.w * 0.08)}" y1="${n(f.y + f.h - 11)}" x2="${n(f.x + f.w * 0.92)}" y2="${n(f.y + f.h - 11)}" stroke="#FFFFFF" stroke-opacity="0.75" stroke-width="0.25"/>`;
    return out;
  },
  textArea: { x: 0.08, y: 0.06, w: 0.84, h: 0.34 },
  justify: "start",
  align: "left",
  namesFirst: true,
  title: { font: "playfair", size: 0.112, color: "#FFFFFF", weight: 400, lineHeight: 0.98 },
  subtitle: { font: "playfair", size: 0.042, color: "#F4F1EC", italic: true },
  names: { font: "montserrat", size: 0.022, color: "#F4F1EC", weight: 600, upper: true, tracking: 0.34 },
  ornament: { kind: "line", color: "#FFFFFF" },
  spine: { color: "#FFFFFF", font: "playfair" },
  back: { color: "#E9E9E9", font: "playfair", area: BACK_AREA },
};
