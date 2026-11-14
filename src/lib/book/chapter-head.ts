import type { InteriorDesign } from "./interiors";
import { OPENER, type InteriorSizes } from "./typesetting";

/**
 * Как начинается глава (books.chapter_start): page — своя начальная полоса с номером и названием; inline — с новой
 * страницы сразу с текста, номер и название над ним; none — с новой страницы чистым текстом, без номера и названия
 * (в оглавлении глава остаётся). Альбом в конце свою полосу сохраняет при любом выборе.
 */
export const CHAPTER_STARTS = ["page", "inline", "none"] as const;
export type ChapterStart = (typeof CHAPTER_STARTS)[number];
export const isChapterStart = (v: unknown): v is ChapterStart => (CHAPTER_STARTS as readonly unknown[]).includes(v);

/**
 * Заголовок главы над текстом — у книги с началом главы inline (BookContent.chapterStart): номер главы, название, виньетка
 * и эпиграф вверху первой полосы текста, мельче, чем на начальной полосе. Одни и те же размеры у PDF, HTML-превью
 * и оценки объёма: title и numeral — доля кегля начальной полосы, after — отбивка до текста в кеглях основного текста.
 */
export const CHAPTER_HEAD = { title: 0.62, numeral: 0.5, after: 1.8, epigraphGap: 0.5 } as const;

export interface ChapterHeadSizes {
  title: number;
  numeral: number;
  /** Отбивка от заголовка до текста, pt. */
  after: number;
}

export function chapterHeadSizes(S: InteriorSizes): ChapterHeadSizes {
  return { title: S.openerTitle * CHAPTER_HEAD.title, numeral: S.numeral * CHAPTER_HEAD.numeral, after: S.body * CHAPTER_HEAD.after };
}

/** Ширина средней буквы названия и эпиграфа, в кеглях — с запасом (как в opener-fit.ts). */
const TITLE_EM = 0.58;
const EPIGRAPH_EM = 0.54;
const lines = (chars: number, width: number, size: number, em: number) => (chars ? Math.max(1, Math.ceil((chars * size * em) / width)) : 0);

/** Высота заголовка главы над текстом вместе с отбивкой до текста, pt (оценка: по числу знаков). width — полоса набора, pt. */
export function chapterHeadHeight(design: InteriorDesign, S: InteriorSizes, text: { title: string; epigraph?: string; number: number | null }, width: number): number {
  const H = chapterHeadSizes(S);
  const markKind = design.opener.number;
  const mark = !text.number || markKind === "none" ? 0 : markKind === "label" ? S.kicker * 1.4 + S.kickerGap : H.numeral * OPENER.numeral.lineHeight * (1 + OPENER.numeral.after);
  const face = design.display;
  const em = TITLE_EM + (face.upper ? 0.12 + (face.tracking ?? 0) : (face.tracking ?? 0));
  const title = lines(text.title.length, width * 0.9, H.title, em) * H.title * OPENER.title.lineHeight;
  // Виньетка: отбивки сверху и снизу и сам рисунок (~кегль подписи).
  const vignette = design.opener.vignette === false ? S.vignetteGap : S.vignetteGap * 2 + S.kicker;
  const epigraphWidth = width * (design.opener.align === "left" ? 0.85 : 0.78);
  const epigraph = lines(text.epigraph?.length ?? 0, epigraphWidth, S.epigraph, EPIGRAPH_EM) * S.epigraph * OPENER.epigraph.lineHeight;
  return mark + title + vignette + epigraph + (epigraph ? S.body * CHAPTER_HEAD.epigraphGap : 0) + H.after;
}
