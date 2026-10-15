import { def } from "./kit";

export const flax = def({
  id: "flax",
  mood: "classic",
  layout: { size: [3200, 4800], credit: "Safwan Thottoli / Unsplash", focus: { x: 0.5, y: 0.5 }, zoom: 1.4, base: "#D6CBAE", back: "photo", frame: { color: "#8C7355", inset: 9, double: true } },
  textArea: { x: 0.16, y: 0.3, w: 0.68, h: 0.34 },
  justify: "center",
  title: { font: "cormorant", size: 0.088, color: "#4A3A2A", weight: 500, lineHeight: 1.08 },
  soft: "#6B5640",
  ornament: { kind: "line", color: "#8C7355" },
  back: { mirror: true },
});
