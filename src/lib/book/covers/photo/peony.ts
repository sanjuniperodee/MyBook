import { def, serifItalic } from "./kit";

export const peony = def({
  id: "peony",
  mood: "romance",
  layout: { size: [4800, 3600], credit: "Haberdoedas / Unsplash", focus: { x: 0.5, y: 0.29 }, zoom: 0.82, base: "#000000", back: "photo" },
  textArea: { x: 0.1, y: 0.07, w: 0.8, h: 0.26 },
  justify: "center",
  title: serifItalic("#F2E6D0"),
  soft: "#CDBEA4",
  names: { color: "#BFA57A" },
  ornament: { kind: "line", color: "#8E7A5A" },
  back: { area: { x: 0.14, y: 0.08, w: 0.72, h: 0.28 }, color: "#E9DCC3" },
});
