import { def, serifItalic, TOP } from "./kit";

export const lavender = def({
  id: "lavender",
  mood: "tender",
  layout: { size: [4800, 3200], credit: "Antony BEC / Unsplash", focus: { x: 0.5, y: 0.5 }, zoom: 1, base: "#746493", back: "photo" },
  textArea: { ...TOP, y: 0.07, h: 0.24 },
  justify: "center",
  title: serifItalic("#3B2357"),
  soft: "#5B4377",
  ornament: { kind: "line", color: "#5B4377" },
  back: { area: { x: 0.14, y: 0.08, w: 0.72, h: 0.26 } },
});
