import type { CoverTemplate } from "../types";
import { n, rng } from "../svg-kit";
import { ridge, vGradient } from "./kit";

export const mountains: CoverTemplate = {
  id: "mountains",
  mood: "bright",
  texture: { kind: "grain", opacity: 0.1 },
  swatch: "linear-gradient(180deg,#f7d4b6 0 35%,#9c7ca5 36% 55%,#4a3a57 56% 75%,#2e2640 76%)",
  art: (g, { uid }) => {
    const rand = rng(19);
    const f = g.front;
    let out = vGradient(g, `${uid}bg`, [
      [0, "#F8DCC2"],
      [0.45, "#F1B9A4"],
      [0.75, "#C98FA3"],
      [1, "#8C6B9A"],
    ]);
    out += `<circle cx="${n(f.x + f.w * 0.68)}" cy="${n(f.y + f.h * 0.52)}" r="${n(f.w * 0.13)}" fill="#FFEBD2"/>`;
    out += ridge(g, g.height * 0.6, g.height * 0.14, 16, "#B78EA5", rand);
    out += ridge(g, g.height * 0.7, g.height * 0.12, 13, "#8E6C8D", rand);
    out += ridge(g, g.height * 0.8, g.height * 0.1, 11, "#5E4A6E", rand);
    out += ridge(g, g.height * 0.9, g.height * 0.07, 9, "#3A2E4A", rand);
    // Снежные шапки на дальнем хребте — лёгкие блики
    for (let i = 0; i < 5; i++) {
      const x = rand() * g.width;
      const y = g.height * 0.52 + rand() * g.height * 0.05;
      out += `<path d="M${n(x - 2)},${n(y + 2)} L${n(x)},${n(y)} L${n(x + 2.2)},${n(y + 2.2)}" fill="none" stroke="#FFF6EE" stroke-width="0.35" stroke-opacity="0.7"/>`;
    }
    // Птицы
    for (let i = 0; i < 3; i++) {
      const x = f.x + f.w * (0.2 + i * 0.09);
      const y = f.y + f.h * (0.46 - i * 0.02);
      out += `<path d="M${n(x - 1.6)},${n(y)} q0.8,-0.9 1.6,0 q0.8,-0.9 1.6,0" fill="none" stroke="#5E4A6E" stroke-width="0.3"/>`;
    }
    return out;
  },
  textArea: { x: 0.1, y: 0.09, w: 0.8, h: 0.3 },
  justify: "center",
  title: { font: "cormorant", size: 0.105, color: "#3F2A45", weight: 600, lineHeight: 1.02 },
  subtitle: { font: "cormorant", size: 0.046, color: "#6A4A6F", italic: true },
  names: { font: "montserrat", size: 0.025, color: "#6A4A6F", weight: 500, upper: true, tracking: 0.26 },
  spine: { color: "#FFF1E4", font: "cormorant" },
  back: { color: "#5B3651", font: "cormorant", area: { x: 0.12, y: 0.1, w: 0.76, h: 0.36 } },
};
