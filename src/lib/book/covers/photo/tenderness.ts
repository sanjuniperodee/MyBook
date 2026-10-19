import { def, serifItalic } from "./kit";

export const tenderness = def({
  id: "tenderness",
  mood: "tender",
  layout: {
    size: [4800, 3428],
    credit: "Cristina Anne Costello / Unsplash",
    focus: { x: 0.5, y: 0.5 },
    zoom: 1.05,
    base: "#CD7165",
    back: "photo",
    plate: { shape: "rounded", fill: "#FFF8F3", opacity: 0.94, stroke: "#D98A86", pad: 0.05, shadow: true },
  },
  textArea: { x: 0.2, y: 0.34, w: 0.6, h: 0.3 },
  justify: "center",
  title: serifItalic("#7A2733", 0.082),
  soft: "#9C4F55",
  names: { font: "cormorant", size: 0.04, italic: true, upper: false, tracking: 0, weight: 400 },
  ornament: { kind: "heart", color: "#D06A6E" },
  back: { mirror: true },
});
