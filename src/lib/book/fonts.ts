/** Реестр шрифтов: одни и те же файлы используются на сайте (next/font/local) и в PDF. */

export type FontKey =
  | "cormorant"
  | "playfair"
  | "lora"
  | "ptserif"
  | "montserrat"
  | "onest"
  | "badscript"
  | "caveat"
  // Библиотека дизайнера (все — SIL OFL, Google Fonts; кириллица с казахскими буквами проверена по файлам).
  | "ebgaramond"
  | "literata"
  | "alegreya"
  | "spectral"
  | "oldstandard"
  | "notodisplay"
  | "prata"
  | "yeseva"
  | "forum"
  | "cormorantsc"
  | "raleway"
  | "intertight"
  | "geologica"
  | "oswald"
  | "montalt"
  | "pacifico"
  | "lobster"
  | "kurale"
  | "philosopher"
  | "alice"
  | "comfortaa"
  | "nunito"
  | "pangolin";

export interface FontFace {
  file: string;
  weight: number;
  style: "normal" | "italic";
}

/** Группа в выборе шрифта. */
export type FontCategory = "book" | "editorial" | "sans" | "script" | "decorative" | "kids";

export interface FontDef {
  family: string;
  cssVar: string;
  faces: FontFace[];
  /** Название в выборе шрифта. */
  name?: string;
  category?: FontCategory;
  /** Годится для основного текста (длинного чтения); иначе — только для заголовков и надписей. */
  body?: boolean;
  /**
   * Шрифт для знаков, которых в этом нет (₸, №, многоточие): PDF подставляет их из него, браузер — следующим
   * в CSS-стеке. Сами буквы (в том числе ә ғ қ ң ө ұ ү һ і) есть у каждого шрифта реестра.
   */
  fallback?: FontKey;
  /** Средняя ширина знака, em — для оценки строк без вёрстки (оборот обложки, подбор кегля). */
  width?: number;
}

const faces = (family: string, list: [number, "n" | "i"][]): FontFace[] =>
  list.map(([weight, s]) => ({ file: `${family}-${weight}${s === "i" ? "-italic" : ""}.ttf`, weight, style: s === "i" ? "italic" : "normal" }));

export const fontFaces: Record<FontKey, FontDef> = {
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
    name: "Cormorant",
    category: "book",
    body: true,
    width: 0.45,
  },
  playfair: {
    family: "Playfair",
    cssVar: "--font-playfair",
    faces: [
      { file: "Playfair-400.ttf", weight: 400, style: "normal" },
      { file: "Playfair-600.ttf", weight: 600, style: "normal" },
      { file: "Playfair-400-italic.ttf", weight: 400, style: "italic" },
    ],
    name: "Playfair Display",
    category: "editorial",
    width: 0.55,
  },
  lora: {
    family: "Lora",
    cssVar: "--font-lora",
    faces: [
      { file: "Lora-400.ttf", weight: 400, style: "normal" },
      { file: "Lora-600.ttf", weight: 600, style: "normal" },
      { file: "Lora-400-italic.ttf", weight: 400, style: "italic" },
    ],
    name: "Lora",
    category: "book",
    body: true,
    width: 0.52,
  },
  ptserif: {
    family: "PTSerif",
    cssVar: "--font-ptserif",
    faces: [
      { file: "PTSerif-400.ttf", weight: 400, style: "normal" },
      { file: "PTSerif-700.ttf", weight: 700, style: "normal" },
      { file: "PTSerif-400-italic.ttf", weight: 400, style: "italic" },
    ],
    name: "PT Serif",
    category: "book",
    body: true,
    width: 0.52,
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
    name: "Montserrat",
    category: "sans",
    body: true,
    width: 0.6,
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
    name: "Onest",
    category: "sans",
    body: true,
    width: 0.57,
  },
  badscript: {
    family: "BadScript",
    cssVar: "--font-badscript",
    faces: [{ file: "BadScript-400.ttf", weight: 400, style: "normal" }],
    name: "Bad Script",
    category: "script",
    width: 0.52,
  },
  caveat: {
    family: "Caveat",
    cssVar: "--font-caveat",
    faces: [{ file: "Caveat-500.ttf", weight: 500, style: "normal" }],
    name: "Caveat",
    category: "script",
    width: 0.44,
  },

  ebgaramond: { family: "EBGaramond", cssVar: "--font-ebgaramond", faces: faces("EBGaramond", [[400, "n"], [500, "n"], [600, "n"], [400, "i"]]), name: "EB Garamond", category: "book", body: true, width: 0.45 },
  literata: { family: "Literata", cssVar: "--font-literata", faces: faces("Literata", [[400, "n"], [600, "n"], [400, "i"]]), name: "Literata", category: "book", body: true, width: 0.57 },
  alegreya: { family: "Alegreya", cssVar: "--font-alegreya", faces: faces("Alegreya", [[400, "n"], [700, "n"], [400, "i"]]), name: "Alegreya", category: "book", body: true, width: 0.49 },
  spectral: { family: "Spectral", cssVar: "--font-spectral", faces: faces("Spectral", [[400, "n"], [600, "n"], [400, "i"]]), name: "Spectral", category: "book", body: true, width: 0.52 },
  oldstandard: { family: "OldStandard", cssVar: "--font-oldstandard", faces: faces("OldStandard", [[400, "n"], [700, "n"], [400, "i"]]), name: "Old Standard", category: "book", body: true, width: 0.48 },
  notodisplay: { family: "NotoSerifDisplay", cssVar: "--font-notodisplay", faces: faces("NotoSerifDisplay", [[400, "n"], [600, "n"], [400, "i"]]), name: "Noto Serif Display", category: "editorial", width: 0.58 },
  prata: { family: "Prata", cssVar: "--font-prata", faces: faces("Prata", [[400, "n"]]), name: "Prata", category: "editorial", fallback: "lora", width: 0.57 },
  yeseva: { family: "YesevaOne", cssVar: "--font-yeseva", faces: faces("YesevaOne", [[400, "n"]]), name: "Yeseva One", category: "editorial", width: 0.6 },
  forum: { family: "Forum", cssVar: "--font-forum", faces: faces("Forum", [[400, "n"]]), name: "Forum", category: "editorial", fallback: "lora", width: 0.47 },
  cormorantsc: { family: "CormorantSC", cssVar: "--font-cormorantsc", faces: faces("CormorantSC", [[400, "n"], [600, "n"]]), name: "Cormorant SC", category: "editorial", width: 0.53 },
  raleway: { family: "Raleway", cssVar: "--font-raleway", faces: faces("Raleway", [[300, "n"], [400, "n"], [600, "n"], [400, "i"]]), name: "Raleway", category: "sans", body: true, width: 0.54 },
  intertight: { family: "InterTight", cssVar: "--font-intertight", faces: faces("InterTight", [[400, "n"], [600, "n"], [800, "n"]]), name: "Inter Tight", category: "sans", body: true, width: 0.52 },
  geologica: { family: "Geologica", cssVar: "--font-geologica", faces: faces("Geologica", [[400, "n"], [700, "n"], [800, "n"]]), name: "Geologica", category: "sans", body: true, width: 0.57 },
  oswald: { family: "Oswald", cssVar: "--font-oswald", faces: faces("Oswald", [[400, "n"], [600, "n"]]), name: "Oswald", category: "sans", width: 0.42 },
  montalt: { family: "MontserratAlt", cssVar: "--font-montalt", faces: faces("MontserratAlt", [[400, "n"], [600, "n"]]), name: "Montserrat Alternates", category: "sans", width: 0.62 },
  pacifico: { family: "Pacifico", cssVar: "--font-pacifico", faces: faces("Pacifico", [[400, "n"]]), name: "Pacifico", category: "script", width: 0.47 },
  lobster: { family: "Lobster", cssVar: "--font-lobster", faces: faces("Lobster", [[400, "n"]]), name: "Lobster", category: "script", width: 0.48 },
  kurale: { family: "Kurale", cssVar: "--font-kurale", faces: faces("Kurale", [[400, "n"]]), name: "Kurale", category: "decorative", body: true, width: 0.52 },
  philosopher: { family: "Philosopher", cssVar: "--font-philosopher", faces: faces("Philosopher", [[400, "n"], [700, "n"]]), name: "Philosopher", category: "decorative", body: true, width: 0.5 },
  alice: { family: "Alice", cssVar: "--font-alice", faces: faces("Alice", [[400, "n"]]), name: "Alice", category: "decorative", body: true, fallback: "lora", width: 0.54 },
  comfortaa: { family: "Comfortaa", cssVar: "--font-comfortaa", faces: faces("Comfortaa", [[400, "n"], [700, "n"]]), name: "Comfortaa", category: "kids", body: true, width: 0.62 },
  nunito: { family: "Nunito", cssVar: "--font-nunito", faces: faces("Nunito", [[400, "n"], [700, "n"], [400, "i"]]), name: "Nunito", category: "kids", body: true, width: 0.53 },
  pangolin: { family: "Pangolin", cssVar: "--font-pangolin", faces: faces("Pangolin", [[400, "n"]]), name: "Pangolin", category: "kids", width: 0.49 },
};

export const fontKeys = Object.keys(fontFaces) as FontKey[];

export function isFontKey(v: unknown): v is FontKey {
  return typeof v === "string" && Object.hasOwn(fontFaces, v);
}

/** Порядок групп в выборе шрифта. */
export const fontCategories: FontCategory[] = ["book", "editorial", "sans", "script", "decorative", "kids"];

/** CSS-стек шрифта: свой, затем запасной для недостающих знаков (как в PDF), затем общий. */
export function cssFont(key: FontKey) {
  const def = fontFaces[key];
  const generic = def.category === "sans" || def.category === "kids" ? "sans-serif" : "serif";
  return def.fallback ? `var(${def.cssVar}), var(${fontFaces[def.fallback].cssVar}), ${generic}` : key in LEGACY_STACK ? LEGACY_STACK[key]! : `var(${def.cssVar}), ${generic}`;
}

/** У прежних восьми шрифтов стек не меняется: превью уже заказанных книг выглядят как раньше. */
const LEGACY_STACK: Partial<Record<FontKey, string>> = Object.fromEntries(
  (["cormorant", "playfair", "lora", "ptserif", "montserrat", "onest", "badscript", "caveat"] as const).map((k) => [k, `var(${fontFaces[k].cssVar}), serif`]),
);

/** Начертания шрифта: какие веса есть прямым и есть ли курсив. */
export function fontWeights(key: FontKey) {
  const list = fontFaces[key].faces;
  return { weights: [...new Set(list.filter((f) => f.style === "normal").map((f) => f.weight))].sort((a, b) => a - b), italic: list.some((f) => f.style === "italic") };
}

/** Средняя ширина знака шрифта, em (для оценок без вёрстки). */
export const fontWidth = (key: FontKey) => fontFaces[key].width ?? 0.55;

/**
 * Вертикальные метрики прямого начертания, em (из файлов шрифтов: hhea ascent/descent, OS/2 высота прописных).
 * По ним буквица садится на базовую линию нужной строки — одинаково в PDF и в превью.
 */
export interface FontMetrics {
  ascent: number;
  descent: number;
  cap: number;
}

const METRICS: Record<FontKey, FontMetrics> = {
  cormorant: { ascent: 0.924, descent: 0.287, cap: 0.625 },
  playfair: { ascent: 1.082, descent: 0.251, cap: 0.708 },
  lora: { ascent: 1.006, descent: 0.274, cap: 0.7 },
  ptserif: { ascent: 1.039, descent: 0.286, cap: 0.7 },
  montserrat: { ascent: 0.968, descent: 0.251, cap: 0.7 },
  onest: { ascent: 0.97, descent: 0.305, cap: 0.707 },
  badscript: { ascent: 1.324, descent: 0.648, cap: 0.96 },
  caveat: { ascent: 0.96, descent: 0.3, cap: 0.61 },
  ebgaramond: { ascent: 1.007, descent: 0.298, cap: 0.65 },
  literata: { ascent: 1.177, descent: 0.308, cap: 0.701 },
  alegreya: { ascent: 1.016, descent: 0.345, cap: 0.637 },
  spectral: { ascent: 1.059, descent: 0.463, cap: 0.66 },
  oldstandard: { ascent: 0.762, descent: 0.238, cap: 0.712 },
  notodisplay: { ascent: 1.069, descent: 0.293, cap: 0.714 },
  prata: { ascent: 0.993, descent: 0.362, cap: 0.8 },
  yeseva: { ascent: 0.915, descent: 0.24, cap: 0.7 },
  forum: { ascent: 0.856, descent: 0.248, cap: 0.66 },
  cormorantsc: { ascent: 0.924, descent: 0.287, cap: 0.625 },
  raleway: { ascent: 0.94, descent: 0.234, cap: 0.71 },
  intertight: { ascent: 0.969, descent: 0.241, cap: 0.728 },
  geologica: { ascent: 0.975, descent: 0.275, cap: 0.7 },
  oswald: { ascent: 1.193, descent: 0.289, cap: 0.81 },
  montalt: { ascent: 0.968, descent: 0.251, cap: 0.7 },
  pacifico: { ascent: 1.303, descent: 0.453, cap: 0.84 },
  lobster: { ascent: 1.0, descent: 0.25, cap: 0.748 },
  kurale: { ascent: 1.095, descent: 0.383, cap: 0.65 },
  philosopher: { ascent: 0.9, descent: 0.22, cap: 0.66 },
  alice: { ascent: 0.909, descent: 0.234, cap: 0.631 },
  comfortaa: { ascent: 0.881, descent: 0.234, cap: 0.781 },
  nunito: { ascent: 1.011, descent: 0.353, cap: 0.705 },
  pangolin: { ascent: 0.937, descent: 0.312, cap: 0.72 },
};

export const fontMetrics = (key: FontKey): FontMetrics => METRICS[key];

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
