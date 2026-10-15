import type { CoverTemplate } from "../types";
import { bg, n, photoSlot } from "../svg-kit";
import { BACK_AREA } from "./kit";

// ─── Мозаика: четыре снимка и название на светлой полосе посередине ──────────

export const mosaic: CoverTemplate = {
  id: "mosaic",
  mood: "photo",
  requiresPhoto: true,
  photoSlots: 4,
  samples: ["couple", "family", "friends", "sunsetwalk"],
  swatch: "linear-gradient(90deg,#9aa6a0 0 49%,transparent 49% 51%,#c9a58c 51%) 0 0/100% 33% no-repeat,linear-gradient(90deg,#b7a3bf 0 49%,transparent 49% 51%,#d8b4a0 51%) 0 100%/100% 33% no-repeat,#f4eee5",
  art: (g, ctx) => {
    const f = g.front;
    const gap = 2.4;
    const bandTop = f.y + f.h * 0.335;
    const bandBottom = f.y + f.h * 0.665;
    const xm = f.x + f.w / 2;
    const left = { x: f.x, w: xm - gap / 2 - f.x };
    const right = { x: xm + gap / 2, w: g.width - xm - gap / 2 };
    let out = bg(g, "#F4EEE5");
    // Ряды уходят под загибы сверху, снизу и справа — край печати без белых полос
    out += photoSlot(ctx, 0, { x: left.x, y: 0, w: left.w, h: bandTop }, { scene: 0 });
    out += photoSlot(ctx, 1, { x: right.x, y: 0, w: right.w, h: bandTop }, { scene: 1 });
    out += photoSlot(ctx, 2, { x: left.x, y: bandBottom, w: left.w, h: g.height - bandBottom }, { scene: 2 });
    out += photoSlot(ctx, 3, { x: right.x, y: bandBottom, w: right.w, h: g.height - bandBottom }, { scene: 3 });
    for (const y of [bandTop + 5, bandBottom - 5])
      out += `<line x1="${n(f.x + f.w * 0.2)}" y1="${n(y)}" x2="${n(f.x + f.w * 0.8)}" y2="${n(y)}" stroke="#B9A48E" stroke-width="0.25"/>`;
    return out;
  },
  textArea: { x: 0.08, y: 0.37, w: 0.84, h: 0.26 },
  justify: "center",
  title: { font: "cormorant", size: 0.085, color: "#2E2622", weight: 500, lineHeight: 1.04 },
  subtitle: { font: "cormorant", size: 0.04, color: "#6E5E52", italic: true },
  names: { font: "montserrat", size: 0.022, color: "#8A7A6E", weight: 500, upper: true, tracking: 0.3 },
  ornament: { kind: "dots", color: "#B9A48E" },
  spine: { color: "#2E2622", font: "cormorant" },
  back: { color: "#2E2622", font: "cormorant", area: BACK_AREA },
};
