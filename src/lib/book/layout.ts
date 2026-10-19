/**
 * Сборка содержимого книги и помощники фотостраниц. Модуль общий для сервера и браузера.
 */
import type { Locale } from "@/i18n/config";
import { applyGender } from "../content/gender";
import { bookKind, type BookKind } from "../content/kinds";
import type { AnswerMedia, Book, BookChapter, BookQuestion, InlinePhotoStyle, Photo } from "@/shared/infrastructure/db/schema";
import { normalizeMedia } from "./answer-media";
import { MAX_INLINE_HEIGHT_SHARE, splitParagraphs } from "./inline-photo";
import { getFormat, type BookFormat } from "./formats";
import { getInteriorDesign, type InteriorDesign } from "./interiors";
import { textArea } from "./page-geometry";
import { isCustomToc, type TocLines, type TocMode } from "./toc";

export interface ContentItem {
  id: string;
  heading: string | null;
  answer: string;
  /** Фото, вставленные в ответ (печатаются после текста). */
  photos?: PhotoItem[];
  /** Видео и музыка — QR-коды с подписью (answer-media.ts); нет — ключа нет (отпечаток кэша прежних книг не меняется). */
  media?: AnswerMedia[];
  /** Автор просил начать историю с новой страницы; нет — ключа нет. */
  pageBreak?: true;
  /** Перед этой частью — фото на всю страницу (под обрез) из той же истории: текст до него — в предыдущей части. */
  photoBefore?: PhotoItem;
  /** Продолжение истории после фото на всю страницу: без заголовка и разделителя, в оглавление не идёт. */
  continued?: true;
}

export interface PhotoItem {
  id: string;
  caption: string;
  layout: "full" | "bleed" | "half" | "grid";
  width: number;
  height: number;
  storageKey: string;
  thumbKey: string;
  questionId?: string | null;
  inline?: InlinePhotoStyle | null;
}

export interface ContentChapter {
  key: string;
  number: number;
  title: string;
  epigraph?: string;
  items: ContentItem[];
  photos: PhotoItem[];
  /** Снимок на начальной полосе главы — в оформлениях, где глава открывается фото (первое фото главы). */
  openerPhoto?: PhotoItem;
  /** Название главы по книге, если автор переименовал её (title — новое); нет — не переименована. */
  defaultTitle?: string;
  /**
   * Главы, которые автор убрал (toc.ts, скрытая строка главы): их истории идут дальше в этой главе с ответа at.
   * Нужны редактору оглавления, чтобы главу можно было вернуть. Нет — ничего не убрано.
   */
  folded?: { key: string; title: string; at: number }[];
}

export interface BookContent {
  /** Язык книги: на нём печатаются служебные надписи (оглавление, «Глава N») и расставляются переносы. */
  language: Locale;
  /** Вид книги (lib/content/kinds): от него зависят подписи служебных полос. */
  kind: BookKind;
  format: BookFormat;
  /** Оформление страниц: шрифты, цвета, виньетки, начальные полосы глав. */
  interior: InteriorDesign;
  title: string;
  subtitle: string;
  authorName: string;
  recipientName: string;
  /** Автобиография: кто записал со слов рассказчика — строка на обороте титула; у остальных книг пусто. */
  recordedBy: string;
  dedication: string;
  showToc: boolean;
  /** Оглавление не по умолчанию (toc.ts); по главам без своих строк — ключей нет (отпечаток кэша прежних книг не меняется). */
  tocMode?: TocMode;
  tocLines?: TocLines;
  chapters: ContentChapter[];
  /** Фото, вынесенные в отдельный раздел в конце книги. */
  galleryPhotos: PhotoItem[];
  /** Название раздела фото в конце книги (начальная полоса и строка оглавления) — по виду книги. */
  galleryTitle: string;
  year: number;
}

export type QuestionLike = Pick<BookQuestion, "id" | "chapter" | "position" | "title" | "displayText" | "hideHeading" | "answer" | "questionKey"> & {
  media?: readonly Partial<AnswerMedia>[] | null;
  /** «С новой страницы» (book_questions.page_break); нет — как раньше. */
  pageBreak?: boolean | null;
};
export type BookLike = Pick<
  Book,
  | "theme"
  | "language"
  | "title"
  | "subtitle"
  | "authorName"
  | "authorGender"
  | "recordedBy"
  | "recipientName"
  | "recipientGender"
  | "dedication"
  | "interior"
  | "format"
  | "photoPlacement"
  | "showToc"
  | "coverPhotoId"
> &
  /** Оглавление (toc.ts): нет — по главам, без своих строк. */
  Partial<Pick<Book, "tocMode" | "tocLines">>;

/** Глава своей книги (book_chapters) для сборки: порядок — порядок списка. У книг с банком список пуст. */
export type ChapterLike = Pick<BookChapter, "key" | "title" | "epigraph">;

/** Ключ собственного вопроса и раздела своей книги — текст автора: род в нём не подставляется. */
export const CUSTOM_KEY = "custom";

type GenderOf = Pick<Book, "authorGender" | "recipientGender">;

/**
 * Тексты вопроса для показа и печати: вопрос, подсказка, заголовок в книге. Шаблоны рода раскрываются только в текстах
 * банка: свой вопрос и раздел своей книги (questionKey = custom) — текст автора, «[Аня|Анна]» в нём остаётся как есть.
 * Заголовок — переписанный автором (displayText), иначе заголовок вопроса.
 */
export function questionTexts(q: Pick<BookQuestion, "questionKey" | "prompt" | "hint" | "title" | "displayText">, book: GenderOf) {
  const g = q.questionKey === CUSTOM_KEY ? (s: string) => s : (s: string) => applyGender(s, book.authorGender, book.recipientGender);
  return { prompt: g(q.prompt), hint: q.hint ? g(q.hint) : null, title: g(q.title), heading: q.displayText ?? g(q.title) };
}

export function questionHeading(q: Pick<BookQuestion, "title" | "displayText" | "questionKey">, book: GenderOf) {
  return q.displayText ?? (q.questionKey === CUSTOM_KEY ? q.title : applyGender(q.title, book.authorGender, book.recipientGender));
}

/** Эмодзи (кроме ©, ®, ™), их модификаторы, склейки и флаги: в книжных шрифтах их нет — в печати они превращаются в мусор. */
const EMOJI = /(?![©®™])\p{Extended_Pictographic}|\p{Emoji_Modifier}|[\u200D\uFE0E\uFE0F\u20E3]|[\u{1F1E6}-\u{1F1FF}]/gu;

/** Текст для печати: без эмодзи и оставшихся после них лишних пробелов. */
export function printableText(text: string) {
  if (!EMOJI.test(text)) return text;
  EMOJI.lastIndex = 0;
  return text
    .replace(EMOJI, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([,.!?…:;)»”])/g, "$1")
    .replace(/[ \t]+$/gm, "")
    .trim();
}

export function toPhotoItem(p: Pick<Photo, "id" | "caption" | "layout" | "width" | "height" | "storageKey" | "thumbKey" | "questionId" | "inline">): PhotoItem {
  return {
    id: p.id,
    caption: printableText(p.caption),
    layout: p.layout,
    width: p.width,
    height: p.height,
    storageKey: p.storageKey,
    thumbKey: p.thumbKey,
    questionId: p.questionId,
    inline: p.inline,
  };
}

export interface LetterLike {
  id: string;
  authorName: string;
  relation: string;
  text: string;
}

export const LETTERS_CHAPTER = "__letters";

/**
 * Тексты книги, которых нет в ответах: названия и эпиграфы глав (своей книги — из book_chapters, остальных — из темы),
 * «Разное» для главы вне темы, глава писем, название книги и раздела фото по умолчанию. На сервере их даёт bookTexts
 * (book-content.ts: главы книги, тема и словарь языка книги), редактору в браузере — его собственные данные:
 * словари и каталог тем туда не грузятся.
 */
export interface BookTexts {
  /** own — глава автора (book_chapters): название не склоняется, печатается через printableText, пустое — untitledChapter. */
  chapter(key: string): { title: string; epigraph?: string; own?: boolean } | undefined;
  /** Порядок глав своей книги (ключи по позициям); главы вне списка — в конце. Без него — по первому вопросу главы. */
  chapterOrder?: readonly string[];
  misc: string;
  /** Название главы автора, оставленной без названия. */
  untitledChapter: string;
  letters: { title: string; epigraph?: string };
  defaultTitle: string;
  galleryTitle: string;
}

/** Содержимое книги для вёрстки — то, что печатается: главы с ответами и фото, галерея, письма. */
export function assembleBookContent(
  book: BookLike,
  questions: QuestionLike[],
  photos: PhotoItem[],
  texts: BookTexts,
  year = new Date().getFullYear(),
  letters: LetterLike[] = [],
): BookContent {
  const sorted = [...questions].sort((a, b) => a.position - b.position);
  const chapterOrder: string[] = [];
  const byChapter = new Map<string, ContentItem[]>();
  // Фото, вставленные в конкретные ответы
  const inline = new Map<string, PhotoItem[]>();
  for (const p of photos) {
    if (!p.questionId || p.id === book.coverPhotoId) continue;
    inline.set(p.questionId, [...(inline.get(p.questionId) ?? []), p]);
  }
  for (const q of sorted) {
    const qPhotos = inline.get(q.id) ?? [];
    const media = normalizeMedia(q.media).map((m) => ({ ...m, title: printableText(m.title) }));
    if (!q.answer.trim() && !qPhotos.length && !media.length) continue;
    if (!byChapter.has(q.chapter)) {
      byChapter.set(q.chapter, []);
      chapterOrder.push(q.chapter);
    }
    byChapter.get(q.chapter)!.push(
      ...splitAtPagePhotos({
        id: q.id,
        heading: q.hideHeading ? null : printableText(questionHeading(q, book)),
        answer: printableText(q.answer.trim()),
        photos: qPhotos,
        ...(media.length ? { media } : {}),
        ...(q.pageBreak ? { pageBreak: true as const } : {}),
      }),
    );
  }

  // Своя книга — главы в порядке оглавления автора (пустые не печатаются), главы вне него — в конце.
  const order = texts.chapterOrder;
  const keys = order ? [...order.filter((k) => byChapter.has(k)), ...chapterOrder.filter((k) => !order.includes(k))] : chapterOrder;
  const chapters: ContentChapter[] = keys.map((key, i) => {
    const def = texts.chapter(key);
    // Название главы автора — его текст: без подстановки рода, без эмодзи, пустое — «Без названия».
    const title = def?.own ? printableText(def.title.trim()) || texts.untitledChapter : applyGender(def?.title ?? texts.misc, book.authorGender, book.recipientGender);
    const epigraph = def?.own ? printableText(def.epigraph?.trim() ?? "") || undefined : def?.epigraph;
    return { key, number: i + 1, title, epigraph, items: byChapter.get(key)!, photos: [] };
  });
  // Главы по-своему: переименованные и убранные автором (их истории — в предыдущей главе) — до раздачи фото по главам.
  foldChapters(chapters, book.tocLines ?? {});

  // Фото обложки не дублируем внутри книги.
  const placedInAnswers = new Set(chapters.flatMap((c) => c.items.flatMap((it) => (it.photos ?? []).map((p) => p.id))));
  const innerPhotos = photos.filter((p) => p.id !== book.coverPhotoId && !placedInAnswers.has(p.id));
  let galleryPhotos: PhotoItem[] = [];
  // «Не печатать» (none): фото вне историй в книгу не идут — ни по главам, ни в конце (у обложки свои снимки).
  if (book.photoPlacement === "none") galleryPhotos = [];
  else if (book.photoPlacement === "end" || chapters.length === 0) {
    galleryPhotos = innerPhotos;
  } else {
    innerPhotos.forEach((p, i) => {
      const idx = Math.min(chapters.length - 1, Math.floor((i * chapters.length) / innerPhotos.length));
      chapters[idx].photos.push(p);
    });
  }

  // Оформление, где глава открывается фото: первое фото главы переезжает на её начальную полосу.
  const interior = getInteriorDesign(book.interior);
  if (interior.opener.photo) for (const ch of chapters) ch.openerPhoto = ch.photos.shift();

  // Письма близких — последняя глава, после распределения фото.
  const letterItems = letters.filter((l) => l.text.trim());
  if (letterItems.length) {
    chapters.push({
      key: LETTERS_CHAPTER,
      number: chapters.length + 1,
      title: texts.letters.title,
      epigraph: texts.letters.epigraph,
      items: letterItems.map((l) => ({ id: l.id, heading: printableText(l.relation.trim() ? `${l.authorName.trim()}, ${l.relation.trim()}` : l.authorName.trim()), answer: printableText(l.text.trim()) })),
      photos: [],
    });
    foldChapters(chapters, book.tocLines ?? {}, LETTERS_CHAPTER);
  }

  const kind = bookKind(book.theme);
  return {
    language: book.language,
    kind,
    format: getFormat(book.format),
    interior,
    title: printableText(book.title.trim()) || texts.defaultTitle,
    subtitle: printableText(book.subtitle.trim()),
    authorName: book.authorName.trim(),
    recipientName: book.recipientName.trim(),
    recordedBy: kind === "autobiography" ? printableText(book.recordedBy.trim()) : "",
    dedication: printableText(book.dedication.trim()),
    showToc: book.showToc,
    ...tocSettings(book),
    chapters,
    galleryPhotos,
    galleryTitle: texts.galleryTitle,
    year,
  };
}

/**
 * Главы по-своему (настройки строк глав, toc.ts): своё название — во всей книге (начальная полоса, колонтитул,
 * оглавление); скрытая глава убирается, а её истории идут дальше в предыдущей. Первую главу убрать некуда — у неё
 * скрытие действует только на оглавление. only — применить только к этой главе (письма добавляются позже остальных).
 * Номера глав — заново по порядку.
 */
function foldChapters(chapters: ContentChapter[], lines: Readonly<Record<string, { title?: string; hidden?: boolean }>>, only?: string) {
  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i];
    if (only && ch.key !== only) continue;
    const s = lines[`c:${ch.key}`];
    const title = s?.title ? printableText(s.title.trim()) : "";
    if (title && title !== ch.title) {
      ch.defaultTitle = ch.title;
      ch.title = title;
    }
    if (!s?.hidden || i === 0) continue;
    const prev = chapters[i - 1];
    prev.folded = [...(prev.folded ?? []), { key: ch.key, title: ch.defaultTitle ?? ch.title, at: prev.items.length }, ...(ch.folded ?? []).map((f) => ({ ...f, at: f.at + prev.items.length }))];
    prev.items = [...prev.items, ...ch.items];
    prev.photos = [...prev.photos, ...(ch.openerPhoto ? [ch.openerPhoto] : []), ...ch.photos];
    chapters.splice(i, 1);
    i -= 1;
  }
  chapters.forEach((ch, i) => (ch.number = i + 1));
}

/** Настройки оглавления для содержимого: только не по умолчанию; свои названия — без эмодзи, как весь текст книги. */
function tocSettings(book: Pick<BookLike, "tocMode" | "tocLines">): Pick<BookContent, "tocMode" | "tocLines"> {
  const mode = book.tocMode ?? "chapters";
  const raw = book.tocLines ?? {};
  if (!isCustomToc(mode, raw)) return {};
  const lines: TocLines = {};
  for (const [key, s] of Object.entries(raw)) {
    const title = s.title ? printableText(s.title.trim()) : "";
    if (title || s.hidden) lines[key] = { ...(title ? { title } : {}), ...(s.hidden ? { hidden: true } : {}) };
  }
  return { tocMode: mode, tocLines: lines };
}

/** Пустая часть истории: ни заголовка, ни текста, ни фото, ни QR — например, между двумя фото на всю страницу. */
export const isEmptyItem = (it: ContentItem) => !it.heading && !it.answer && !it.photos?.length && !it.media?.length;

/**
 * Фото «на всю страницу» в истории (inline.page): история делится в месте фото. Часть до фото — как была (заголовок,
 * абзацы, фото и QR до этого места), следующая — продолжение без заголовка (continued) с этим фото перед собой
 * (photoBefore, под обрез). Фото перед текстом — страница с ним идёт перед историей (у первой части photoBefore).
 * Места остальных фото и QR (anchor — номер абзаца) пересчитываются от начала своей части.
 */
function splitAtPagePhotos(item: ContentItem): ContentItem[] {
  const pagePhotos = (item.photos ?? []).filter((p) => p.inline?.page);
  if (!pagePhotos.length) return [item];
  const paragraphs = splitParagraphs(item.answer);
  const n = paragraphs.length;
  // После какого абзаца стоит фото или QR: -1 — перед текстом, n − 1 — в конце (как в layoutInline).
  const after = (anchor: number | null | undefined) => (anchor === null || anchor === undefined || anchor >= n - 1 ? n - 1 : Math.max(-1, anchor));
  const cuts = [...pagePhotos].sort((a, b) => after(a.inline?.anchor) - after(b.inline?.anchor));
  const photos = (item.photos ?? []).filter((p) => !p.inline?.page);
  const media = item.media ?? [];
  const parts: ContentItem[] = [];
  let from = 0;
  for (let i = 0; i <= cuts.length; i++) {
    const end = i < cuts.length ? after(cuts[i].inline?.anchor) + 1 : n;
    // Фото и QR этой части — после её абзацев (у первой — и перед текстом). Стоящие там же, где фото на всю
    // страницу, — до него, в этой части. Место — от начала части.
    const mine = (a: number) => a >= (i === 0 ? -1 : from) && a <= end - 1;
    const shift = (a: number) => (a < from ? -1 : a - from);
    const partPhotos = photos.filter((p) => mine(after(p.inline?.anchor))).map((p) => ({ ...p, inline: p.inline ? { ...p.inline, anchor: shift(after(p.inline.anchor)) } : p.inline }));
    const partMedia = media.filter((m) => mine(after(m.anchor))).map((m) => ({ ...m, anchor: shift(after(m.anchor)) }));
    const part: ContentItem = {
      id: i === 0 ? item.id : `${item.id}-p${i}`,
      heading: i === 0 ? item.heading : null,
      answer: paragraphs.slice(from, end).join("\n"),
      photos: partPhotos,
      ...(partMedia.length ? { media: partMedia } : {}),
      ...(i === 0 && item.pageBreak ? { pageBreak: true as const } : {}),
      ...(i > 0 ? { photoBefore: { ...cuts[i - 1], layout: "bleed" as const }, continued: true as const } : {}),
    };
    parts.push(part);
    from = end;
  }
  // Пустая первая часть (фото перед текстом): заголовок, id и «с новой страницы» — у следующей, страница фото — перед ней.
  if (parts.length > 1 && isEmptyItem({ ...parts[0], heading: null })) {
    const [head, next] = parts;
    const merged: ContentItem = { ...next, id: head.id, heading: head.heading, ...(head.pageBreak ? { pageBreak: true as const } : {}) };
    delete merged.continued;
    parts.splice(0, 2, merged);
  }
  // Пустая последняя часть без фото перед собой не нужна.
  return parts.filter((p, i) => i === 0 || !isEmptyItem(p) || p.photoBefore);
}

/**
 * Глава по кускам сплошного текста: между ними — фото на всю страницу из историй (photoBefore следующей части).
 * Кусок без единой непустой истории — только страница с фото (например, фото перед текстом первой истории главы).
 */
export function chapterRuns(items: readonly ContentItem[]): { items: ContentItem[]; photo?: PhotoItem }[] {
  const runs: { items: ContentItem[]; photo?: PhotoItem }[] = [];
  let current: ContentItem[] = [];
  for (const it of items) {
    if (it.photoBefore) {
      runs.push({ items: current, photo: it.photoBefore });
      current = [];
    }
    if (!isEmptyItem(it)) current.push(it);
  }
  runs.push({ items: current });
  return runs.filter((r) => r.items.length || r.photo);
}

/** Сколько фото «сеткой» помещается на страницу. */
export const GRID_PER_PAGE = 4;

/** Группирует фото в страницы: «половинки» объединяются по две, «сетка» — до четырёх. */
export function photoPages<T extends Pick<PhotoItem, "layout">>(photos: T[]): T[][] {
  const pages: T[][] = [];
  let pendingHalf: T | null = null;
  let grid: T[] = [];
  for (const p of photos) {
    if (p.layout === "grid") {
      grid.push(p);
      if (grid.length === GRID_PER_PAGE) {
        pages.push(grid);
        grid = [];
      }
    } else if (p.layout === "half") {
      if (pendingHalf) {
        pages.push([pendingHalf, p]);
        pendingHalf = null;
      } else pendingHalf = p;
    } else pages.push([p]);
  }
  if (pendingHalf) pages.push([pendingHalf]);
  if (grid.length) pages.push(grid);
  return pages;
}

export function countWords(text: string) {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

/** Эффективное разрешение фото при печати: contain — вписать, cover — заполнить. */
export function effectiveDpi(px: { width: number; height: number }, areaMm: { w: number; h: number }, fit: "contain" | "cover") {
  const rx = px.width / areaMm.w;
  const ry = px.height / areaMm.h;
  return Math.round((fit === "contain" ? Math.max(rx, ry) : Math.min(rx, ry)) * 25.4);
}

/** Размер области под фото на странице для заданного макета, мм. */
export function photoAreaMm(format: BookFormat, layout: PhotoItem["layout"] | "inline") {
  const area = textArea(format);
  if (layout === "bleed") return { w: format.widthMm, h: format.heightMm };
  if (layout === "half") return { w: area.w, h: area.h / 2 - 12 };
  if (layout === "grid") return { w: area.w / 2 - 3, h: area.h / 2 - 8 };
  if (layout === "inline") return { w: area.w, h: area.h * MAX_INLINE_HEIGHT_SHARE };
  return { w: area.w, h: area.h - 14 };
}
