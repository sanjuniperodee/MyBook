import { def } from "./kit";

export const marble = def({
  id: "marble",
  mood: "classic",
  layout: { size: [4800, 3200], credit: "H&CO / Unsplash", focus: { x: 0.45, y: 0.5 }, zoom: 1, base: "#E3E3E3", back: "photo", frame: { color: "#B08D4E", inset: 10 } },
  textArea: { x: 0.14, y: 0.3, w: 0.72, h: 0.34 },
  justify: "center",
  title: { font: "playfair", size: 0.085, color: "#1D1D1F", weight: 400, lineHeight: 1.1 },
  soft: "#555555",
  names: { color: "#8C7140", tracking: 0.3 },
  ornament: { kind: "line", color: "#B08D4E" },
  back: { mirror: true },
});
