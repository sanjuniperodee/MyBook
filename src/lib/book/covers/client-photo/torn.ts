import type { CoverTemplate } from "../types";
import { bg, n, photoSlot, tornEdgePath } from "../svg-kit";
import { BACK_AREA } from "./kit";

// ─── Обрывок: снимок сверху, снизу — лист бумаги с рваным краем ──────────────

export const torn: CoverTemplate = {
  id: "torn",
  mood: "photo",
  requiresPhoto: true,
  samples: ["familydusk"],
  texture: { kind: "grain", opacity: 0.12 },
  swatch: "linear-gradient(176deg,#6fb0b5 0 60%,#f6f1e8 62%)",
  art: (g, ctx) => {
    const f = g.front;
    const { uid } = ctx;
    const edge = f.y + f.h * 0.6;
    let out = bg(g, "#F6F1E8");
    out += photoSlot(ctx, 0, { x: f.x, y: 0, w: g.width - f.x, h: edge + 6 }, { scene: 1 });
    const x0 = f.x - 6;
    const x1 = g.width + 2;
    // Лист и его тень — только на лице: на корешке и обороте фон и так цвета бумаги.
    out += `<defs><filter id="${uid}ts" x="-5%" y="-30%" width="110%" height="160%"><feGaussianBlur stdDeviation="1.3"/></filter><clipPath id="${uid}tc"><rect x="${n(f.x)}" y="0" width="${n(g.width - f.x)}" height="${n(g.height)}"/></clipPath></defs><g clip-path="url(#${uid}tc)">`;
    out += `<path d="${tornEdgePath(x0, x1, edge - 0.6, 1.1, 7, g.height + 2)}" fill="#000" fill-opacity="0.32" filter="url(#${uid}ts)"/>`;
    // Белые волокна на линии отрыва, под ними — сам лист
    out += `<path d="${tornEdgePath(x0, x1, edge, 1.1, 7, g.height + 2)}" fill="#FFFFFF"/>`;
    out += `<path d="${tornEdgePath(x0, x1, edge + 1.3, 0.9, 13, g.height + 2)}" fill="#F6F1E8"/></g>`;
    return out;
  },
  textArea: { x: 0.1, y: 0.645, w: 0.8, h: 0.3 },
  justify: "center",
  title: { font: "cormorant", size: 0.098, color: "#24343A", weight: 500, italic: true, lineHeight: 1.02 },
  subtitle: { font: "cormorant", size: 0.044, color: "#4E6268", italic: true },
  names: { font: "caveat", size: 0.05, color: "#3D6F78", weight: 500 },
  ornament: { kind: "dots", color: "#7FA8AE" },
  spine: { color: "#24343A", font: "cormorant" },
  back: { color: "#24343A", font: "cormorant", area: BACK_AREA },
};
