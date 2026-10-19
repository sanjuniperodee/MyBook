import { backBottom, BOTTOM, def, serifItalic } from "./kit";

export const milkyway = def({
  id: "milkyway",
  mood: "classic",
  layout: {
    size: [4096, 2733],
    credit: "Benjamin Voros / Unsplash",
    focus: { x: 0.5, y: 0.5 },
    zoom: 1,
    base: "#1B2436",
    back: "photo",
    shade: { kind: "bottom", color: "#000814", opacity: 0.55, size: 0.45 },
  },
  textArea: { ...BOTTOM, y: 0.66 },
  justify: "center",
  title: serifItalic("#FFFFFF"),
  soft: "#E6E9F5",
  names: { color: "#D9C9F0" },
  ornament: { kind: "star", color: "#E9D8FF" },
  back: { ...backBottom, color: "#FFFFFF" },
});
