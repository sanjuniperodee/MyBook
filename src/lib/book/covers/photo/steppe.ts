import { backBottom, BOTTOM, def, serifItalic } from "./kit";

export const steppe = def({
  id: "steppe",
  mood: "bright",
  layout: {
    size: [4800, 3200],
    credit: "Johnny McClung / Unsplash",
    focus: { x: 0.45, y: 0.5 },
    zoom: 1,
    base: "#7A5A22",
    back: "photo",
    shade: { kind: "bottom", color: "#2A1806", opacity: 0.55, size: 0.5 },
  },
  textArea: { ...BOTTOM, y: 0.66 },
  justify: "center",
  title: serifItalic("#FFF4DE"),
  soft: "#F6E3BE",
  names: { color: "#F0D49C" },
  ornament: { kind: "line", color: "#F0D49C" },
  back: backBottom,
});
