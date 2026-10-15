import type { InteriorDesign } from "../types";

/** Галерея: глава открывается снимком в белом паспарту на тёплой серой бумаге, фото — как отпечатки на стене. */
export const gallery: InteriorDesign = {
  id: "gallery",
  mood: "classic",
  type: { heading: "cormorant", headingWeight: 500, headingItalic: false, body: "lora", bodySize: 10, lineHeight: 1.55 },
  display: { font: "cormorant", weight: 500 },
  label: { font: "montserrat", weight: 500, upper: true, tracking: 0.36, size: 6.2 },
  palette: { ink: "#1F2622", muted: "#6C736D", accent: "#2E5546", rule: "#D3CCBE", ornament: "#B39A62" },
  ornament: "diamond",
  opener: {
    align: "center",
    number: "roman",
    numeral: { font: "cormorant", weight: 500, size: 30 },
    titleSize: 26,
    top: 0.36,
    photo: "framed",
    fill: { paper: "#ECE8E0", ink: "#1F2622", muted: "#6C736D", accent: "#2E5546", rule: "#CFC7B7", ornament: "#B39A62" },
  },
  heading: { align: "center", size: 1.45, accent: true },
  divider: "glyph",
  leadIn: true,
  folio: { align: "center", font: "label" },
  runningHead: "none",
  frame: "none",
  photos: { frame: "mat", caption: "label", paper: "#ECE8E0" },
  pairsWith: ["gallery", "passepartout", "medallion", "minimal", "retro", "mono"],
};
