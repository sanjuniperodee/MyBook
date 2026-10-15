import { def } from "./kit";

export const velvet = def({
  id: "velvet",
  mood: "romance",
  layout: {
    size: [4800, 3200],
    credit: "Kássia Melo / Unsplash",
    focus: { x: 0.5, y: 0.5 },
    zoom: 1,
    base: "#2A0D18",
    back: "photo",
    shade: { kind: "full", color: "#14040A", opacity: 0.3 },
    plate: { shape: "rect", fill: "#1C0610", opacity: 0.8, stroke: "#D9B77A", pad: 0.05 },
    frame: { color: "#D9B77A", inset: 8, double: true },
  },
  textArea: { x: 0.19, y: 0.34, w: 0.62, h: 0.3 },
  justify: "center",
  title: { font: "playfair", size: 0.084, color: "#F1D9A6", weight: 400, italic: true, lineHeight: 1.08 },
  soft: "#D8BC86",
  names: { color: "#C9A45C", tracking: 0.3 },
  ornament: { kind: "star", color: "#C9A45C" },
  back: { mirror: true },
});
