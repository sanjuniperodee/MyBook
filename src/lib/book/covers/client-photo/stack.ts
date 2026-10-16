import type { CoverTemplate } from "../types";
import { bg, tape } from "../svg-kit";
import { BACK_AREA, polaroidCard } from "./kit";

// ─── Стопка: три полароида веером на крафтовой бумаге ────────────────────────

export const stack: CoverTemplate = {
  id: "stack",
  mood: "photo",
  requiresPhoto: true,
  photoSlots: 3,
  samples: ["laughter", "sunsetwalk", "daddy"],
  texture: { kind: "grain", opacity: 0.22 },
  swatch: "linear-gradient(-8deg,transparent 0 30%,#fff 30% 60%,transparent 60%) 30% 20%/40% 50% no-repeat,linear-gradient(7deg,transparent 0 30%,#fff 30% 60%,transparent 60%) 70% 20%/40% 50% no-repeat,#d6c2a0",
  art: (g, ctx) => {
    const f = g.front;
    const { uid } = ctx;
    const cw = Math.min(f.w * 0.46, f.h * 0.33);
    const cy = f.y + f.h * 0.36;
    const cx = f.x + f.w / 2;
    let out = bg(g, "#D6C2A0");
    // Сначала задние карточки (места 1 и 2), сверху — главная (место 0)
    out += polaroidCard(ctx, 1, cx - cw * 0.5, cy - cw * 0.06, cw, -9, { scene: 1, uid: `${uid}b` }).svg;
    out += polaroidCard(ctx, 2, cx + cw * 0.5, cy - cw * 0.1, cw, 8, { scene: 3, uid: `${uid}c` }).svg;
    const main = polaroidCard(ctx, 0, cx, cy + cw * 0.12, cw * 1.04, -1.5, { scene: 2, uid: `${uid}a` });
    out += main.svg;
    out += tape(cx + cw * 0.05, main.card.y + 0.4, cw * 0.36, cw * 0.1, 3, "#F1E6CF", 0.85);
    return out;
  },
  textArea: { x: 0.1, y: 0.64, w: 0.8, h: 0.31 },
  justify: "center",
  title: { font: "caveat", size: 0.1, color: "#3A2C20", weight: 500, lineHeight: 1.0 },
  subtitle: { font: "caveat", size: 0.056, color: "#5E4A38", weight: 500 },
  names: { font: "montserrat", size: 0.021, color: "#5E4A38", weight: 600, upper: true, tracking: 0.3 },
  ornament: { kind: "heart", color: "#B5473F" },
  spine: { color: "#3A2C20", font: "caveat" },
  back: { color: "#3A2C20", font: "caveat", area: BACK_AREA },
};
