import type { InteriorDesign } from "../types";

/**
 * Скрапбук: личный альбом — тёплая бумага, названия глав и заголовки от руки (Caveat), служебные надписи Pangolin,
 * скотч на начальных полосах, фото на скотче с подписями от руки, текст Alegreya влево и поднятая буквица.
 */
export const scrapbook: InteriorDesign = {
  id: "scrapbook",
  mood: "bright",
  direction: "scrapbook",
  type: { heading: "caveat", headingWeight: 500, headingItalic: false, body: "alegreya", bodySize: 10.5, lineHeight: 1.55 },
  display: { font: "caveat", weight: 500 },
  label: { font: "pangolin", weight: 400, tracking: 0.04, size: 8 },
  palette: { ink: "#2D2A26", muted: "#7D7268", accent: "#D0573F", rule: "#E3D3BF", ornament: "#3F7FA6" },
  ornament: "scribble",
  opener: { align: "left", number: "label", kicker: { font: "pangolin", weight: 400, size: 13 }, titleSize: 40, top: 0.26, art: "tape" },
  heading: { align: "left", size: 1.9, accent: true, face: { font: "caveat", weight: 500 } },
  divider: "glyph",
  leadIn: false,
  folio: { align: "outer" },
  runningHead: "none",
  frame: "none",
  photos: { frame: "tape", caption: "hand" },
  paper: "#FFFBF3",
  text: { align: "left", indent: 0, paraGap: 0.6 },
  quote: { face: { font: "caveat", weight: 500 }, style: "center" },
  dropCap: { style: "raised", lines: 2, face: { font: "pangolin", weight: 400 }, color: "accent" },
  titlePage: { layout: "left", size: 42 },
  pairsWith: ["collage", "stack", "polaroid", "torn", "stamp", "party"],
};
