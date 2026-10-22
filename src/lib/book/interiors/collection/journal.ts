import type { InteriorDesign } from "../types";

/**
 * Редакция: современная журнальная вёрстка — контрастный Noto Serif Display в заголовках, огромный номер главы
 * с нулём слева, служебные надписи узким гротеском, крупная кавычка в цитатах и линейка колонтитула.
 */
export const journal: InteriorDesign = {
  id: "journal",
  mood: "modern",
  direction: "editorial",
  type: { heading: "notodisplay", headingWeight: 600, headingItalic: false, body: "literata", bodySize: 9.8, lineHeight: 1.55 },
  display: { font: "notodisplay", weight: 400 },
  label: { font: "intertight", weight: 600, upper: true, tracking: 0.24, size: 6.2 },
  palette: { ink: "#141414", muted: "#6B6B6B", accent: "#C2412D", rule: "#D9D4CE", ornament: "#C2412D" },
  ornament: "bar",
  opener: {
    align: "left",
    number: "padded",
    numeral: { font: "notodisplay", weight: 400, size: 88 },
    titleSize: 30,
    top: 0.14,
    vignette: false,
  },
  heading: { align: "left", size: 1.6, face: { font: "notodisplay", weight: 600 } },
  divider: "rule",
  leadIn: false,
  folio: { align: "outer", font: "label" },
  runningHead: "ruled",
  frame: "none",
  photos: { frame: "none", caption: "label" },
  text: { align: "justify", indent: 0, paraGap: 0.55 },
  quote: { face: { font: "notodisplay", weight: 400, italic: true }, style: "mark" },
  dropCap: { style: "raised", lines: 2, face: { font: "notodisplay", weight: 600 }, color: "ink" },
  titlePage: { layout: "stack", size: 44 },
  pairsWith: ["magazine", "mono", "split", "minimal", "steppe", "mist"],
};
