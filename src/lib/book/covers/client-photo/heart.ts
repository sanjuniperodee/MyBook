import type { CoverTemplate } from "../types";
import { n, photoSlot, rng } from "../svg-kit";
import { BACK_AREA } from "./kit";
import { HEART } from "../../motifs";

// ─── Сердце: фото в форме сердца с белой каймой на пудровом фоне ─────────────

export const heart: CoverTemplate = {
  id: "heart",
  mood: "photo",
  requiresPhoto: true,
  samples: ["mamahug"],
  texture: { kind: "grain", opacity: 0.08 },
  swatch: "radial-gradient(circle at 37% 30%,#d9a3a8 0 17%,transparent 18%),radial-gradient(circle at 63% 30%,#d9a3a8 0 17%,transparent 18%),conic-gradient(from 135deg at 50% 58%,#d9a3a8 0 90deg,transparent 90deg),#f5deda",
  art: (g, ctx) => {
    const f = g.front;
    const { uid } = ctx;
    const rand = rng(83);
    const s = Math.min(f.w * 0.72, (f.h * 0.5) / 0.92);
    const x0 = f.x + (f.w - s) / 2;
    const y0 = f.y + f.h * 0.08;
    let out = `<defs><radialGradient id="${uid}bg" gradientUnits="userSpaceOnUse" cx="${n(f.x + f.w / 2)}" cy="${n(y0 + s * 0.4)}" r="${n(Math.max(f.w, f.h) * 0.8)}"><stop offset="0" stop-color="#FAEAE6"/><stop offset="1" stop-color="#EECBC6"/></radialGradient></defs><rect width="${n(g.width)}" height="${n(g.height)}" fill="url(#${uid}bg)"/>`;
    // Редкие сердечки, будто рассыпанные конфетти
    for (let i = 0; i < Math.round((g.width * g.height) / 900); i++) {
      const hs = 2.2 + rand() * 2.4;
      out += `<path d="${HEART}" fill="#D99A9F" fill-opacity="${n(0.25 + rand() * 0.3)}" transform="translate(${n(rand() * g.width)},${n(rand() * g.height)}) rotate(${n((rand() - 0.5) * 50)}) scale(${n(hs)})"/>`;
    }
    const tr = `translate(${n(x0)},${n(y0)}) scale(${n(s)})`;
    const k = (s + 6) / s;
    const tr2 = `translate(${n(x0 + s * 0.5 * (1 - k))},${n(y0 + s * 0.46 * (1 - k))}) scale(${n(s * k)})`;
    out += `<defs><filter id="${uid}hs" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.4"/></filter></defs><path d="${HEART}" fill="#7C2236" fill-opacity="0.22" filter="url(#${uid}hs)" transform="translate(0.6 2.4) ${tr2}"/>`;
    out += `<path d="${HEART}" fill="#FFFFFF" transform="${tr2}"/>`;
    out += photoSlot(ctx, 0, { x: x0, y: y0, w: s, h: s * 0.92 }, { clip: HEART, clipTransform: tr, scene: 0 });
    const k2 = (s + 13) / s;
    out += `<path d="${HEART}" fill="none" stroke="#C4566A" stroke-width="${n(0.3 / (s * k2))}" transform="translate(${n(x0 + s * 0.5 * (1 - k2))},${n(y0 + s * 0.46 * (1 - k2))}) scale(${n(s * k2)})"/>`;
    return out;
  },
  textArea: { x: 0.1, y: 0.62, w: 0.8, h: 0.32 },
  justify: "center",
  title: { font: "cormorant", size: 0.088, color: "#7C2236", weight: 500, italic: true, lineHeight: 1.05 },
  subtitle: { font: "cormorant", size: 0.042, color: "#9C4B5B", italic: true },
  names: { font: "cormorant", size: 0.045, color: "#9C4B5B", italic: true },
  ornament: { kind: "heart", color: "#C4566A" },
  spine: { color: "#7C2236", font: "cormorant" },
  back: { color: "#7C2236", font: "cormorant", area: BACK_AREA },
};
