/**
 * Оценка объёма книги: сколько полос займёт содержимое, не собирая PDF. Модуль общий для сервера и браузера.
 *
 * Высоты считаются по тем же числам, по которым верстает PDF: кегли, интерлиньяж и отбивки — typesetting.ts,
 * блоки набора ответа — answer-blocks.ts, ряды фото — inline-photo.ts. От PDF оценку отличают две вещи: знаков
 * в строке — по средней ширине знака, а не по метрикам шрифта, и запас на полосе вместо переноса по строкам.
 */
import { answerBlocks, type AnswerBlock } from "./answer-blocks";
import { mediaCardBox, normalizeMedia, type AnswerMedia } from "./answer-media";
import { MM_TO_PT, type BookFormat } from "./formats";
import { framedBox, layoutInline, normalizeStyle, splitParagraphs, type InlinePhotoStyle } from "./inline-photo";
import { dividerDrawing } from "./interior-art";
import type { InteriorDesign } from "./interiors";
import { chapterRuns, photoPages, type BookContent, type ContentChapter, type ContentItem, type PhotoItem } from "./layout";
import { interiorMetrics, textArea } from "./page-geometry";
import { hasToc, bookToc } from "./toc";
import { ANSWER, DIVIDER, HEADING, HTML_LINE_HEIGHT, INLINE_ROW, interiorSizes, MEDIA_CARD, TOC, type InteriorSizes } from "./typesetting";

/** Средняя ширина знака основного текста, em: по ней считаем, сколько знаков помещается в строке. */
const AVG_CHAR_EM = 0.5;

/**
 * Запас на каждой полосе текста, pt (чуть больше строки): ряд фото и заголовок с абзацем не делятся между полосами,
 * и остаток внизу пропадает. Любой запас от 10 до 30 pt даёт тот же объём у всех 96 книг набора tests/fixtures.
 */
const PAGE_RESERVE = 18;

/** Размеры набора для оценки, pt: кегли и отбивки оформления, строка основного текста и полоса набора. */
export interface TextMetrics {
  design: InteriorDesign;
  sizes: InteriorSizes;
  /** Масштаб формата относительно A5. */
  scale: number;
  line: number;
  width: number;
  height: number;
}

export function textMetrics(format: BookFormat, design: InteriorDesign): TextMetrics {
  const scale = interiorMetrics[format.id].scale;
  const sizes = interiorSizes(design, scale);
  const area = textArea(format);
  return { design, sizes, scale, line: sizes.body * design.type.lineHeight, width: area.w * MM_TO_PT, height: area.h * MM_TO_PT };
}

/** Строк, которые займёт текст в колонке шириной width, набранный кеглем size. */
function lines(chars: number, width: number, size: number) {
  return Math.max(1, Math.ceil(chars / Math.max(1, Math.floor(width / (size * AVG_CHAR_EM)))));
}

/** Высота блока набора ответа вместе с отбивкой после него, pt (ANSWER — как в PDF). */
function blockHeight(b: AnswerBlock, m: TextMetrics): number {
  const { sizes: S, design, line, width } = m;
  const centered = design.heading.align === "center";
  switch (b.kind) {
    case "para":
      return lines(b.text.length, width, S.body) * line + S.body * ANSWER.para.after;
    case "lede": {
      const size = S.body * ANSWER.lede.size;
      return lines(b.text.length, width, size) * size * ANSWER.lede.lineHeight + S.body * ANSWER.lede.after;
    }
    case "quote": {
      const q = ANSWER.quote;
      const size = S.body * q.size;
      const w = centered ? width * (1 - 2 * q.inset) : width - S.body * q.indent - q.rule;
      return b.lines.reduce((n, l) => n + lines(l.length, w, size), 0) * size * q.lineHeight + S.body * (q.before + q.after);
    }
    case "list": {
      const w = width - S.body * (b.ordered ? ANSWER.list.orderedMarker : ANSWER.list.marker);
      const n = b.items.reduce((sum, it) => sum + lines(it.text.length, w, S.body), 0);
      return n * line + (b.items.length - 1) * S.body * ANSWER.list.gap + S.body * ANSWER.list.after;
    }
    case "verse": {
      const w = centered ? width : width * (1 - ANSWER.verse.indent);
      return b.lines.reduce((n, l) => n + lines(l.length, w, S.body), 0) * line + S.body * (ANSWER.verse.before + ANSWER.verse.after);
    }
  }
}

/**
 * Высота начала ответа, pt: отбивка сверху, заголовок с акцентной линейкой и отбивкой под ним — или разделитель,
 * если заголовка нет. У первого ответа главы нет ни отбивки, ни разделителя: он стоит в верху полосы.
 */
function headingHeight(heading: string | null, first: boolean, m: TextMetrics): number {
  const { sizes: S, design, scale } = m;
  // Пустой заголовок (из одних эмодзи, письмо без подписи) PDF не печатает и ставит разделитель — как без заголовка.
  if (!heading) {
    if (first) return 0;
    // «* * *» — строка основного кегля с естественным интерлиньяжем; глиф или линейка — рисунок со своими отбивками.
    const divider =
      design.divider === "stars" ? S.body * HTML_LINE_HEIGHT.stars : S.body * DIVIDER.before + dividerDrawing(design.ornament, design.divider, design.palette).h + S.body * DIVIDER.after;
    return S.beforeHeadless + divider + S.beforeHeadless;
  }
  const bar = design.heading.bar ? HEADING.bar.thickness + HEADING.bar.after * scale : 0;
  return (first ? 0 : S.beforeHeading) + bar + lines(heading.length, m.width, S.heading) * S.heading * HEADING.lineHeight + S.afterHeading;
}

type RowPhoto = Pick<PhotoItem, "width" | "height" | "inline"> & Partial<Pick<PhotoItem, "caption">>;

/** Высота ряда фото, pt: отбивки ряда, самая высокая рамка и подпись под фото (у поляроида подпись внутри карточки). */
function rowHeight(row: { p: RowPhoto; style: InlinePhotoStyle }[], m: TextMetrics): number {
  const S = m.sizes;
  const heights = row.map(({ p, style }) => {
    const box = framedBox(p, style, m.width, m.height, row.length);
    const caption = style.frame !== "polaroid" && p.caption ? INLINE_ROW.captionGap + lines(p.caption.length, box.outerW, S.caption) * S.caption * HTML_LINE_HEIGHT.caption : 0;
    return box.outerH + caption;
  });
  return S.body * (INLINE_ROW.before + INLINE_ROW.after) + Math.max(...heights);
}

/** Высота карточки видео или музыки с отбивками, pt: она не зависит от подписи (та не длиннее двух строк). */
export function mediaCardHeight(m: TextMetrics) {
  return mediaCardBox(m.width, m.scale).height + m.sizes.body * (MEDIA_CARD.before + MEDIA_CARD.after);
}

/** Высота ответа в вёрстке главы, pt: начало, блоки текста, ряды фото и карточки QR-кодов. first — первый ответ главы. */
function entryHeight(heading: string | null, answer: string, photos: RowPhoto[], media: readonly Partial<AnswerMedia>[], first: boolean, m: TextMetrics): number {
  const paragraphs = splitParagraphs(answer);
  const rows = [...layoutInline(photos.map((p) => ({ p, style: normalizeStyle(p.inline) })), paragraphs.length).values()].flat();
  const text = answerBlocks(paragraphs).reduce((sum, b) => sum + blockHeight(b, m), 0);
  const cards = normalizeMedia(media).length * mediaCardHeight(m);
  return headingHeight(heading, first, m) + text + rows.reduce((sum, row) => sum + rowHeight(row, m), 0) + cards;
}

/**
 * Высота куска текста главы с разрывами «с новой страницы», pt: перед такой историей занятое добивается до конца
 * полосы. starts — где начинается каждая история (pt от начала куска).
 */
function runHeight(items: readonly ContentItem[], m: TextMetrics) {
  const page = m.height - PAGE_RESERVE;
  let used = 0;
  const starts = items.map((it, i) => {
    const breaks = i > 0 && !!it.pageBreak;
    if (breaks) used = Math.ceil(used / page) * page;
    const at = used;
    used += entryHeight(it.heading, it.answer, it.photos ?? [], it.media ?? [], i === 0 || breaks || !!it.continued, m);
    return at;
  });
  return { height: used, starts, pages: items.length ? Math.max(1, Math.ceil(used / page)) : 0 };
}

/**
 * Полос в главе: начальная, текст (всё, что на полосе не помещается, переходит на следующую) и фотостраницы.
 * Текст — кусками между фото на всю страницу из историй (chapterRuns), каждое такое фото — своя полоса.
 */
export function estimateChapterPages(ch: Pick<ContentChapter, "items" | "photos">, m: TextMetrics): number {
  const runs = chapterRuns(ch.items);
  const text = runs.reduce((sum, r) => sum + runHeight(r.items, m).pages + (r.photo ? 1 : 0), 0);
  return 1 /* начальная полоса */ + text + photoPages(ch.photos).length;
}

/**
 * Полос оглавления. По главам без своих строк — по 18 строк на полосу (так оценка сходится с PDF у всех книг набора).
 * Иначе — по высоте строк: длинное название переносится, строка не делится между полосами (как в PDF).
 */
export function estimateTocPages(content: BookContent, m: TextMetrics): number {
  if (!hasToc(content)) return 0;
  if (!content.tocMode && !content.tocLines) return Math.ceil(content.chapters.length / 18);
  const parts = tocParts(content, m);
  return (parts.at(-1) ?? 0) + 1;
}

/** На какой полосе оглавления (с 0) стоит каждая его строка — по порядку bookToc. */
export function tocParts(content: BookContent, m: TextMetrics): number[] {
  const { sizes: S, scale, width, height } = m;
  const title = S.tocTitle * HTML_LINE_HEIGHT.tocTitle + (TOC.title.before + TOC.title.after) * scale;
  // Название — не шире TOC.entry.maxWidth (82%); справа отточие и номер страницы.
  const labelWidth = width * 0.82;
  let part = 0;
  let used = title;
  return bookToc(content).map((line) => {
    const chars = line.label.length + (line.number ? String(line.number).length + 2 : 0);
    const h = lines(chars, labelWidth - (line.level ? TOC.entry.indent * scale : 0), S.body) * S.body * HTML_LINE_HEIGHT.tocEntry + TOC.entry.after * scale;
    if (used + h > height) {
      part += 1;
      used = 0;
    }
    used += h;
    return part;
  });
}

/**
 * С какой полосы главы (от начальной, 0) начинается каждый её ответ — для номеров страниц разделов в превью,
 * где книгу не верстают: по той же высоте ответов, что и объём главы.
 */
export function sectionPageOffsets(ch: Pick<ContentChapter, "items">, m: TextMetrics): number[] {
  const page = m.height - PAGE_RESERVE;
  const offsets = new Map<ContentItem, number>();
  let base = 1; // начальная полоса главы
  for (const run of chapterRuns(ch.items)) {
    const r = runHeight(run.items, m);
    run.items.forEach((it, i) => offsets.set(it, base + Math.floor(r.starts[i] / page)));
    base += r.pages + (run.photo ? 1 : 0);
  }
  // Пустые части (только фото перед собой) — на полосе следующей непустой.
  let next = base;
  return [...ch.items].reverse().map((it) => (next = offsets.get(it) ?? next)).reverse();
}

/** Доля текста главы (0…1), после которой начинается каждый ответ: 3D-книга переводит её в полосу по своему замеру. */
export function sectionShares(ch: Pick<ContentChapter, "items">, m: TextMetrics): number[] {
  const { starts, total } = sectionStarts(ch, m);
  return starts.map((used) => (total ? used / total : 0));
}

/** Высота текста главы до каждого ответа и всего, pt. */
function sectionStarts(ch: Pick<ContentChapter, "items">, m: TextMetrics) {
  let total = 0;
  const starts = ch.items.map((it, i) => {
    const before = total;
    total += entryHeight(it.heading, it.answer, it.photos ?? [], it.media ?? [], i === 0, m);
    return before;
  });
  return { starts, total };
}

/** Оценка количества страниц в готовой книге (до добивки до кратности). */
export function estimatePages(content: BookContent): number {
  const m = textMetrics(content.format, content.interior);
  let pages = 2; // титульный лист + оборот
  if (content.dedication) pages += 1;
  pages += estimateTocPages(content, m);
  for (const ch of content.chapters) pages += estimateChapterPages(ch, m);
  if (content.galleryPhotos.length) pages += 1 + photoPages(content.galleryPhotos).length;
  pages += 1; // финальная страница
  return pages;
}

/** Оценка для одного ответа: сколько страниц он займёт посреди главы (для индикатора в редакторе). */
export function estimateAnswerPages(heading: string | null, answer: string, photos: RowPhoto[], m: TextMetrics, media: readonly Partial<AnswerMedia>[] = []) {
  return entryHeight(heading, answer, photos, media, false, m) / m.height;
}
