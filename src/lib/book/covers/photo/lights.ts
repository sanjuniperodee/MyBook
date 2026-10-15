import { def, serifItalic } from "./kit";

export const lights = def({
  id: "lights",
  mood: "romance",
  layout: {
    size: [4465, 2977],
    credit: "Benjamin Wong / Unsplash",
    focus: { x: 0.55, y: 0.5 },
    zoom: 1,
    base: "#1A1208",
    back: "photo",
    plate: { shape: "rounded", fill: "#0F0A05", opacity: 0.66, stroke: "#E8C98A", pad: 0.05 },
  },
  textArea: { x: 0.17, y: 0.33, w: 0.66, h: 0.32 },
  justify: "center",
  title: serifItalic("#FFF1D2"),
  soft: "#F3D9A2",
  names: { color: "#E8C98A" },
  ornament: { kind: "star", color: "#E8C98A" },
  back: { mirror: true },
});
