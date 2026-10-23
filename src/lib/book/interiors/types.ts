/** Типы оформлений блока: шрифты, палитра, начальные полосы, заголовки, колонтитулы, фото. */
import type { FontKey, Typography } from "../fonts";
import type { Drawing } from "../interior-art";
import type { PhotoCaption, PhotoFrame } from "../photo-pages";

export type InteriorId =
  | "classic"
  | "modern"
  | "minimal"
  | "romance"
  | "stars"
  | "oyu"
  | "herbarium"
  | "deco"
  | "editorial"
  | "airmail"
  | "watercolor"
  | "shanyrak"
  | "mountains"
  | "sea"
  | "vintage"
  | "album"
  | "confetti"
  | "photobook"
  | "memories"
  | "gallery"
  | "arches"
  | "cinema"
  | "luna"
  // Библиотека стилей дизайнера: двенадцать направлений со своей системой шрифтов, интервалов и композиции.
  | "novel"
  | "journal"
  | "airy"
  | "luxe"
  | "amour"
  | "scrapbook"
  | "lens"
  | "magazine"
  | "artbook"
  | "antique"
  | "contemporary"
  | "kids";

export type InteriorMood = "classic" | "romance" | "tender" | "bright" | "modern";

export const interiorMoods: InteriorMood[] = ["classic", "romance", "tender", "bright", "modern"];

/** Глиф виньетки: между двумя линейками на титуле, в начале глав и в конце книги. */
export type GlyphId = "diamond" | "heart" | "sparkle" | "ram" | "sprig" | "fan" | "dot" | "bar" | "shanyrak" | "peak" | "wave" | "hedera" | "scribble" | "confetti";

/** Рисунок на начальной полосе главы. */
export type OpenerArt = "stars" | "oyu" | "herbarium" | "sunburst" | "watercolor" | "shanyrak" | "mountains" | "waves" | "tape" | "confetti";

/** Рамка «парадных» полос: титул, посвящение, начала глав, финал. */
export type FrameKind = "none" | "double" | "deco" | "corners" | "airmail" | "vintage";

/**
 * Направление стиля — раздел библиотеки стилей (у прежних дизайнов — по их характеру). Фильтр в каталоге оформлений.
 */
export type StyleDirection = "literature" | "editorial" | "minimal" | "luxury" | "romantic" | "scrapbook" | "photo" | "magazine" | "art" | "vintage" | "contemporary" | "kids";

export const styleDirections: StyleDirection[] = ["literature", "editorial", "minimal", "luxury", "romantic", "scrapbook", "photo", "magazine", "art", "vintage", "contemporary", "kids"];

/** Выключка основного текста. */
export type TextAlign = "justify" | "left" | "center" | "right";

/** Основной текст сверх шрифта, кегля и интерлиньяжа: выключка, красная строка, отбивки, разрядка, ширина колонки. */
export interface BodyText {
  /** По умолчанию — по ширине. */
  align?: TextAlign;
  /** Красная строка, em; 0 или нет — без отступа. Первый абзац после заголовка и в начале главы — без отступа, как в книгах. */
  indent?: number;
  /** Отбивка после абзаца, em (по умолчанию ANSWER.para.after). */
  paraGap?: number;
  /** Разрядка, em. */
  tracking?: number;
  /** Насыщенность основного текста (по умолчанию 400). */
  weight?: number;
  /** Ширина колонки текста — доля полосы набора (0.7–1): узкая колонка с воздухом по бокам; фото — во всю полосу. */
  measure?: number;
}

/** Буквица в начале главы: опущенная на несколько строк или поднятая (крупная первая буква в строке). */
export interface DropCap {
  style: "drop" | "raised";
  /** На сколько строк опущена буквица (2–4). */
  lines: number;
  /** Начертание буквицы; нет — шрифт крупных надписей (display). */
  face?: TextFace;
  /** Цвет: акцент (по умолчанию) или цвет текста. */
  color?: "accent" | "ink";
}

/** Выделенная цитата: линейка слева, по центру или с крупной кавычкой. */
export type QuoteStyle = "rule" | "center" | "mark";

/** Композиция титула: по центру, влево, название внизу полосы, крупный набор сверху. */
export type TitleLayout = "center" | "left" | "bottom" | "stack";

/** Разделитель между ответами без заголовка. */
export type DividerKind = "stars" | "glyph" | "rule" | "asterism" | "space";

/**
 * Своё оформление начальной полосы главы поверх общего: другой номер, выключка, глиф, буквица, акцент, цветная полоса,
 * рисунок. Остальные главы книги остаются как были.
 */
export interface ChapterOverride {
  align?: "center" | "left";
  number?: InteriorDesign["opener"]["number"];
  ornament?: GlyphId;
  dropCap?: DropCap | null;
  leadIn?: boolean;
  /** Цвет акцента главы (номер, капитель, буквица). */
  accent?: string;
  /** Цвет начальной полосы главы под обрез; null — без заливки. */
  fill?: string | null;
  /** Рисунок на начальной полосе; null — без рисунка. */
  art?: OpenerArt | null;
}

export interface TextFace {
  font: FontKey;
  weight: number;
  italic?: boolean;
  /** Прописными с разрядкой (трекинг — в долях кегля). */
  upper?: boolean;
  tracking?: number;
}

export interface InteriorPalette {
  /** Основной текст и заголовки. */
  ink: string;
  /** Эпиграфы, подписи, колонтитулы и колонцифры. */
  muted: string;
  /** Номер главы, начальные слова главы, акцентные линейки. */
  accent: string;
  /** Тонкие линии: линейки виньеток, отточия в оглавлении, «* * *». */
  rule: string;
  /** Глифы виньеток, рамки и рисунки. */
  ornament: string;
}

export interface InteriorDesign {
  id: InteriorId;
  mood: InteriorMood;
  /** Основной текст и заголовки вопросов (кегль — для A5, на крупных форматах масштабируется). */
  type: Typography;
  /** Крупные надписи: название на титуле, названия глав, «Содержание». */
  display: TextFace;
  /** Служебные надписи прописными: «Глава 1», имя автора, колонтитулы. Кегль — pt. */
  label: TextFace & { size: number };
  palette: InteriorPalette;
  ornament: GlyphId;
  opener: {
    align: "center" | "left";
    /** Номер главы: подписью «Глава 1», цифрой «1», с нулём «01», римской «I» или без номера. */
    number: "label" | "digits" | "padded" | "roman" | "none";
    /** Начертание и кегль цифры (для number ≠ "label"). По умолчанию — как у названий. */
    numeral?: TextFace & { size: number };
    /** Подпись «Глава 1» другим начертанием (например, рукописным). */
    kicker?: TextFace & { size: number };
    /** Кегль названия главы, pt. */
    titleSize: number;
    /** Где начинается блок с названием: доля высоты полосы набора. */
    top: number;
    art?: OpenerArt;
    /** Цветная начальная полоса: фон под обрез и цвета текста на нём. */
    fill?: InteriorPalette & { paper: string };
    /**
     * Глава открывается снимком из этой главы: bleed — во всю ширину сверху, под обрез; polaroid — карточка
     * на скотче; full — во всю полосу, название светлым по затемнению; arch — в арочном окне; circle — в круге;
     * framed — в белом паспарту с тенью. Глава без фото открывается обычной полосой.
     */
    photo?: "bleed" | "polaroid" | "full" | "arch" | "circle" | "framed";
    /** Виньетка под названием главы (по умолчанию есть). */
    vignette?: boolean;
  };
  heading: {
    align: "left" | "center";
    /** Кегль относительно основного текста. */
    size: number;
    /** Цвет акцента вместо основного. */
    accent?: boolean;
    /** Короткая акцентная линейка над заголовком. */
    bar?: boolean;
    /** Своё начертание заголовков (шрифт, насыщенность, курсив, прописные, разрядка); нет — type.heading. */
    face?: TextFace;
  };
  /** Между ответами без заголовка: «* * *», глиф виньетки, короткая линейка, астеризм «⁂» или просто отбивка. */
  divider: DividerKind;
  /** Первые слова главы — капителью (как в романах). */
  leadIn: boolean;
  /** Колонцифра: по центру, у внешнего края или без неё. */
  folio: { align: "center" | "outer" | "none"; dashes?: boolean; font?: "body" | "label" };
  /** Колонтитул: на левой полосе — название книги, на правой — глава. */
  runningHead: "none" | "plain" | "ruled";
  frame: FrameKind;
  /** Фотостраницы: рамка снимков, подпись, цвет скотча (для рамки «скотч») и тон бумаги (по умолчанию белая). */
  photos: { frame: PhotoFrame; caption: PhotoCaption; tape?: string; paper?: string; /** Своё начертание подписей вместо caption. */ captionFace?: TextFace };
  /** Обложки, с которыми дизайн составляет пару, — подсказка в выборе. */
  pairsWith: string[];

  // ─── Дизайнер: всё ниже необязательно, без этих полей вёрстка прежняя ───────────────

  /** Раздел библиотеки стилей. */
  direction?: StyleDirection;
  /** Основной текст: выключка, красная строка, отбивки, разрядка, ширина колонки. */
  text?: BodyText;
  /** Цитаты, лид, эпиграфы, посвящение и подзаголовок: начертание (по умолчанию курсив основного шрифта) и вид цитаты. */
  quote?: { face?: TextFace; style?: QuoteStyle };
  /** Буквица в начале главы. */
  dropCap?: DropCap;
  /** Тон бумаги всех полос (по умолчанию белая). */
  paper?: string;
  /** Титул: композиция и кегль названия, pt (по умолчанию 30). */
  titlePage?: { layout?: TitleLayout; size?: number };
  /** Свой рисунок книги (нарисовал ИИ-дизайнер): на титуле и над названием главы; цвета — роли main и accent. */
  emblem?: Drawing;
  /** Своё оформление отдельных глав по ключу главы. */
  chapters?: Record<string, ChapterOverride>;
}
