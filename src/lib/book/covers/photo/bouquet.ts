import { backMiddle, def, serifItalic, TOP } from "./kit";

export const bouquet = def({
  id: "bouquet",
  mood: "romance",
  layout: { size: [4800, 3200], credit: "Earl Wilcox / Unsplash", focus: { x: 0.7, y: 0.275 }, zoom: 0.85, base: "#F3C3B0", back: "photo" },
  textArea: { ...TOP, y: 0.07 },
  justify: "center",
  title: serifItalic("#6E2238"),
  soft: "#8E4456",
  ornament: { kind: "heart", color: "#B8586F" },
  back: backMiddle,
});
