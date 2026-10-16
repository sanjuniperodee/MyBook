import { def } from "./kit";

export const saddle = def({
  id: "saddle",
  mood: "classic",
  layout: {
    size: [3072, 4608],
    credit: "Felipe Santana / Unsplash",
    focus: { x: 0.5, y: 0.5 },
    zoom: 1.5,
    base: "#63300C",
    back: "photo",
    shade: { kind: "vignette", color: "#1E0E05", opacity: 0.45 },
    frame: { color: "#D4AF6A", inset: 8, double: true },
  },
  textArea: { x: 0.16, y: 0.28, w: 0.68, h: 0.36 },
  justify: "center",
  title: { font: "cormorant", size: 0.07, color: "#E7C885", weight: 600, upper: true, tracking: 0.08, lineHeight: 1.15 },
  soft: "#DDBB7A",
  names: { color: "#D4AF6A", tracking: 0.32 },
  ornament: { kind: "star", color: "#D4AF6A" },
  back: { mirror: true },
});
