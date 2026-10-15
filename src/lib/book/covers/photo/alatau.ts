import { backTop, def, TOP } from "./kit";

export const alatau = def({
  id: "alatau",
  mood: "classic",
  layout: { size: [4800, 3200], credit: "Etienne Bösiger / Unsplash", focus: { x: 0.42, y: 0.5 }, zoom: 1, base: "#879294", back: "photo" },
  textArea: { ...TOP, y: 0.1, h: 0.26 },
  justify: "center",
  title: { font: "cormorant", size: 0.105, color: "#1F3247", weight: 500, lineHeight: 1.05 },
  soft: "#3E5168",
  ornament: { kind: "line", color: "#3E5168" },
  back: backTop,
});
