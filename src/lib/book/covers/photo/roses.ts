import { def } from "./kit";

export const roses = def({
  id: "roses",
  mood: "romance",
  layout: {
    size: [4800, 3191],
    credit: "Biel Morro / Unsplash",
    focus: { x: 0.6, y: 0.5 },
    zoom: 1,
    base: "#1E2B26",
    back: "photo",
    plate: { shape: "rect", fill: "#F3ECE1", opacity: 0.96, stroke: "#B79B7E", pad: 0.045, shadow: true },
  },
  textArea: { x: 0.2, y: 0.35, w: 0.6, h: 0.28 },
  justify: "center",
  title: { font: "cormorant", size: 0.074, color: "#3B1E22", weight: 500, lineHeight: 1.08 },
  soft: "#7A4A4E",
  names: { font: "cormorant", size: 0.04, italic: true, upper: false, tracking: 0, weight: 400 },
  ornament: { kind: "heart", color: "#A8343F" },
  back: { mirror: true },
});
