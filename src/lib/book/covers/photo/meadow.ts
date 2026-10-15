import { backTop, def, serifItalic, TOP } from "./kit";

export const meadow = def({
  id: "meadow",
  mood: "tender",
  layout: {
    size: [4272, 2848],
    credit: "Daniel Splisser / Unsplash",
    focus: { x: 0.55, y: 0.5 },
    zoom: 1,
    base: "#A28D7C",
    back: "photo",
    shade: { kind: "top", color: "#FFF7EC", opacity: 0.45, size: 0.4 },
  },
  textArea: { ...TOP, y: 0.07 },
  justify: "center",
  title: serifItalic("#3B2A20"),
  soft: "#5E4636",
  ornament: { kind: "line", color: "#8B6B52" },
  back: backTop,
});
