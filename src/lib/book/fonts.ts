/** Реестр шрифтов: одни и те же файлы используются на сайте (next/font/local) и в PDF. */

export type FontKey = "cormorant" | "playfair" | "lora" | "ptserif" | "montserrat" | "onest" | "badscript" | "caveat";

export interface FontFace {
  file: string;
  weight: number;
  style: "normal" | "italic";
}

export const fontFaces: Record<FontKey, { family: string; cssVar: string; faces: FontFace[] }> = {
  cormorant: {
    family: "Cormorant",
    cssVar: "--font-cormorant",
    faces: [
      { file: "Cormorant-400.ttf", weight: 400, style: "normal" },
      { file: "Cormorant-500.ttf", weight: 500, style: "normal" },
      { file: "Cormorant-600.ttf", weight: 600, style: "normal" },
      { file: "Cormorant-400-italic.ttf", weight: 400, style: "italic" },
      { file: "Cormorant-500-italic.ttf", weight: 500, style: "italic" },
    ],
  },
  playfair: {
    family: "Playfair",
    cssVar: "--font-playfair",
    faces: [
      { file: "Playfair-400.ttf", weight: 400, style: "normal" },
      { file: "Playfair-600.ttf", weight: 600, style: "normal" },
      { file: "Playfair-400-italic.ttf", weight: 400, style: "italic" },
    ],
  },
  lora: {
    family: "Lora",
    cssVar: "--font-lora",
    faces: [
      { file: "Lora-400.ttf", weight: 400, style: "normal" },
      { file: "Lora-600.ttf", weight: 600, style: "normal" },
      { file: "Lora-400-italic.ttf", weight: 400, style: "italic" },
    ],
  },
  ptserif: {
    family: "PTSerif",
    cssVar: "--font-ptserif",
    faces: [
      { file: "PTSerif-400.ttf", weight: 400, style: "normal" },
      { file: "PTSerif-700.ttf", weight: 700, style: "normal" },
      { file: "PTSerif-400-italic.ttf", weight: 400, style: "italic" },
    ],
  },
  montserrat: {
    family: "Montserrat",
    cssVar: "--font-montserrat",
    faces: [
      { file: "Montserrat-400.ttf", weight: 400, style: "normal" },
      { file: "Montserrat-500.ttf", weight: 500, style: "normal" },
      { file: "Montserrat-600.ttf", weight: 600, style: "normal" },
      { file: "Montserrat-400-italic.ttf", weight: 400, style: "italic" },
    ],
  },
  onest: {
    family: "Onest",
    cssVar: "--font-onest",
    faces: [
      { file: "Onest-400.ttf", weight: 400, style: "normal" },
      { file: "Onest-500.ttf", weight: 500, style: "normal" },
      { file: "Onest-600.ttf", weight: 600, style: "normal" },
      { file: "Onest-700.ttf", weight: 700, style: "normal" },
    ],
  },
  badscript: {
    family: "BadScript",
    cssVar: "--font-badscript",
    faces: [{ file: "BadScript-400.ttf", weight: 400, style: "normal" }],
  },
  caveat: {
    family: "Caveat",
    cssVar: "--font-caveat",
    faces: [{ file: "Caveat-500.ttf", weight: 500, style: "normal" }],
  },
};

export function cssFont(key: FontKey) {
  return `var(${fontFaces[key].cssVar}), serif`;
}

/** Пара шрифтов основного текста и заголовков вопросов. Кегль — для A5, на крупных форматах масштабируется. */
export interface Typography {
  heading: FontKey;
  headingWeight: number;
  headingItalic: boolean;
  body: FontKey;
  /** Кегль основного текста, pt. */
  bodySize: number;
  lineHeight: number;
}
