import type { CoverTemplate } from "../types";
import { liftShadow, n, photoSlot } from "../svg-kit";
import { BACK_AREA, foil, rectFrame } from "./kit";

// ─── Галерея: картина в золочёной раме с подсветкой на изумрудной стене ───────

export const gallery: CoverTemplate = {
  id: "gallery",
  mood: "photo",
  requiresPhoto: true,
  samples: ["family"],
  texture: { kind: "linen", opacity: 0.22 },
  swatch: "linear-gradient(transparent 0 12%,#c9a45c 12% 62%,transparent 62%) 50% 0/62% 100% no-repeat,radial-gradient(circle at 50% 20%,#3d5f50,#1c3029)",
  art: (g, ctx) => {
    const f = g.front;
    const { uid } = ctx;
    const W = Math.min(f.w * 0.64, f.h * 0.42);
    const H = W * 1.24;
    const x = f.x + (f.w - W) / 2;
    const y = f.y + f.h * 0.115;
    const fw = W * 0.075;
    const mat = W * 0.09;
    const cx = x + W / 2;
    let out = `<defs>${foil(`${uid}au`, { x, y, w: W, h: H })}<radialGradient id="${uid}wall" gradientUnits="userSpaceOnUse" cx="${n(cx)}" cy="${n(y + H * 0.25)}" r="${n(Math.max(f.w, f.h) * 0.8)}"><stop offset="0" stop-color="#3F6352"/><stop offset="0.55" stop-color="#26423A"/><stop offset="1" stop-color="#162822"/></radialGradient></defs>`;
    out += `<rect width="${n(g.width)}" height="${n(g.height)}" fill="url(#${uid}wall)"/>`;
    // Свет лампы над картиной — мягкий конус вниз
    out += `<defs><linearGradient id="${uid}cone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF1CF" stop-opacity="0.32"/><stop offset="1" stop-color="#FFF1CF" stop-opacity="0"/></linearGradient><filter id="${uid}cb" x="-20%" y="-10%" width="140%" height="120%"><feGaussianBlur stdDeviation="3"/></filter></defs>`;
    out += `<path d="M${n(cx - W * 0.16)},${n(y - fw * 0.5)} L${n(cx + W * 0.16)},${n(y - fw * 0.5)} L${n(cx + W * 0.62)},${n(y + H * 0.75)} L${n(cx - W * 0.62)},${n(y + H * 0.75)}Z" fill="url(#${uid}cone)" filter="url(#${uid}cb)"/>`;
    const frame = { x, y, w: W, h: H };
    out += liftShadow(frame, `${uid}s`, { strength: 1.8 });
    out += `<rect x="${n(x)}" y="${n(y)}" width="${n(W)}" height="${n(H)}" fill="url(#${uid}au)"/>`;
    // Профиль багета: тёмная канавка и светлая кромка
    out += rectFrame(frame, fw * 0.35, "#6E5121", 0.35, 0.8) + rectFrame(frame, fw * 0.08, "#FFF0C2", 0.25, 0.7);
    const inner = { x: x + fw, y: y + fw, w: W - fw * 2, h: H - fw * 2 };
    out += `<rect x="${n(inner.x)}" y="${n(inner.y)}" width="${n(inner.w)}" height="${n(inner.h)}" fill="#F6F1E6"/>`;
    out += `<rect x="${n(inner.x)}" y="${n(inner.y)}" width="${n(inner.w)}" height="1.1" fill="#000" fill-opacity="0.12"/>`;
    const win = { x: inner.x + mat, y: inner.y + mat, w: inner.w - mat * 2, h: inner.h - mat * 2 };
    out += photoSlot(ctx, 0, win, { scene: 0 });
    out += `<rect x="${n(win.x)}" y="${n(win.y)}" width="${n(win.w)}" height="${n(win.h)}" fill="none" stroke="#000" stroke-opacity="0.22" stroke-width="0.25"/>`;
    // Латунная лампа-подсветка над рамой
    const lw = W * 0.34;
    out += `<path d="M${n(cx - 0.4)},${n(y - fw * 0.2)} L${n(cx - 0.4)},${n(y - fw * 1.2)} L${n(cx + 0.4)},${n(y - fw * 1.2)} L${n(cx + 0.4)},${n(y - fw * 0.2)}Z" fill="url(#${uid}au)"/>`;
    out += `<rect x="${n(cx - lw / 2)}" y="${n(y - fw * 1.9)}" width="${n(lw)}" height="${n(fw * 0.8)}" rx="${n(fw * 0.4)}" fill="url(#${uid}au)"/>`;
    return out;
  },
  textArea: { x: 0.12, y: 0.665, w: 0.76, h: 0.29 },
  justify: "center",
  title: { font: "cormorant", size: 0.082, color: "#EBD39C", weight: 600, lineHeight: 1.05 },
  subtitle: { font: "cormorant", size: 0.04, color: "#D7C190", italic: true },
  names: { font: "montserrat", size: 0.021, color: "#C9AE74", weight: 500, upper: true, tracking: 0.32 },
  ornament: { kind: "line", color: "#C9AE74" },
  spine: { color: "#EBD39C", font: "cormorant" },
  back: { color: "#D7C190", font: "cormorant", area: BACK_AREA },
};
