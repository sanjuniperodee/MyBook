/**
 * Спецификация набора блока — кегли, интерлиньяж, отбивки и отступы данными, в одном месте.
 * PDF (modules/production/infrastructure/pdf/interior/) и HTML-страницы (components/interior/)
 * только переводят эти числа в единицы своей среды: react-pdf — пункты, HTML — PageUnits (px или cqw).
 *
 * Единицы — в описании каждой группы: pt (кегли и отступы даны для A5, «× scale» — умножаются на масштаб
 * формата из interiorMetrics), em — доля кегля основного текста, «доля полосы» — доля ширины полосы набора,
 * мм — от обреза.
 */
import type { BookFormat } from "./formats";
import type { InteriorDesign, TextFace } from "./interiors";
import { interiorMetrics } from "./page-geometry";

// ─── кегли и отбивки оформления ─────────────────────────────────────────────

/** Кегли и отбивки в pt для конкретного формата — общие для PDF и HTML-превью. */
export interface InteriorSizes {
  body: number;
  heading: number;
  label: number;
  /** Отбивка после подписи «Глава N». */
  kickerGap: number;
  openerTitle: number;
  numeral: number;
  kicker: number;
  epigraph: number;
  /** Отбивка виньетки сверху и снизу. */
  vignetteGap: number;
  title: number;
  subtitle: number;
  dedication: number;
  tocTitle: number;
  end: number;
  caption: number;
  folio: number;
  colophon: number;
  year: number;
  runningHead: number;
  /** Отбивки в тексте: после заголовка, перед заголовком и перед ответом без заголовка. */
  afterHeading: number;
  beforeHeading: number;
  beforeHeadless: number;
}

export function interiorSizes(design: InteriorDesign, scale: number): InteriorSizes {
  const body = design.type.bodySize * scale;
  const { opener } = design;
  return {
    body,
    heading: body * design.heading.size,
    label: design.label.size * scale,
    kickerGap: 14 * scale,
    openerTitle: opener.titleSize * scale,
    numeral: (opener.numeral?.size ?? 56) * scale,
    kicker: (opener.kicker?.size ?? design.label.size) * scale,
    epigraph: 10 * scale,
    vignetteGap: 14 * scale,
    title: 30 * scale,
    subtitle: 12 * scale,
    dedication: 13 * scale,
    tocTitle: 22 * scale,
    end: 14 * scale,
    caption: 9 * scale,
    folio: 8 * scale,
    colophon: 7.5 * scale,
    year: 7 * scale,
    runningHead: Math.min(design.label.size, 6.6) * scale,
    afterHeading: 8 * scale,
    beforeHeading: 20 * scale,
    beforeHeadless: 10 * scale,
  };
}

/** Длина линеек виньетки, pt: на титуле, в начале главы и в конце книги. */
export const VIGNETTE_RULE = { title: 34, opener: 26, end: 20 } as const;

/** Где по высоте полосы набора начинается блок на парадных полосах. */
export const DISPLAY_TOP = { title: 0.32, dedication: 0.34, end: 0.36 } as const;

/** CSS-трекинг и регистр начертания (для HTML); в PDF те же значения в pt. */
export function trackingPt(face: Pick<TextFace, "tracking">, size: number) {
  return (face.tracking ?? 0) * size;
}

// ─── текст главы ────────────────────────────────────────────────────────────

/**
 * Блоки набора ответа (answer-blocks.ts): кегль, отбивки и отступы — em; линейка цитаты — pt;
 * поля цитаты по центру и отступ стихов — доля полосы.
 */
export const ANSWER = {
  /** Абзац: отбивка после. */
  para: { after: 0.45 },
  /** Лид — курсивом крупнее. */
  lede: { size: 1.08, lineHeight: 1.4, after: 0.7 },
  /** Выделенный короткий ответ: слева — линейка rule и отступ от неё indent, по центру — поля inset. */
  quote: { size: 1.32, lineHeight: 1.42, before: 0.15, after: 0.6, rule: 1.6, indent: 1.1, inset: 0.08 },
  /** Список: отбивка после, между пунктами и ширина колонки маркера (у нумерованного шире). */
  list: { after: 0.45, gap: 0.3, marker: 1.2, orderedMarker: 1.6 },
  /** Стихи: отбивки и отступ слева (по центру — без отступа). */
  verse: { before: 0.2, after: 0.65, indent: 0.08 },
} as const;

/** Капитель — начальные слова главы: кегль и разрядка, em. */
export const LEAD_IN = { size: 0.86, tracking: 0.07 } as const;

/**
 * Начальные слова главы для капители: до трёх слов, но не длиннее ~22 знаков и не дальше
 * первого знака препинания. Возвращает [капитель, остаток абзаца].
 */
export function splitLeadIn(paragraph: string): [string, string] {
  const words = paragraph.match(/\S+\s*/g) ?? [];
  const lead: string[] = [];
  for (const w of words) {
    if (lead.length && (lead.length >= 3 || (lead.join("") + w).trim().length > 22)) break;
    lead.push(w);
    if (/[,.;:!?…—)»]$/.test(w.trim())) break;
  }
  // Капитель не обрывается на предлоге или союзе: «МЫ ВСТРЕТИЛИСЬ в самый…», а не «МЫ ВСТРЕТИЛИСЬ В самый…».
  while (lead.length > 1 && lead[lead.length - 1].trim().replace(/[^\p{L}]/gu, "").length <= 2) lead.pop();
  const head = lead.join("").trimEnd();
  return [head, paragraph.slice(head.length)];
}

/** Заголовок вопроса: интерлиньяж и акцентная линейка над ним — длина и отбивка после pt × scale, толщина pt. */
export const HEADING = { lineHeight: 1.22, bar: { width: 14, thickness: 1.2, after: 6 } } as const;

/**
 * Сколько места, pt, нужно за заголовком и разделителем, чтобы они не остались последними на полосе
 * (react-pdf minPresenceAhead; в HTML то же правило — break-after: avoid).
 */
export const KEEP_WITH_NEXT = 40;

/** Разделитель-рисунок между ответами без заголовка: отбивка сверху и добавка к отбивке снизу (beforeHeadless), em. */
export const DIVIDER = { before: 0.3, after: 0.2 } as const;

/**
 * Ряд фото внутри ответа (inline-photo.ts): отбивки ряда — em; толщина рамки полароида и «линии» — pt;
 * подпись под фото — отбивка, pt; подпись в поле полароида — от низа карточки, доля нижнего поля.
 */
export const INLINE_ROW = { before: 0.5, after: 1, polaroidBorder: 0.5, lineBorder: 1, captionGap: 6, polaroidCaption: 0.22 } as const;

/**
 * Карточка видео или музыки в ответе (answer-media.ts): QR-код слева, справа — вид («Видео · YouTube»), подпись
 * и подсказка «наведите камеру». Сторона кода (≈ 21 мм — уверенно читается с бумаги), поля, промежуток и скругление —
 * pt × scale, рамка — pt; отбивки карточки — em; подпись — доля кегля основного текста, не длиннее двух строк;
 * значок вида — доля кегля служебной надписи; отбивки внутри колонки текста — pt × scale.
 */
export const MEDIA_CARD = {
  qr: 60,
  pad: 7,
  gap: 11,
  radius: 5,
  border: 0.5,
  before: 0.5,
  after: 1,
  title: { size: 1.06, lineHeight: 1.25, maxLines: 2 },
  icon: 1.15,
  labelGap: 4,
  noteGap: 3.5,
} as const;

/** Концовка главы: отбивка перед виньеткой — доля отбивки перед заголовком. */
export const CHAPTER_TAIL = { before: 1.1 } as const;

// ─── подписи к снимкам на фотостранице ──────────────────────────────────────

/** Начертание подписи; label — служебной надписью оформления (разрядка — от её базового кегля, как у колонтитула). */
export interface PhotoCaptionFace {
  face: TextFace;
  label: boolean;
  lineHeight: number;
  color: string;
}

/**
 * Подпись по design.photos.caption: от руки — Caveat цветом текста, прописными — служебной надписью,
 * курсивом — основным шрифтом. Интерлиньяж — и в вёрстке, и в оценке высоты подписи (photo-pages.ts).
 */
export function photoCaptionFace(design: InteriorDesign): PhotoCaptionFace {
  const P = design.palette;
  if (design.photos.caption === "hand") return { face: { font: "caveat", weight: 500 }, label: false, lineHeight: 1.15, color: P.ink };
  if (design.photos.caption === "label") return { face: design.label, label: true, lineHeight: 1.3, color: P.muted };
  return { face: { font: design.type.body, weight: 400, italic: true }, label: false, lineHeight: 1.3, color: P.muted };
}

/** Кегль подписи на фотостранице, pt. */
export function photoCaptionSize(design: InteriorDesign, S: InteriorSizes) {
  return design.photos.caption === "hand" ? S.caption * 1.5 : design.photos.caption === "label" ? S.caption * 0.8 : S.caption;
}

// ─── колонтитул и колонцифра ────────────────────────────────────────────────

/** Колонтитул: строка и линейка — на доле верхнего поля от обреза; толщина линейки, pt. */
export const RUNNING_HEAD = { top: 0.36, ruleTop: 0.62, rule: 0.4 } as const;

/** Колонцифра: на drop мм ниже середины нижнего поля; кегль, когда она набрана служебной надписью, — доля кегля колонцифры. */
export const FOLIO = { drop: 2, labelSize: 0.85 } as const;

/** Верх строки колонтитула от верхнего обреза, мм. */
export function runningHeadTop(format: BookFormat) {
  return interiorMetrics[format.id].marginTop * RUNNING_HEAD.top;
}

/** Верх линейки колонтитула от верхнего обреза, мм. */
export function runningRuleTop(format: BookFormat) {
  return interiorMetrics[format.id].marginTop * RUNNING_HEAD.ruleTop;
}

/** Низ строки колонцифры от нижнего обреза, мм. */
export function folioBottom(format: BookFormat) {
  return interiorMetrics[format.id].marginBottom / 2 - FOLIO.drop;
}

// ─── парадные полосы ────────────────────────────────────────────────────────

/**
 * Начальная полоса главы: цифра номера (интерлиньяж; отбивка — доля её кегля), название и эпиграф
 * (интерлиньяж, наибольшая ширина), рамка карточки снимка, pt. В HTML снимок в карточке отсчитывается
 * от внутреннего края рамки — сдвиг cardInsetHtml, мм (≈ толщина рамки).
 */
export const OPENER = {
  numeral: { lineHeight: 1, after: 0.12 },
  title: { lineHeight: 1.15, maxWidth: "90%" },
  epigraph: { lineHeight: 1.55, maxWidth: { left: "85%", center: "78%" } },
  cardBorder: 0.4,
  cardInsetHtml: 0.14,
} as const;

/** Титул, оборот титула, посвящение и финал: интерлиньяж, наибольшая ширина и отбивки (pt). */
export const FRONT = {
  title: { lineHeight: 1.15 },
  subtitle: { before: 10 },
  colophon: { lineHeight: 1.6 },
  dedication: { lineHeight: 1.6, maxWidth: "85%" },
  endYear: { before: 16 },
} as const;

/** Оглавление: отбивки заголовка и строк — pt × scale; отточие — толщина и поля, pt; наибольшая ширина названия главы. */
export const TOC = {
  title: { before: 20, after: 26 },
  entry: { after: 7, maxWidth: "82%" },
  leader: { width: 0.6, side: 5, bottom: 3 },
} as const;

/**
 * Интерлиньяж строк, которым в PDF он не задан (react-pdf берёт естественный интерлиньяж шрифта):
 * HTML-страницы приближают его этими числами. Расхождение сохранено как есть.
 */
export const HTML_LINE_HEIGHT = {
  label: 1.2,
  folio: 1.2,
  kicker: 1.2,
  stars: 1.2,
  tocTitle: 1.2,
  tocEntry: 1.25,
  subtitle: 1.3,
  end: 1.3,
  caption: 1.3,
  polaroidCaption: 1.1,
} as const;
