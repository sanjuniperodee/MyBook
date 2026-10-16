import { backTop, def, serifItalic, TOP } from "./kit";

export const dried = def({
  id: "dried",
  mood: "tender",
  layout: {
    size: [4800, 3840],
    credit: "Sixteen Miles Out / Unsplash",
    focus: { x: 0.55, y: 0.55 },
    zoom: 1,
    base: "#C6AC93",
    back: "photo",
    shade: { kind: "top", color: "#F3E4D6", opacity: 0.55, size: 0.45 },
  },
  textArea: { ...TOP, y: 0.06 },
  justify: "center",
  title: serifItalic("#4A2F21"),
  soft: "#6E4B38",
  ornament: { kind: "line", color: "#9A7458" },
  back: backTop,
});
