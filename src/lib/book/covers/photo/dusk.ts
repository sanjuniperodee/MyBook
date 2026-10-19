import { backTop, def, serifItalic, TOP } from "./kit";

export const dusk = def({
  id: "dusk",
  mood: "romance",
  layout: {
    size: [4800, 3194],
    credit: "krzhck / Unsplash",
    focus: { x: 0.62, y: 0.5 },
    zoom: 1,
    base: "#7A6E96",
    back: "photo",
    shade: { kind: "top", color: "#2B2350", opacity: 0.25, size: 0.5 },
  },
  textArea: { ...TOP, y: 0.1 },
  justify: "center",
  title: serifItalic("#FFFFFF", 0.108),
  soft: "#F4ECF6",
  ornament: { kind: "line", color: "#F4ECF6" },
  back: { ...backTop, color: "#FFFFFF" },
});
