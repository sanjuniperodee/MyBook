/**
 * Своё оформление книги поверх выбранного стиля (дизайнер страниц): шрифты по ролям, кегли и интервалы, выключка,
 * красная строка, цвета, элементы (буквица, номера глав, разделители, рамки, колонтитулы, колонцифры, титул) и
 * отдельные главы. Хранится у книги (books.interior_style) только тем, что клиент поменял.
 *
 * applyInteriorStyle превращает стиль и настройки в обычный InteriorDesign — дальше его одинаково читают PDF для
 * типографии и HTML-превью, поэтому всё, что видно в дизайнере, уходит в печать. Пустые настройки возвращают тот
 * же объект дизайна: книги без настроек верстаются ровно как раньше.
 */
import { drawingWeight, sanitizeDrawing } from "../art";
import { isFontKey, type FontKey } from "../fonts";
import type { Drawing } from "../interior-art";
import type { PhotoCaption, PhotoFrame } from "../photo-pages";
import type {
  BodyText,
  ChapterOverride,
  DividerKind,
  DropCap,
  FrameKind,
  GlyphId,
  InteriorDesign,
  InteriorPalette,
  OpenerArt,
  QuoteStyle,
  TextAlign,
  TextFace,
  TitleLayout,
} from "./types";

/** Роль шрифта в книге. */
export type FontRole = "body" | "heading" | "display" | "label" | "numeral" | "quote" | "caption" | "initial";

export const fontRoles: FontRole[] = ["display", "heading", "body", "quote", "label", "numeral", "initial", "caption"];

export interface FontPick {
  font: FontKey;
  weight?: number;
  italic?: boolean;
}

export interface InteriorStyle {
  fonts?: Partial<Record<FontRole, FontPick>>;
  /** Основной текст: кегль (pt, для A5), интерлиньяж и всё из BodyText. */
  body?: BodyText & { size?: number; lineHeight?: number };
  /** Заголовки разделов: кегль относительно основного текста, выключка, прописные, разрядка (em), акцентный цвет, линейка. */
  heading?: { size?: number; align?: "left" | "center"; upper?: boolean; tracking?: number; accent?: boolean; bar?: boolean };
  /** Крупные надписи: кегль названия главы и названия на титуле (pt), прописные, разрядка (em), выключка и высота блока главы. */
  display?: { size?: number; titleSize?: number; upper?: boolean; tracking?: number; align?: "center" | "left"; top?: number };
  /** Служебные надписи: кегль (pt), прописные, разрядка (em). */
  label?: { size?: number; upper?: boolean; tracking?: number };
  colors?: Partial<InteriorPalette> & { paper?: string; /** Цвет начальных полос глав; null — без заливки. */ opener?: string | null };
  elements?: {
    dropCap?: "none" | "drop" | "raised";
    dropLines?: number;
    leadIn?: boolean;
    number?: InteriorDesign["opener"]["number"];
    ornament?: GlyphId;
    vignette?: boolean;
    divider?: DividerKind;
    frame?: FrameKind;
    runningHead?: InteriorDesign["runningHead"];
    folio?: InteriorDesign["folio"]["align"];
    folioDashes?: boolean;
    quote?: QuoteStyle;
    titlePage?: TitleLayout;
    /** Имя автора на титульном листе; false — титул без имени (так просят, когда имя уже на обложке или книга без автора). */
    titleAuthor?: boolean;
    /** Свой текст под названием на титульном листе вместо имени автора («Для любимой мамы»); до 80 знаков, одна строка. */
    titleLine?: string;
    photoFrame?: PhotoFrame;
    caption?: PhotoCaption;
    /** Рисунок начальных полос; null — без рисунка. */
    art?: OpenerArt | null;
    /** Свой рисунок книги от ИИ-дизайнера: на титуле и начальных полосах глав. */
    emblem?: Drawing;
  };
  /** Отдельные главы по ключу. */
  chapters?: Record<string, ChapterOverride>;
}

// ─── допустимые значения ────────────────────────────────────────────────────

export const LIMITS = {
  bodySize: [7, 16],
  lineHeight: [1.1, 2.2],
  bodyTracking: [-0.03, 0.12],
  indent: [0, 4],
  paraGap: [0, 2],
  measure: [0.7, 1],
  weight: [300, 800],
  headingSize: [0.9, 3],
  headingTracking: [0, 0.4],
  displaySize: [14, 60],
  titleSize: [16, 72],
  displayTracking: [0, 0.4],
  displayTop: [0.05, 0.6],
  labelSize: [5, 12],
  labelTracking: [0, 0.5],
  dropLines: [2, 4],
} as const;

const ALIGNS: TextAlign[] = ["justify", "left", "center", "right"];
const GLYPHS: GlyphId[] = ["diamond", "heart", "sparkle", "ram", "sprig", "fan", "dot", "bar", "shanyrak", "peak", "wave", "hedera", "scribble", "confetti"];
const ARTS: OpenerArt[] = ["stars", "oyu", "herbarium", "sunburst", "watercolor", "shanyrak", "mountains", "waves", "tape", "confetti"];
const FRAMES: FrameKind[] = ["none", "double", "deco", "corners", "airmail", "vintage"];
const DIVIDERS: DividerKind[] = ["stars", "glyph", "rule", "asterism", "space"];
const NUMBERS: InteriorDesign["opener"]["number"][] = ["label", "digits", "padded", "roman", "none"];
const QUOTES: QuoteStyle[] = ["rule", "center", "mark"];
const TITLES: TitleLayout[] = ["center", "left", "bottom", "stack"];
const PHOTO_FRAMES: PhotoFrame[] = ["none", "hairline", "double", "polaroid", "corners", "tape", "mat", "shadow"];
const CAPTIONS: PhotoCaption[] = ["italic", "hand", "label"];

export const interiorStyleOptions = { aligns: ALIGNS, glyphs: GLYPHS, arts: ARTS, frames: FRAMES, dividers: DIVIDERS, numbers: NUMBERS, quotes: QUOTES, titles: TITLES, photoFrames: PHOTO_FRAMES, captions: CAPTIONS };

/** Глав со своим оформлением — не больше, чем глав у книги может быть. */
export const MAX_STYLED_CHAPTERS = 60;

// ─── разбор и проверка ──────────────────────────────────────────────────────

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);
const round = (v: number) => Math.round(v * 1000) / 1000;
const num = (v: unknown, [lo, hi]: readonly [number, number]) => (typeof v === "number" && Number.isFinite(v) ? round(Math.min(hi, Math.max(lo, v))) : undefined);
const bool = (v: unknown) => (typeof v === "boolean" ? v : undefined);
const oneOf = <T,>(v: unknown, list: readonly T[]) => (list.includes(v as T) ? (v as T) : undefined);
const HEX = /^#[0-9a-fA-F]{6}$/;
export const isHexColor = (v: unknown): v is string => typeof v === "string" && HEX.test(v);
const color = (v: unknown) => (isHexColor(v) ? v.toUpperCase() : undefined);

/** Эмблема книги повторяется на каждой главе: тяжёлый рисунок не принимаем (в настройках — не больше EMBLEM_WEIGHT знаков). */
export const EMBLEM_WEIGHT = 30_000;
const emblemOf = (raw: unknown): Drawing | undefined => {
  const d = sanitizeDrawing(raw);
  return d && drawingWeight(d) <= EMBLEM_WEIGHT ? d : undefined;
};

/** Свой текст титульного листа: одна строка, без лишних пробелов, не длиннее TITLE_LINE_MAX; пустой — undefined. */
const titleLineOf = (v: unknown): string | undefined => {
  const t = typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, 80).trim() : "";
  return t || undefined;
};

/** Убирает ключи со значением undefined; пустой объект — undefined. */
function compact<T extends Obj>(o: T): T | undefined {
  const out = Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
  return Object.keys(out).length ? out : undefined;
}

function fontPick(raw: unknown): FontPick | undefined {
  const o = obj(raw);
  if (!o || !isFontKey(o.font)) return undefined;
  return compact({ font: o.font, weight: num(o.weight, [100, 900]), italic: bool(o.italic) }) as FontPick;
}

function dropCapOf(raw: unknown): DropCap | null | undefined {
  if (raw === null) return null;
  const o = obj(raw);
  if (!o) return undefined;
  const style = oneOf(o.style, ["drop", "raised"] as const);
  if (!style) return undefined;
  const faceRaw = obj(o.face);
  const face = faceRaw && isFontKey(faceRaw.font) ? (compact({ font: faceRaw.font, weight: num(faceRaw.weight, [100, 900]) ?? 400, italic: bool(faceRaw.italic) }) as TextFace) : undefined;
  return compact({ style, lines: num(o.lines, LIMITS.dropLines) ?? 3, face, color: oneOf(o.color, ["accent", "ink"] as const) }) as DropCap;
}

function chapterOverride(raw: unknown): ChapterOverride | undefined {
  const o = obj(raw);
  if (!o) return undefined;
  return compact({
    align: oneOf(o.align, ["center", "left"] as const),
    number: oneOf(o.number, NUMBERS),
    ornament: oneOf(o.ornament, GLYPHS),
    dropCap: dropCapOf(o.dropCap),
    leadIn: bool(o.leadIn),
    accent: color(o.accent),
    fill: o.fill === null ? null : color(o.fill),
    art: o.art === null ? null : oneOf(o.art, ARTS),
  });
}

const CHAPTER_KEY = /^[\w:-]{1,90}$/;

/** Настройки из базы или запроса: неизвестное отбрасывается, числа ограничиваются, цвета — #RRGGBB. */
export function parseInteriorStyle(raw: unknown): InteriorStyle {
  const o = obj(raw);
  if (!o) return {};
  const fontsRaw = obj(o.fonts);
  const fonts = fontsRaw ? compact(Object.fromEntries(fontRoles.map((r) => [r, fontPick(fontsRaw[r])]))) : undefined;
  const b = obj(o.body);
  const h = obj(o.heading);
  const d = obj(o.display);
  const l = obj(o.label);
  const c = obj(o.colors);
  const e = obj(o.elements);
  const ch = obj(o.chapters);
  const chapters = ch
    ? compact(
        Object.fromEntries(
          Object.entries(ch)
            .filter(([k]) => CHAPTER_KEY.test(k))
            .slice(0, MAX_STYLED_CHAPTERS)
            .map(([k, v]) => [k, chapterOverride(v)]),
        ),
      )
    : undefined;
  return (
    compact({
      fonts,
      body: b
        ? compact({
            size: num(b.size, LIMITS.bodySize),
            lineHeight: num(b.lineHeight, LIMITS.lineHeight),
            align: oneOf(b.align, ALIGNS),
            indent: num(b.indent, LIMITS.indent),
            paraGap: num(b.paraGap, LIMITS.paraGap),
            tracking: num(b.tracking, LIMITS.bodyTracking),
            weight: num(b.weight, LIMITS.weight),
            measure: num(b.measure, LIMITS.measure),
          })
        : undefined,
      heading: h
        ? compact({
            size: num(h.size, LIMITS.headingSize),
            align: oneOf(h.align, ["left", "center"] as const),
            upper: bool(h.upper),
            tracking: num(h.tracking, LIMITS.headingTracking),
            accent: bool(h.accent),
            bar: bool(h.bar),
          })
        : undefined,
      display: d
        ? compact({
            size: num(d.size, LIMITS.displaySize),
            titleSize: num(d.titleSize, LIMITS.titleSize),
            upper: bool(d.upper),
            tracking: num(d.tracking, LIMITS.displayTracking),
            align: oneOf(d.align, ["center", "left"] as const),
            top: num(d.top, LIMITS.displayTop),
          })
        : undefined,
      label: l ? compact({ size: num(l.size, LIMITS.labelSize), upper: bool(l.upper), tracking: num(l.tracking, LIMITS.labelTracking) }) : undefined,
      colors: c
        ? compact({
            ink: color(c.ink),
            muted: color(c.muted),
            accent: color(c.accent),
            rule: color(c.rule),
            ornament: color(c.ornament),
            paper: color(c.paper),
            opener: c.opener === null ? null : color(c.opener),
          })
        : undefined,
      elements: e
        ? compact({
            dropCap: oneOf(e.dropCap, ["none", "drop", "raised"] as const),
            dropLines: num(e.dropLines, LIMITS.dropLines),
            leadIn: bool(e.leadIn),
            number: oneOf(e.number, NUMBERS),
            ornament: oneOf(e.ornament, GLYPHS),
            vignette: bool(e.vignette),
            divider: oneOf(e.divider, DIVIDERS),
            frame: oneOf(e.frame, FRAMES),
            runningHead: oneOf(e.runningHead, ["none", "plain", "ruled"] as const),
            folio: oneOf(e.folio, ["center", "outer", "none"] as const),
            folioDashes: bool(e.folioDashes),
            quote: oneOf(e.quote, QUOTES),
            titlePage: oneOf(e.titlePage, TITLES),
            titleAuthor: bool(e.titleAuthor),
            titleLine: titleLineOf(e.titleLine),
            photoFrame: oneOf(e.photoFrame, PHOTO_FRAMES),
            caption: oneOf(e.caption, CAPTIONS),
            art: e.art === null ? null : oneOf(e.art, ARTS),
            emblem: emblemOf(e.emblem),
          })
        : undefined,
      chapters,
    }) ?? {}
  ) as InteriorStyle;
}

export function isEmptyStyle(style: InteriorStyle | null | undefined) {
  return !style || Object.keys(style).length === 0;
}

// ─── применение ─────────────────────────────────────────────────────────────

/** Яркость цвета #RRGGBB, 0–1 (для выбора светлого или тёмного текста на цветной полосе). */
export function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Цвета текста на цветной начальной полосе: на тёмной — светлые, на светлой — цвета книги. */
export function fillPalette(paper: string, base: InteriorPalette): InteriorPalette & { paper: string } {
  if (luminance(paper) > 0.55) return { ...base, paper };
  return { paper, ink: "#FBF7F1", muted: "#E4DCCF", accent: "#F3D9A4", rule: "#D9CFC2", ornament: "#F3D9A4" };
}

const withFace = (base: TextFace, pick?: FontPick): TextFace => (pick ? { ...base, font: pick.font, weight: pick.weight ?? base.weight, italic: pick.italic ?? false } : base);

/** Стиль книги с её настройками. Без настроек — тот же объект. */
export function applyInteriorStyle(design: InteriorDesign, raw: InteriorStyle | null | undefined): InteriorDesign {
  if (isEmptyStyle(raw)) return design;
  const s = raw!;
  const f = s.fonts ?? {};
  const el = s.elements ?? {};
  const palette: InteriorPalette = { ...design.palette, ...pickPalette(s.colors) };

  const type = {
    ...design.type,
    ...(f.body ? { body: f.body.font } : {}),
    ...(s.body?.size !== undefined ? { bodySize: s.body.size } : {}),
    ...(s.body?.lineHeight !== undefined ? { lineHeight: s.body.lineHeight } : {}),
  };
  const b = s.body ?? {};
  const textOverrides: BodyText = compact({ align: b.align, indent: b.indent, paraGap: b.paraGap, tracking: b.tracking, weight: b.weight ?? f.body?.weight, measure: b.measure }) ?? {};
  const text: BodyText | undefined = design.text || Object.keys(textOverrides).length ? { ...design.text, ...textOverrides } : undefined;

  const baseHeading: TextFace = design.heading.face ?? { font: design.type.heading, weight: design.type.headingWeight, italic: design.type.headingItalic };
  const headingFace =
    f.heading || s.heading?.upper !== undefined || s.heading?.tracking !== undefined
      ? { ...withFace(baseHeading, f.heading), ...(s.heading?.upper !== undefined ? { upper: s.heading.upper } : {}), ...(s.heading?.tracking !== undefined ? { tracking: s.heading.tracking } : {}) }
      : design.heading.face;

  const display: TextFace = {
    ...withFace(design.display, f.display),
    ...(s.display?.upper !== undefined ? { upper: s.display.upper } : {}),
    ...(s.display?.tracking !== undefined ? { tracking: s.display.tracking } : {}),
  };
  const label = {
    ...withFace(design.label, f.label),
    size: design.label.size,
    ...(s.label?.size !== undefined ? { size: s.label.size } : {}),
    ...(s.label?.upper !== undefined ? { upper: s.label.upper } : {}),
    ...(s.label?.tracking !== undefined ? { tracking: s.label.tracking } : {}),
  };

  const opener: InteriorDesign["opener"] = { ...design.opener };
  if (s.display?.size !== undefined) opener.titleSize = s.display.size;
  if (s.display?.align) opener.align = s.display.align;
  if (s.display?.top !== undefined) opener.top = s.display.top;
  if (el.number) opener.number = el.number;
  if (el.vignette !== undefined) opener.vignette = el.vignette;
  if (el.art !== undefined) opener.art = el.art ?? undefined;
  if (f.numeral) opener.numeral = { ...withFace(opener.numeral ?? design.display, f.numeral), size: opener.numeral?.size ?? 56 };
  if (s.colors?.opener !== undefined) opener.fill = s.colors.opener ? fillPalette(s.colors.opener, palette) : undefined;

  let dropCap = design.dropCap;
  if (el.dropCap === "none") dropCap = undefined;
  else if (el.dropCap) dropCap = { ...dropCap, style: el.dropCap, lines: el.dropLines ?? dropCap?.lines ?? 3 };
  else if (dropCap && el.dropLines) dropCap = { ...dropCap, lines: el.dropLines };
  if (dropCap && f.initial) dropCap = { ...dropCap, face: withFace(dropCap.face ?? design.display, f.initial) };

  const quoteFace = f.quote ? withFace(design.quote?.face ?? { font: type.body, weight: 400, italic: true }, f.quote) : design.quote?.face;
  const quote = quoteFace || el.quote || design.quote ? { ...design.quote, ...(quoteFace ? { face: quoteFace } : {}), ...(el.quote ? { style: el.quote } : {}) } : undefined;

  const photos = {
    ...design.photos,
    ...(el.photoFrame ? { frame: el.photoFrame } : {}),
    ...(el.caption ? { caption: el.caption } : {}),
    ...(f.caption ? { captionFace: withFace(design.photos.captionFace ?? { font: type.body, weight: 400, italic: true }, f.caption) } : {}),
  };

  const titlePage = el.titlePage || el.titleAuthor !== undefined || el.titleLine !== undefined || s.display?.titleSize !== undefined ? { ...design.titlePage, ...(el.titlePage ? { layout: el.titlePage } : {}), ...(s.display?.titleSize !== undefined ? { size: s.display.titleSize } : {}), ...(el.titleAuthor !== undefined ? { author: el.titleAuthor } : {}), ...(el.titleLine !== undefined ? { line: el.titleLine } : {}) } : design.titlePage;

  return {
    ...design,
    type,
    display,
    label,
    palette,
    ornament: el.ornament ?? design.ornament,
    opener,
    heading: {
      ...design.heading,
      ...(s.heading?.size !== undefined ? { size: s.heading.size } : {}),
      ...(s.heading?.align ? { align: s.heading.align } : {}),
      ...(s.heading?.accent !== undefined ? { accent: s.heading.accent } : {}),
      ...(s.heading?.bar !== undefined ? { bar: s.heading.bar } : {}),
      ...(headingFace ? { face: headingFace } : {}),
    },
    divider: el.divider ?? design.divider,
    leadIn: el.leadIn ?? design.leadIn,
    folio: { ...design.folio, ...(el.folio ? { align: el.folio } : {}), ...(el.folioDashes !== undefined ? { dashes: el.folioDashes } : {}) },
    runningHead: el.runningHead ?? design.runningHead,
    frame: el.frame ?? design.frame,
    photos,
    ...(text ? { text } : {}),
    ...(quote ? { quote } : {}),
    dropCap,
    ...(s.colors?.paper ? { paper: s.colors.paper } : {}),
    ...(titlePage ? { titlePage } : {}),
    ...(el.emblem ? { emblem: el.emblem } : {}),
    ...(s.chapters ? { chapters: { ...design.chapters, ...s.chapters } } : {}),
  };
}

function pickPalette(c: InteriorStyle["colors"]): Partial<InteriorPalette> {
  if (!c) return {};
  const out: Partial<InteriorPalette> = {};
  for (const k of ["ink", "muted", "accent", "rule", "ornament"] as const) if (c[k]) out[k] = c[k];
  return out;
}

/** Оформление конкретной главы: общий стиль книги и своё оформление главы, если оно есть. */
export function chapterDesign(design: InteriorDesign, chapterKey: string | undefined): InteriorDesign {
  const o = chapterKey ? design.chapters?.[chapterKey] : undefined;
  if (!o) return design;
  const palette = o.accent ? { ...design.palette, accent: o.accent } : design.palette;
  const opener: InteriorDesign["opener"] = { ...design.opener };
  if (o.align) opener.align = o.align;
  if (o.number) opener.number = o.number;
  if (o.art !== undefined) opener.art = o.art ?? undefined;
  if (o.fill !== undefined) opener.fill = o.fill ? fillPalette(o.fill, palette) : undefined;
  else if (opener.fill && o.accent) opener.fill = { ...opener.fill, accent: o.accent };
  return {
    ...design,
    palette,
    opener,
    ornament: o.ornament ?? design.ornament,
    leadIn: o.leadIn ?? design.leadIn,
    dropCap: o.dropCap === null ? undefined : (o.dropCap ?? design.dropCap),
  };
}
