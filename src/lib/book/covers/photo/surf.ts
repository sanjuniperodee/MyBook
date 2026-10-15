import { backTop, def, serifItalic, TOP } from "./kit";

export const surf = def({
  id: "surf",
  mood: "bright",
  layout: { size: [4800, 3200], credit: "Kevin Kurek / Unsplash", focus: { x: 0.5, y: 0.5 }, zoom: 1, base: "#1F8C8F", back: "photo" },
  textArea: { ...TOP, y: 0.08, h: 0.3 },
  justify: "center",
  title: serifItalic("#FFFFFF", 0.105),
  soft: "#E6FAF8",
  ornament: { kind: "line", color: "#FFFFFF" },
  back: { ...backTop, color: "#FFFFFF" },
});
