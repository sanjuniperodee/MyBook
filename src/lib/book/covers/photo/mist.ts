import { backTop, def, serifItalic, TOP } from "./kit";

export const mist = def({
  id: "mist",
  mood: "classic",
  layout: { size: [4800, 3200], credit: "Julian Steenbergen / Unsplash", focus: { x: 0.32, y: 0.5 }, zoom: 1, base: "#53615C", back: "photo" },
  textArea: { ...TOP, y: 0.08 },
  justify: "center",
  title: serifItalic("#1E3328"),
  soft: "#3F5548",
  ornament: { kind: "line", color: "#3F5548" },
  back: backTop,
});
