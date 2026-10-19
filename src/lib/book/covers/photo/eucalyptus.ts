import { backMiddle, def, TOP } from "./kit";

export const eucalyptus = def({
  id: "eucalyptus",
  mood: "tender",
  layout: { size: [4608, 3456], credit: "Sincerely Media / Unsplash", focus: { x: 0.73, y: 0.357 }, zoom: 0.82, base: "#EAEAEA", back: "photo" },
  textArea: { ...TOP, y: 0.08, h: 0.3 },
  justify: "center",
  title: { font: "cormorant", size: 0.1, color: "#2F4537", weight: 500, lineHeight: 1.05 },
  soft: "#5A6E5F",
  ornament: { kind: "dots", color: "#7D9482" },
  back: backMiddle,
});
