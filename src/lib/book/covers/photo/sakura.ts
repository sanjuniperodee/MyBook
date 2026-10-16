import { backBottom, BOTTOM, def, serifItalic } from "./kit";

export const sakura = def({
  id: "sakura",
  mood: "bright",
  layout: { size: [4800, 3200], credit: "Waldemar Brandt / Unsplash", focus: { x: 0.62, y: 0.5 }, zoom: 1, base: "#3E7DCC", back: "photo" },
  textArea: { ...BOTTOM, y: 0.64, h: 0.28 },
  justify: "center",
  title: serifItalic("#FFFFFF"),
  soft: "#EAF3FF",
  ornament: { kind: "line", color: "#FFFFFF" },
  back: { ...backBottom, color: "#FFFFFF" },
});
