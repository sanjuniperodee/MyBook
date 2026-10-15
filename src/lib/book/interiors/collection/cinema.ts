import type { InteriorDesign } from "../types";

/** Кадр: глава открывается снимком на всю полосу с названием поверх, как титр фильма; цифры «01». */
export const cinema: InteriorDesign = {
  id: "cinema",
  mood: "modern",
  type: { heading: "playfair", headingWeight: 400, headingItalic: false, body: "lora", bodySize: 10, lineHeight: 1.55 },
  display: { font: "playfair", weight: 400 },
  label: { font: "montserrat", weight: 600, upper: true, tracking: 0.34, size: 6.2 },
  palette: { ink: "#1C1A19", muted: "#77716C", accent: "#1C1A19", rule: "#DCD7D2", ornament: "#9A928B" },
  ornament: "bar",
  opener: {
    align: "left",
    number: "padded",
    numeral: { font: "montserrat", weight: 500, size: 22 },
    titleSize: 30,
    top: 0.58,
    photo: "full",
    fill: { paper: "#1E1B19", ink: "#FFFFFF", muted: "#E4DED8", accent: "#F2EAE0", rule: "#8C847C", ornament: "#F2EAE0" },
  },
  heading: { align: "left", size: 1.5, bar: true },
  divider: "rule",
  leadIn: true,
  folio: { align: "outer", font: "label" },
  runningHead: "ruled",
  frame: "none",
  photos: { frame: "none", caption: "label" },
  pairsWith: ["magazine", "mono", "glow", "split", "duotone", "indigo", "film", "photo", "strips"],
};
