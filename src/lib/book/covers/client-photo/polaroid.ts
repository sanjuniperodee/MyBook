import type { CoverTemplate } from "../types";
import { bg, liftShadow, n, tape } from "../svg-kit";
import { BACK_AREA, polaroidCard } from "./kit";
import { HEART } from "../../motifs";

// ─── Полароид: снимок на скотче поверх ещё двух карточек, подпись от руки ────

export const polaroid: CoverTemplate = {
  id: "polaroid",
  mood: "photo",
  requiresPhoto: true,
  samples: ["friends"],
  texture: { kind: "linen", opacity: 0.2 },
  swatch: "linear-gradient(176deg,transparent 0 12%,#fff 12% 64%,transparent 64%),#e8ded0",
  art: (g, ctx) => {
    const f = g.front;
    const { uid } = ctx;
    const cw = Math.min(f.w * 0.66, f.h * 0.47);
    const cx = f.x + f.w / 2;
    const cy = f.y + f.h * 0.37;
    let out = bg(g, "#E8DED0");
    // Под снимком — ещё две пустые карточки: стопка, а не одинокая фотография.
    const ch = cw * 1.17;
    for (const [dx, dy, deg, k] of [
      [-2.5, 1.5, 5, "a"],
      [2, 0.5, -8, "b"],
    ] as const) {
      const r = { x: cx + dx - cw / 2, y: cy + dy - ch / 2, w: cw, h: ch };
      const rot = `rotate(${deg} ${n(cx + dx)} ${n(cy + dy)})`;
      out += liftShadow(r, `${uid}${k}`, { transform: rot, strength: 0.6 }) + `<rect x="${n(r.x)}" y="${n(r.y)}" width="${n(cw)}" height="${n(ch)}" fill="#F6F2EA" transform="${rot}"/>`;
    }
    const card = polaroidCard(ctx, 0, cx, cy, cw, -2.5, { scene: 2, uid: `${uid}c` });
    out += card.svg;
    // Сердечко от руки в нижнем поле карточки
    const hs = card.bottom * 0.3;
    const hx = card.card.x + cw - card.pad - hs * 1.8;
    const hy = card.card.y + card.pad + card.ph + (card.bottom - hs * 0.92) / 2;
    out += `<g transform="${card.rot}"><path d="${HEART}" fill="none" stroke="#C0485A" stroke-width="${n(0.4 / hs)}" stroke-linejoin="round" transform="translate(${n(hx)},${n(hy)}) scale(${n(hs)}) rotate(-8 0.5 0.46)"/></g>`;
    out += tape(cx - cw * 0.02, card.card.y + 0.4, cw * 0.34, cw * 0.09, -4, "#EAD9C2", 0.86);
    return out;
  },
  textArea: { x: 0.1, y: 0.67, w: 0.8, h: 0.29 },
  justify: "center",
  title: { font: "caveat", size: 0.1, color: "#3B302A", weight: 500, lineHeight: 1.0 },
  subtitle: { font: "caveat", size: 0.058, color: "#6B5A4E", weight: 500 },
  names: { font: "montserrat", size: 0.022, color: "#7D6B5E", weight: 500, upper: true, tracking: 0.26 },
  ornament: { kind: "heart", color: "#C0485A" },
  spine: { color: "#3B302A", font: "caveat" },
  back: { color: "#3B302A", font: "caveat", area: BACK_AREA },
};
