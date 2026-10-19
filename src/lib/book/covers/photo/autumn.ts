import { def, serifItalic, TOP } from "./kit";

export const autumn = def({
  id: "autumn",
  mood: "bright",
  layout: { size: [3200, 4800], credit: "Cole Keister / Unsplash", focus: { x: 0.5, y: 0.38 }, zoom: 1, base: "#C8D3D6", back: "photo" },
  textArea: { ...TOP, y: 0.06, h: 0.24 },
  justify: "center",
  title: serifItalic("#7A1E14"),
  soft: "#9A3F2E",
  ornament: { kind: "line", color: "#B5543E" },
  back: { area: { x: 0.14, y: 0.08, w: 0.72, h: 0.26 } },
});
