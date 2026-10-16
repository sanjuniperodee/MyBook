import type { CoverTemplate } from "../types";
import { bg, liftShadow, n, photoSlot } from "../svg-kit";
import { BACK_AREA, rectFrame } from "./kit";

// ─── Паспарту: снимок в белом паспарту со скошенным вырезом на синем льне ─────

export const passepartout: CoverTemplate = {
  id: "passepartout",
  mood: "photo",
  requiresPhoto: true,
  samples: ["autumnlove"],
  texture: { kind: "linen", opacity: 0.32 },
  swatch: "linear-gradient(transparent 0 8%,#f7f3ec 8% 64%,transparent 64%) 50% 0/78% 100% no-repeat,#33414f",
  art: (g, ctx) => {
    const f = g.front;
    const { uid } = ctx;
    const mw = Math.min(f.w * 0.78, f.h * 0.6);
    const mat = { x: f.x + (f.w - mw) / 2, y: f.y + f.h * 0.08, w: mw, h: Math.min(f.h * 0.56, mw * 1.08) };
    const inset = mw * 0.075;
    const win = { x: mat.x + inset, y: mat.y + inset, w: mat.w - inset * 2, h: mat.h - inset * 2 };
    let out = bg(g, "#33414F");
    out += liftShadow(mat, `${uid}s`, { strength: 1.6 });
    out += `<rect x="${n(mat.x)}" y="${n(mat.y)}" width="${n(mat.w)}" height="${n(mat.h)}" fill="#F7F3EC"/>`;
    out += rectFrame(mat, 2.4, "#C9B48A", 0.2);
    // Скос выреза: светлые грани сверху и слева, затенённые снизу и справа — свет падает слева сверху.
    const b = 1.3;
    const o = { x: win.x - b, y: win.y - b, w: win.w + b * 2, h: win.h + b * 2 };
    out += `<path d="M${n(o.x)},${n(o.y)} L${n(o.x + o.w)},${n(o.y)} L${n(win.x + win.w)},${n(win.y)} L${n(win.x)},${n(win.y)} L${n(win.x)},${n(win.y + win.h)} L${n(o.x)},${n(o.y + o.h)}Z" fill="#FFFFFF"/>`;
    out += `<path d="M${n(o.x + o.w)},${n(o.y)} L${n(o.x + o.w)},${n(o.y + o.h)} L${n(o.x)},${n(o.y + o.h)} L${n(win.x)},${n(win.y + win.h)} L${n(win.x + win.w)},${n(win.y + win.h)} L${n(win.x + win.w)},${n(win.y)}Z" fill="#DDD3C3"/>`;
    out += photoSlot(ctx, 0, win, { scene: 1 });
    out += `<rect x="${n(win.x)}" y="${n(win.y)}" width="${n(win.w)}" height="${n(win.h)}" fill="none" stroke="#000" stroke-opacity="0.2" stroke-width="0.2"/>`;
    return out;
  },
  textArea: { x: 0.12, y: 0.67, w: 0.76, h: 0.28 },
  justify: "center",
  title: { font: "cormorant", size: 0.082, color: "#F2E7D2", weight: 500, lineHeight: 1.06 },
  subtitle: { font: "cormorant", size: 0.04, color: "#D2C6B0", italic: true },
  names: { font: "montserrat", size: 0.022, color: "#BDB09A", weight: 500, upper: true, tracking: 0.3 },
  ornament: { kind: "line", color: "#BDB09A" },
  spine: { color: "#F2E7D2", font: "cormorant" },
  back: { color: "#E6DCC8", font: "cormorant", area: BACK_AREA },
};
