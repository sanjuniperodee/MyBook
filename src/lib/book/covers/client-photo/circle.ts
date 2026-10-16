import type { CoverTemplate } from "../types";
import { bg, n, photoSlot } from "../svg-kit";
import { BACK_AREA, ellipsePath } from "./kit";

// ─── Круг: снимок в круге, кольцо и цветной круг-тень на шалфейном фоне ───────

export const circle: CoverTemplate = {
  id: "circle",
  mood: "photo",
  requiresPhoto: true,
  samples: ["newborn"],
  texture: { kind: "grain", opacity: 0.1 },
  swatch: "radial-gradient(circle at 50% 37%,#b5a6c6 0 27%,transparent 28%),#c7ccb6",
  art: (g, ctx) => {
    const f = g.front;
    const r = Math.min(f.w * 0.31, f.h * 0.215);
    const cx = f.x + f.w / 2;
    const cy = f.y + f.h * 0.355;
    const line = "#F5F1E6";
    let out = bg(g, "#C5CBB3");
    out += `<circle cx="${n(cx + r * 0.16)}" cy="${n(cy + r * 0.13)}" r="${n(r)}" fill="#ABB396"/>`;
    out += photoSlot(ctx, 0, { x: cx - r, y: cy - r, w: r * 2, h: r * 2 }, { clip: ellipsePath(cx, cy, r, r), scene: 3 });
    out += `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r + 4)}" fill="none" stroke="${line}" stroke-width="0.35"/>`;
    // Метки на кольце — по сторонам света, как на циферблате
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      out += `<circle cx="${n(cx + Math.cos(a) * (r + 4))}" cy="${n(cy + Math.sin(a) * (r + 4))}" r="0.8" fill="${line}"/>`;
    }
    return out;
  },
  textArea: { x: 0.1, y: 0.63, w: 0.8, h: 0.31 },
  justify: "center",
  title: { font: "cormorant", size: 0.088, color: "#2F3A2A", weight: 500, lineHeight: 1.04 },
  subtitle: { font: "cormorant", size: 0.042, color: "#4A5642", italic: true },
  names: { font: "montserrat", size: 0.021, color: "#4F5B46", weight: 500, upper: true, tracking: 0.32 },
  ornament: { kind: "dots", color: "#F5F1E6" },
  spine: { color: "#2F3A2A", font: "cormorant" },
  back: { color: "#2F3A2A", font: "cormorant", area: BACK_AREA },
};
