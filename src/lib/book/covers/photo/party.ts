import { def } from "./kit";

export const party = def({
  id: "party",
  mood: "bright",
  layout: {
    size: [4800, 3204],
    credit: "Mockaroon / Unsplash",
    focus: { x: 0.5, y: 0.5 },
    zoom: 1,
    base: "#EEEEEE",
    back: "photo",
    plate: { shape: "rounded", fill: "#FFFFFF", opacity: 0.92, pad: 0.05 },
  },
  textArea: { x: 0.15, y: 0.34, w: 0.7, h: 0.3 },
  justify: "center",
  title: { font: "montserrat", size: 0.066, color: "#1F1B24", weight: 600, upper: true, tracking: 0.06, lineHeight: 1.15 },
  soft: "#5B5563",
  subtitle: { font: "montserrat", size: 0.032, italic: false, weight: 400 },
  names: { color: "#E2475B", tracking: 0.2 },
  ornament: { kind: "dots", color: "#E2475B" },
  font: "montserrat",
  back: { mirror: true },
});
