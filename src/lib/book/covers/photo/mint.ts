import { backMiddle, def, serifItalic, TOP } from "./kit";

export const mint = def({
  id: "mint",
  mood: "tender",
  layout: { size: [4592, 3448], credit: "A R / Unsplash", focus: { x: 0.7, y: 0.33 }, zoom: 0.85, base: "#889F8F", back: "photo" },
  textArea: { ...TOP, y: 0.07 },
  justify: "center",
  title: serifItalic("#2E4A3E"),
  soft: "#4E6A5D",
  ornament: { kind: "line", color: "#4E6A5D" },
  back: backMiddle,
});
