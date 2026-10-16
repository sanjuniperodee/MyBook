import type { CoverTemplate } from "../types";
import { bg, photoSlot, toneFilter } from "../svg-kit";
import { BACK_AREA, bleedRect, rectFrame, shade } from "./kit";

// ─── Монохром: чёрно-белый снимок во всю обложку в тонкой белой рамке ────────

export const mono: CoverTemplate = {
  id: "mono",
  mood: "photo",
  requiresPhoto: true,
  samples: ["weddingbw"],
  texture: { kind: "grain", opacity: 0.18 },
  swatch: "linear-gradient(180deg,#9a9a9a,#3a3a3a 70%,#111)",
  art: (g, ctx) => {
    const { uid } = ctx;
    const f = g.front;
    let out = `<defs>${toneFilter(`${uid}bw`, "mono")}</defs>${bg(g, "#121212")}`;
    out += photoSlot(ctx, 0, bleedRect(g), { scene: 1, filter: `${uid}bw` });
    out += shade(g, `${uid}sh`, [
      [0.45, "#000", 0],
      [1, "#000", 0.72],
    ]);
    out += rectFrame(f, 7, "#FFFFFF", 0.3, 0.85);
    return out;
  },
  textArea: { x: 0.12, y: 0.63, w: 0.76, h: 0.29 },
  justify: "end",
  title: { font: "playfair", size: 0.098, color: "#FFFFFF", weight: 400, lineHeight: 1.04 },
  subtitle: { font: "playfair", size: 0.04, color: "#E2E2E2", italic: true },
  names: { font: "montserrat", size: 0.022, color: "#E2E2E2", weight: 500, upper: true, tracking: 0.36 },
  ornament: { kind: "line", color: "#FFFFFF" },
  spine: { color: "#FFFFFF", font: "playfair" },
  back: { color: "#E2E2E2", font: "playfair", area: BACK_AREA },
};
