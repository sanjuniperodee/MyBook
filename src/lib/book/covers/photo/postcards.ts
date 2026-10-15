import { def, serifItalic, TOP } from "./kit";

export const postcards = def({
  id: "postcards",
  mood: "classic",
  layout: { size: [4800, 3204], credit: "rc.xyz NFT gallery / Unsplash", focus: { x: 0.48, y: 0.18 }, zoom: 0.78, base: "#0F100C", back: "photo" },
  textArea: { ...TOP, y: 0.07 },
  justify: "center",
  title: serifItalic("#F3E7D3"),
  soft: "#D9C9AE",
  names: { color: "#C9B08A" },
  ornament: { kind: "line", color: "#9C8664" },
  back: { area: { x: 0.14, y: 0.08, w: 0.72, h: 0.28 } },
});
