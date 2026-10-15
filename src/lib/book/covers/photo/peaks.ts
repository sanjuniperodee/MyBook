import { backBottom, BOTTOM, def } from "./kit";

export const peaks = def({
  id: "peaks",
  mood: "classic",
  layout: {
    size: [4800, 3200],
    credit: "Anurag Bhgsain / Unsplash",
    focus: { x: 0.55, y: 0.5 },
    zoom: 1,
    base: "#2A2E36",
    back: "photo",
    shade: { kind: "bottom", color: "#0A0F18", opacity: 0.45, size: 0.4 },
  },
  textArea: BOTTOM,
  justify: "center",
  title: { font: "cormorant", size: 0.1, color: "#FFFFFF", weight: 500, lineHeight: 1.05 },
  soft: "#E8EEF5",
  names: { color: "#F2C9B8" },
  ornament: { kind: "line", color: "#F2C9B8" },
  back: { ...backBottom, color: "#FFFFFF" },
});
