import { backTop, def, serifItalic, TOP } from "./kit";

export const clouds = def({
  id: "clouds",
  mood: "tender",
  layout: { size: [3201, 4800], credit: "Jei Lee / Unsplash", focus: { x: 0.5, y: 0.62 }, zoom: 1, base: "#E5859A", back: "photo" },
  textArea: { ...TOP, y: 0.1, h: 0.32 },
  justify: "center",
  title: serifItalic("#FFFFFF", 0.11),
  soft: "#FFF3F5",
  ornament: { kind: "line", color: "#FFFFFF" },
  back: { ...backTop, color: "#FFFFFF" },
});
