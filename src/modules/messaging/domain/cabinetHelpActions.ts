/**
 * Правки книги, которые помощник делает по просьбе клиента (решения владельца 28.11.2026): белый список того, что клиент
 * и сам меняет в кабинете, — титул, оглавление, начало глав, текст, фото, обложка шаблона и пометки оформления в тексте
 * ответа (без смены слов). Модель только предлагает правки структурно (поле edits), код проверяет их по книге, клиент
 * (или сотрудник по обращению) видит «было → станет» и подтверждает — тогда правки идут штатными сервисами редактора
 * (src/server/book-help.ts). Обращения в поддержку разбираются теми же правилами (src/server/support-assist.ts).
 *
 * Вне списка — деньги, скидки, сроки, заказы, удаление ответов и фото, написание текста за клиента, своя графика
 * обложки: такого здесь нет, вопрос уходит менеджеру. Тексты со слов клиента — посвящение, строка титула, название и
 * подзаголовок, подпись к фото; текст ответа меняется только пометками (>>…<<, ^^…^^, **…**), слова — те же: это
 * проверяет код (sameWords).
 *
 * Ссылки для модели: фото p1…, ответы q1…, главы c1… — из блока «Книга для правок» (helpBook.ts); в журнале правки
 * хранятся с id и при «Применить» заново проверяются по свежей книге.
 */
import { CHAPTER_STARTS, type ChapterStart } from "@/lib/book/chapter-head";
import { CHAPTER_SIDES, type ChapterSide } from "@/lib/book/layout";
import { LIMITS, type InteriorStyle } from "@/lib/book/interiors/style";
import { patchChapter, patchSection } from "@/lib/book/interiors/style-edit";
import { normalizeStyle, splitParagraphs, type InlinePhotoStyle } from "@/lib/book/inline-photo";
import { PHOTO_SIZE_WIDTHS, PHOTO_SIZE_WORDS, photoSizeWord, type PhotoSizeWord } from "@/lib/book/photo-sizes";
import { TOC_MODES, type TocMode } from "@/lib/book/toc";
import { toggleCenter, toggleLead } from "@/lib/book/answer-marks";
import { centerLine, leadMark } from "@/lib/book/answer-blocks";
import { DEDICATION_MAX } from "@/lib/content/kinds";
import { COVER_TEXT_MAX } from "@mybook/contracts/limits";
import { messagesFor } from "@/i18n/messages";
import type { Locale } from "@/i18n/config";

// ─── список ────────────────────────────────────────────────────────────────

/** Что принимает правка: on/off, одно из, число, текст. */
type Value = { t: "flag" } | { t: "enum"; of: readonly string[] } | { t: "num"; min: number; max: number } | { t: "text"; max: number; empty: boolean };
/** На что ссылается правка: книга целиком, глава, ответ, фото в ответе или любое фото. */
type Ref = "book" | "chapter" | "question" | "answerPhoto" | "photo";

const flag: Value = { t: "flag" };
const oneOf = (of: readonly string[]): Value => ({ t: "enum", of });

export const DROP_CAPS = ["none", "drop", "raised"] as const;
export type DropCapKind = (typeof DROP_CAPS)[number];
export const TOC_PLACES = ["start", "end"] as const;
export type TocPlace = (typeof TOC_PLACES)[number];
export const CHAPTER_NUMBERS = ["label", "digits", "padded", "roman", "none"] as const;
export type ChapterNumber = (typeof CHAPTER_NUMBERS)[number];
export const PHOTO_SHAPES = ["original", "1:1", "4:3", "3:4", "16:9"] as const;
export const PHOTO_ALIGNS = ["left", "center", "right"] as const;
export const PHOTO_FITS = ["contain", "fill"] as const;
export const TEXT_MARKS = ["center", "lead", "bold"] as const;
export type TextMark = (typeof TEXT_MARKS)[number];
/** Места фото без ссылки (photoPlace, target): альбом, само, не печатать; иначе — ответ q… или глава c…. */
export const PHOTO_SPOTS = ["album", "auto", "off"] as const;

const SPEC = {
  titlePage: { ref: "book", value: flag },
  titleAuthor: { ref: "book", value: flag },
  titleLine: { ref: "book", value: { t: "text", max: 80, empty: true } },
  dedication: { ref: "book", value: { t: "text", max: DEDICATION_MAX, empty: true } },
  toc: { ref: "book", value: flag },
  tocPlace: { ref: "book", value: oneOf(TOC_PLACES) },
  tocMode: { ref: "book", value: oneOf(TOC_MODES) },
  chapterStart: { ref: "book", value: oneOf(CHAPTER_STARTS) },
  chapterNumber: { ref: "book", value: oneOf(CHAPTER_NUMBERS) },
  openersLeft: { ref: "book", value: flag },
  chapterSide: { ref: "book", value: oneOf(CHAPTER_SIDES) },
  indent: { ref: "book", value: { t: "num", min: LIMITS.indent[0], max: LIMITS.indent[1] } },
  indentFirst: { ref: "book", value: flag },
  leadIn: { ref: "book", value: flag },
  dropCap: { ref: "book", value: oneOf(DROP_CAPS) },
  bookTitle: { ref: "book", value: { t: "text", max: COVER_TEXT_MAX.title, empty: true } },
  subtitle: { ref: "book", value: { t: "text", max: COVER_TEXT_MAX.subtitle, empty: true } },
  coverLines: { ref: "book", value: flag },
  hideRecipient: { ref: "book", value: flag },
  chapterLeadIn: { ref: "chapter", value: flag },
  questionBreak: { ref: "question", value: flag },
  textMark: { ref: "question", value: { t: "text", max: 2000, empty: false } },
  photoPage: { ref: "answerPhoto", value: flag },
  photoFit: { ref: "answerPhoto", value: oneOf(PHOTO_FITS) },
  photoSize: { ref: "answerPhoto", value: oneOf(PHOTO_SIZE_WORDS) },
  photoShape: { ref: "answerPhoto", value: oneOf(PHOTO_SHAPES) },
  photoAlign: { ref: "answerPhoto", value: oneOf(PHOTO_ALIGNS) },
  photoKeepSize: { ref: "answerPhoto", value: flag },
  photoBreak: { ref: "answerPhoto", value: flag },
  photoAnchor: { ref: "answerPhoto", value: { t: "text", max: 10, empty: false } },
  photoCaption: { ref: "photo", value: { t: "text", max: 200, empty: true } },
  photoMove: { ref: "photo", value: oneOf(["before", "after"]) },
  photoPlace: { ref: "photo", value: { t: "text", max: 10, empty: true } },
  coverPhoto: { ref: "photo", value: { t: "text", max: 10, empty: true } },
} as const satisfies Record<string, { ref: Ref; value: Value }>;

export type HelpEditKind = keyof typeof SPEC;
export const HELP_EDIT_KINDS = Object.keys(SPEC) as HelpEditKind[];

/**
 * Правка: что, на что (ref — ссылка p/q/c; в журнале — id), второе место (target: фото для photoMove, место для
 * photoPlace, пометка для textMark) и значение строкой (on/off, вариант, число, текст).
 */
export interface HelpEdit {
  kind: HelpEditKind;
  ref: string;
  target: string;
  value: string;
}

// ─── книга ─────────────────────────────────────────────────────────────────

export interface HelpEditPhoto {
  ref: string;
  id: string;
  /** Ответ, где стоит фото; null — фото не в ответе (глава, альбом, само, не печатается). */
  questionId: string | null;
  /** Место вне ответа, как в базе: ключ главы, __gallery, __off; null — по правилу книги. */
  chapter: string | null;
  opener: boolean;
  /** Подпись места для строк «было → станет»: заголовок ответа или где фото стоит. */
  heading: string;
  width: number;
  height: number;
  inline: InlinePhotoStyle;
  caption: string;
}

export interface HelpEditQuestion {
  ref: string;
  id: string;
  heading: string;
  pageBreak: boolean;
  answer: string;
}

export interface HelpEditChapter {
  ref: string;
  key: string;
  title: string;
}

/** Книга сейчас — по ней проверяются, описываются и применяются правки. */
export interface HelpEditBook {
  status: "draft" | "ordered";
  titlePage: boolean;
  titleAuthor: boolean;
  titleLine: string;
  showToc: boolean;
  tocAtEnd: boolean;
  tocMode: TocMode;
  dedication: string;
  chapterStart: ChapterStart;
  chapterNumber: ChapterNumber;
  openersLeft: boolean;
  /** С какой страницы начинается глава: где выпадет, всегда слева, всегда справа (books.pagination_rev). */
  chapterSide: ChapterSide;
  indent: number;
  indentFirst: boolean;
  leadIn: boolean;
  dropCap: DropCapKind;
  title: string;
  subtitle: string;
  /** Обложка из шаблона (не конструктор): линии, получатель и фото меняются только у неё. */
  coverTemplate: boolean;
  coverLines: boolean;
  hasRecipient: boolean;
  hideRecipient: boolean;
  coverPhotoId: string | null;
  /** Своя капитель главы (interior_style.chapters.<key>.leadIn); нет ключа — как у всей книги. */
  chapterLeadIn: Record<string, boolean>;
  interiorStyle: InteriorStyle;
  chapters: HelpEditChapter[];
  questions: HelpEditQuestion[];
  /** Все фото книги по порядку книги. */
  photos: HelpEditPhoto[];
  /** Порядок всех фото (id) — для перестановки. */
  photoOrder: string[];
  pageFit(photo: { width: number; height: number }): "contain" | undefined;
  order: { status: string; approvalRequired: boolean; approvedAt: Date | null; revokedAt: Date | null } | null;
}

export const HELP_EDITS_MAX = 40;
export const HELP_PROPOSAL_TTL_MS = 6 * 3_600_000;
/** Почему правки за клиента недоступны: книга заказана. */
export const HELP_EDITS_LOCKED = "книга заказана — правки в кабинете закрыты";

export const helpEditItemSchema = () =>
  ({
    type: "object",
    properties: {
      kind: { type: "string", enum: [...HELP_EDIT_KINDS] },
      ref: { type: "string" },
      target: { type: "string" },
      value: { type: "string" },
    },
    required: ["kind", "ref", "target", "value"],
    additionalProperties: false,
  }) as const;

// ─── разбор и проверка ─────────────────────────────────────────────────────

const ON = new Set(["on", "true", "yes", "1", "вкл", "да"]);
const OFF = new Set(["off", "false", "no", "0", "выкл", "нет"]);
const str = (v: unknown) => (typeof v === "string" ? v.replace(/\r/g, "").trim() : "");

/** Слова те же: текст без пометок оформления, пробелов и пустых строк совпадает. */
export const sameWords = (a: string, b: string) => a.replace(/[<>^*\s]/g, "") === b.replace(/[<>^*\s]/g, "");

const looseLine = (s: string) =>
  s
    .replace(/[<>^*]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/**
 * Пометка строк ответа (textMark): value — строки ответа дословно (несколько — через перевод строки), mark — center
 * (по центру), lead (капитель начала абзаца: value — начальные слова) или bold (жирная строка). null — строка не
 * найдена. Слова не меняются — это проверяет sameWords.
 */
export function markAnswer(answer: string, mark: TextMark, value: string): string | null {
  let text = answer;
  const wanted = value.split("\n").map(looseLine).filter(Boolean);
  if (!wanted.length) return null;
  for (const w of wanted) {
    const lines = text.split("\n");
    const i = lines.findIndex((l) => (mark === "lead" ? looseLine(l).startsWith(w) : looseLine(l) === w));
    if (i < 0) return null;
    const start = lines.slice(0, i).reduce((n, l) => n + l.length + 1, 0);
    const line = lines[i];
    if (mark === "center") {
      if (centerLine(line) !== null) continue;
      text = toggleCenter(text, start, start).value;
    } else if (mark === "lead") {
      if (leadMark(line)) continue;
      const body = line.trimStart();
      const indent = line.length - body.length;
      let len = 1;
      while (len < body.length && looseLine(body.slice(0, len)) !== w) len++;
      const exact = looseLine(body.slice(0, len)) === w && looseLine(body) !== w;
      text = toggleLead(text, start + indent, start + indent + (exact ? len : 0)).value;
    } else {
      const t = line.trim();
      if (/^\*\*[\s\S]+\*\*$/.test(t)) continue;
      lines[i] = `${line.slice(0, line.length - line.trimStart().length)}**${t}**`;
      text = lines.join("\n");
    }
  }
  return sameWords(answer, text) ? text : null;
}

/** Место фото по photoPlace: что записать в фото (questionId или chapter с opener). */
type Spot = { questionId: string } | { chapter: string; opener: boolean } | { chapter: null };

function spotOf(book: HelpEditBook, target: string, value: string): Spot | string {
  const t = target.toLowerCase();
  if (t === "album") return { chapter: "__gallery", opener: false };
  if (t === "off") return { chapter: "__off", opener: false };
  if (t === "auto") return { chapter: null };
  const q = book.questions.find((x) => x.ref === t);
  if (q) return { questionId: q.id };
  const c = book.chapters.find((x) => x.ref === t);
  if (c) return value === "opener" ? { chapter: c.key, opener: true } : value === "after" || !value ? { chapter: c.key, opener: false } : "photoPlace у главы: value — opener или after";
  return "photoPlace: target — ответ q…, глава c…, album, auto или off";
}

const photoByRef = (book: HelpEditBook, ref: string) => book.photos.find((p) => p.ref === ref);
/** Абзацы ответа — та же нумерация, что у мест фото в тексте (inline-photo.splitParagraphs). */
const paragraphs = (answer: string) => splitParagraphs(answer);

/**
 * Правки из ответа модели → проверенные правки по книге. problems — что не так (по-русски, для повторной просьбы
 * модели). Хоть одна ошибка — правок нет. Ничего не меняющие правки отбрасываются.
 */
export function parseHelpEdits(raw: unknown, book: HelpEditBook): { edits: HelpEdit[]; problems: string[] } {
  const problems: string[] = [];
  const list = Array.isArray(raw) ? raw : [];
  if (!list.length) return { edits: [], problems: ["action=propose без правок в edits"] };
  if (list.length > HELP_EDITS_MAX) problems.push(`больше ${HELP_EDITS_MAX} правок за раз`);
  if (book.status !== "draft") problems.push("книга заказана — правки в кабинете закрыты, только менеджер (handoff edit)");
  const edits: HelpEdit[] = [];
  for (const item of list.slice(0, HELP_EDITS_MAX)) {
    const r = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const kind = str(r.kind) as HelpEditKind;
    const spec = (SPEC as Record<string, { ref: Ref; value: Value }>)[kind];
    if (!spec) {
      problems.push(`правки «${kind || "?"}» нет в списке — такое делает менеджер`);
      continue;
    }
    const ref = str(r.ref ?? r.photo).toLowerCase();
    const target = str(r.target);
    let value = str(r.value);
    if (spec.ref === "chapter" && !book.chapters.some((c) => c.ref === ref)) {
      problems.push(`${kind}: главы «${ref || "?"}» нет в списке глав книги`);
      continue;
    }
    if (spec.ref === "question" && !book.questions.some((q) => q.ref === ref)) {
      problems.push(`${kind}: ответа «${ref || "?"}» нет в списке ответов книги`);
      continue;
    }
    if ((spec.ref === "photo" || spec.ref === "answerPhoto") && !photoByRef(book, ref)) {
      problems.push(`${kind}: фото «${ref || "?"}» нет в списке фото этой книги`);
      continue;
    }
    if (spec.ref === "answerPhoto" && !photoByRef(book, ref)!.questionId) {
      problems.push(`${kind}: фото ${ref} не в ответе — эта настройка только у фото в ответе (сначала photoPlace в ответ)`);
      continue;
    }
    const v = spec.value;
    const low = value.toLowerCase();
    let bad = "";
    if (v.t === "flag") {
      if (!ON.has(low) && !OFF.has(low)) bad = "on или off";
      else value = ON.has(low) ? "on" : "off";
    } else if (v.t === "enum") {
      if (!v.of.includes(low)) bad = `одно из ${v.of.join(", ")}`;
      else value = low;
    } else if (v.t === "num") {
      const n = Number(low.replace(",", "."));
      if (!Number.isFinite(n) || n < v.min || n > v.max) bad = `число от ${v.min} до ${v.max}`;
      else value = String(Math.round(n * 10) / 10);
    } else if (value.length > v.max) bad = `не длиннее ${v.max} знаков`;
    else if (!value && !v.empty) bad = "не пустое";
    if (bad) {
      problems.push(`${kind}: value — ${bad}`);
      continue;
    }
    const e: HelpEdit = { kind, ref: spec.ref === "book" ? "" : ref, target: target.toLowerCase(), value: v.t === "text" ? value : value.toLowerCase() };
    if (kind === "textMark") e.value = value;
    const why = check(e, book);
    if (why) problems.push(why);
    else edits.push(e);
  }
  const real = edits.filter((e) => changes(e, book));
  if (!problems.length && !real.length) problems.push("в книге уже так — правка ничего не меняет, просто скажи об этом клиенту (action=answer)");
  return problems.length ? { edits: [], problems } : { edits: real, problems: [] };
}

/** Проверки, которым нужна книга: обложка шаблона, место фото, пометки в тексте, перестановка. */
function check(e: HelpEdit, book: HelpEditBook): string | null {
  if ((e.kind === "coverLines" || e.kind === "hideRecipient" || e.kind === "coverPhoto") && !book.coverTemplate) return `${e.kind}: обложка собрана в «Конструкторе» — её правит сам клиент там или менеджер`;
  if (e.kind === "hideRecipient" && !book.hasRecipient) return "hideRecipient: у этой книги получателя на обложке нет";
  if (e.kind === "photoPlace") {
    const s = spotOf(book, e.target, e.value.toLowerCase());
    return typeof s === "string" ? s : null;
  }
  if (e.kind === "photoMove") {
    const t = photoByRef(book, e.target);
    if (!t || t.ref === e.ref) return "photoMove: target — другое фото из списка";
    if (!t.questionId) return "photoMove: target — фото в ответе (рядом с ним встанет фото); в главу, альбом и т. п. — photoPlace";
    return null;
  }
  if (e.kind === "photoAnchor") {
    const p = photoByRef(book, e.ref)!;
    const q = book.questions.find((x) => x.id === p.questionId);
    const total = q ? paragraphs(q.answer).length : 0;
    if (e.value === "start" || e.value === "end") return null;
    const n = Number(e.value);
    return Number.isInteger(n) && n >= 1 && n <= total ? null : `photoAnchor: value — start, end или номер абзаца от 1 до ${total}`;
  }
  if (e.kind === "textMark") {
    if (!(TEXT_MARKS as readonly string[]).includes(e.target)) return `textMark: target — ${TEXT_MARKS.join(", ")}`;
    const q = book.questions.find((x) => x.ref === e.ref)!;
    if (markAnswer(q.answer, e.target as TextMark, e.value) === null) return `textMark: в ответе ${e.ref} нет такой строки дословно (value — строки ответа как есть) — переспроси клиента`;
  }
  return null;
}

/** Где в ответе фото по photoAnchor: -1 — перед текстом, null — в конце, иначе — после абзаца (с 0). */
const anchorOf = (v: string): number | null => (v === "start" ? -1 : v === "end" ? null : Number(v) - 1);

function answerOrder(book: HelpEditBook, p: HelpEditPhoto) {
  const list = book.photos.filter((x) => x.questionId && x.questionId === p.questionId);
  return { n: list.indexOf(p) + 1, total: list.length };
}

function movedIndex(book: HelpEditBook, p: HelpEditPhoto, t: HelpEditPhoto, where: string) {
  const rest = book.photos.filter((x) => x.questionId === t.questionId && x.id !== p.id);
  return (where === "before" ? rest.indexOf(t) : rest.indexOf(t) + 1) + 1;
}

/** Меняет ли правка книгу. */
function changes(e: HelpEdit, book: HelpEditBook): boolean {
  const on = e.value === "on";
  const p = e.ref ? photoByRef(book, e.ref) : undefined;
  switch (e.kind) {
    case "titlePage":
      return on !== book.titlePage;
    case "titleAuthor":
      return on !== book.titleAuthor;
    case "titleLine":
      return e.value !== book.titleLine;
    case "dedication":
      return e.value !== book.dedication.trim();
    case "toc":
      return on !== book.showToc;
    case "tocPlace":
      return (e.value === "end") !== book.tocAtEnd;
    case "tocMode":
      return e.value !== book.tocMode;
    case "chapterStart":
      return e.value !== book.chapterStart;
    case "chapterNumber":
      return e.value !== book.chapterNumber;
    case "openersLeft":
      return on !== book.openersLeft;
    case "chapterSide":
      return e.value !== book.chapterSide;
    case "indent":
      return Number(e.value) !== book.indent;
    case "indentFirst":
      return on !== book.indentFirst;
    case "leadIn":
      return on !== book.leadIn;
    case "dropCap":
      return e.value !== book.dropCap;
    case "bookTitle":
      return e.value !== book.title.trim();
    case "subtitle":
      return e.value !== book.subtitle.trim();
    case "coverLines":
      return on !== book.coverLines;
    case "hideRecipient":
      return on !== book.hideRecipient;
    case "chapterLeadIn": {
      const c = book.chapters.find((x) => x.ref === e.ref)!;
      return on !== (book.chapterLeadIn[c.key] ?? book.leadIn);
    }
    case "questionBreak":
      return on !== book.questions.find((x) => x.ref === e.ref)!.pageBreak;
    case "textMark": {
      const q = book.questions.find((x) => x.ref === e.ref)!;
      return markAnswer(q.answer, e.target as TextMark, e.value) !== q.answer;
    }
    case "photoPage":
      return on !== !!p!.inline.page;
    case "photoFit":
      return (e.value === "contain") !== (p!.inline.pageFit === "contain");
    case "photoSize":
      return PHOTO_SIZE_WIDTHS[e.value as PhotoSizeWord] !== p!.inline.width;
    case "photoShape":
      return e.value !== p!.inline.aspect;
    case "photoAlign":
      return e.value !== p!.inline.align;
    case "photoKeepSize":
      return on !== !!p!.inline.keepSize;
    case "photoBreak":
      return on !== !!p!.inline.breakBefore;
    case "photoAnchor":
      return anchorOf(e.value) !== p!.inline.anchor;
    case "photoCaption":
      return e.value !== p!.caption.trim();
    case "photoMove": {
      const t = photoByRef(book, e.target)!;
      if (t.questionId !== p!.questionId) return true;
      return movedIndex(book, p!, t, e.value) !== answerOrder(book, p!).n;
    }
    case "photoPlace": {
      const s = spotOf(book, e.target, e.value.toLowerCase()) as Spot;
      if ("questionId" in s) return s.questionId !== p!.questionId;
      if (p!.questionId) return true;
      return s.chapter !== p!.chapter || ("opener" in s && s.opener !== p!.opener);
    }
    case "coverPhoto":
      return p!.id !== book.coverPhotoId;
  }
}

// ─── подписи ───────────────────────────────────────────────────────────────

const short = (s: string, max = 60) => {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > max ? `${one.slice(0, max - 1)}…` : one;
};

/** Что изменится — строками «Настройка: было → станет» на языке сайта (подписи — те же, что в редакторе). */
export function helpEditLines(edits: readonly HelpEdit[], book: HelpEditBook, lang: Locale): string[] {
  const m = messagesFor(lang);
  const a = m.help.actions;
  const el = m.design.pages.elements;
  const tx = m.design.pages.textTab;
  const pg = m.books.pages;
  const cv = m.books.cover;
  const ph = m.editor.answerPhoto;
  const ins = m.editor.inspector;
  const place = m.editor.photoPlace;
  const yn = (on: boolean) => (on ? a.on : a.off);
  const line = (label: string, from: string, to: string) => `${label}: ${from} → ${to}`;
  const em = (n: number) => (n ? `${String(n).replace(".", lang === "en" ? "." : ",")} ${tx.units.em}` : a.off);
  const quote = (s: string, max = 60) => (s.trim() ? `«${short(s, max)}»` : a.empty);
  const shape = (s: string) => (s === "original" ? ph.shapes.original : s === "1:1" ? ph.shapes.square : s);
  const alignWord = (s: string) => (s === "left" ? ins.alignLeft : s === "right" ? ins.alignRight : ins.alignCenter);
  const fitWord = (s: string) => (s === "contain" ? ph.fit.contain : ph.fit.fill);
  const chapterTitle = (key: string | null) => short(book.chapters.find((c) => c.key === key)?.title ?? "", 40);
  const placeOf = (p: HelpEditPhoto): string => {
    if (p.questionId) return place.answer(short(p.heading, 40));
    if (p.chapter === "__gallery") return place.album;
    if (p.chapter === "__off") return place.off;
    if (p.chapter && book.chapters.some((c) => c.key === p.chapter)) return p.opener ? place.opener(chapterTitle(p.chapter)) : place.after(chapterTitle(p.chapter));
    return m.editor.placeSheet.auto.label;
  };
  const photo = (p: HelpEditPhoto) => {
    if (!p.questionId) return a.photoAt(placeOf(p));
    const { n, total } = answerOrder(book, p);
    return a.photo(n, total, short(p.heading, 50));
  };
  const spotText = (s: Spot): string => {
    if ("questionId" in s) return place.answer(short(book.questions.find((q) => q.id === s.questionId)!.heading, 40));
    if (s.chapter === null) return m.editor.placeSheet.auto.label;
    if (s.chapter === "__gallery") return place.album;
    if (s.chapter === "__off") return place.off;
    return s.opener ? place.opener(chapterTitle(s.chapter)) : place.after(chapterTitle(s.chapter));
  };
  const anchorText = (v: number | null, q: HelpEditQuestion | undefined) => {
    if (v === -1) return ins.beforeText;
    if (v === null) return ins.atEnd;
    return ins.afterParagraph(v + 1, short(q ? (paragraphs(q.answer)[v] ?? "") : "", 24));
  };
  return edits.map((e) => {
    const on = e.value === "on";
    const p = e.ref ? photoByRef(book, e.ref) : undefined;
    const q = book.questions.find((x) => x.ref === e.ref);
    switch (e.kind) {
      case "titlePage":
        return line(el.titlePagePrint, yn(book.titlePage), yn(on));
      case "titleAuthor":
        return line(el.titleAuthor, yn(book.titleAuthor), yn(on));
      case "titleLine":
        return line(el.titleLine, quote(book.titleLine), quote(e.value, 80));
      case "dedication":
        return line(pg.dedication, quote(book.dedication, 40), quote(e.value, 200));
      case "toc":
        return line(pg.toc, yn(book.showToc), yn(on));
      case "tocPlace":
        return line(pg.tocPlace, pg.tocPlaces[book.tocAtEnd ? "end" : "start"], pg.tocPlaces[e.value as TocPlace]);
      case "tocMode":
        return line(pg.toc, pg.tocModes[book.tocMode].title, pg.tocModes[e.value as TocMode].title);
      case "chapterStart":
        return line(el.chapterStart, el.chapterStarts[book.chapterStart], el.chapterStarts[e.value as ChapterStart]);
      case "chapterNumber":
        return line(el.number, el.numbers[book.chapterNumber], el.numbers[e.value as ChapterNumber]);
      case "openersLeft":
        return line(el.openersLeft, yn(book.openersLeft), yn(on));
      case "chapterSide":
        return line(el.chapterSide, el.chapterSides[book.chapterSide], el.chapterSides[e.value as ChapterSide]);
      case "indent":
        return line(tx.indent, em(book.indent), em(Number(e.value)));
      case "indentFirst":
        return line(tx.indentFirst, yn(book.indentFirst), yn(on));
      case "leadIn":
        return line(el.leadIn, yn(book.leadIn), yn(on));
      case "dropCap":
        return line(el.dropCap, el.dropCaps[book.dropCap], el.dropCaps[e.value as DropCapKind]);
      case "bookTitle":
        return line(cv.bookTitle, quote(book.title), quote(e.value, 80));
      case "subtitle":
        return line(cv.subtitle, quote(book.subtitle), quote(e.value, 80));
      case "coverLines":
        return line(cv.coverLines, yn(book.coverLines), yn(on));
      case "hideRecipient":
        return line(cv.hideRecipient, yn(book.hideRecipient), yn(on));
      case "chapterLeadIn": {
        const c = book.chapters.find((x) => x.ref === e.ref)!;
        return `${a.chapter(short(c.title, 50))} — ${line(el.leadIn, yn(book.chapterLeadIn[c.key] ?? book.leadIn), yn(on))}`;
      }
      case "questionBreak":
        return `${a.answer(short(q!.heading, 50))} — ${line(pg.storyPageBreak, yn(q!.pageBreak), yn(on))}`;
      case "textMark": {
        const label = e.target === "center" ? m.editor.marks.center : e.target === "lead" ? m.editor.marks.lead : a.bold;
        const rows = e.value.split("\n").filter((l) => l.trim());
        return `${a.answer(short(q!.heading, 50))} — ${label}: ${quote(rows[0], 50)}${rows.length > 1 ? ` (+${rows.length - 1})` : ""}`;
      }
      case "photoPage":
        return `${photo(p!)} — ${ph.how}: ${p!.inline.page ? ph.onPage : ph.inText} → ${on ? ph.onPage : ph.inText}`;
      case "photoFit":
        return `${photo(p!)} — ${ph.onPage}: ${fitWord(p!.inline.pageFit === "contain" ? "contain" : "fill")} → ${fitWord(e.value)}`;
      case "photoSize":
        return `${photo(p!)} — ${line(ph.size, ph.sizes[photoSizeWord(p!.inline.width)], ph.sizes[e.value as PhotoSizeWord])}`;
      case "photoShape":
        return `${photo(p!)} — ${line(ph.shape, shape(p!.inline.aspect), shape(e.value))}`;
      case "photoAlign":
        return `${photo(p!)} — ${line(ins.align, alignWord(p!.inline.align), alignWord(e.value))}`;
      case "photoKeepSize":
        return `${photo(p!)} — ${line(ph.keepSize, yn(!!p!.inline.keepSize), yn(on))}`;
      case "photoBreak":
        return `${photo(p!)} — ${line(ph.breakBefore, yn(!!p!.inline.breakBefore), yn(on))}`;
      case "photoAnchor": {
        const pq = book.questions.find((x) => x.id === p!.questionId);
        return `${photo(p!)} — ${line(ins.place, anchorText(p!.inline.anchor, pq), anchorText(anchorOf(e.value), pq))}`;
      }
      case "photoCaption":
        return `${photo(p!)} — ${line(ph.caption, quote(p!.caption), quote(e.value, 120))}`;
      case "photoMove": {
        const t = photoByRef(book, e.target)!;
        if (t.questionId === p!.questionId) {
          const { n, total } = answerOrder(book, p!);
          return `${photo(p!)} — ${line(ph.order, ph.orderOf(n, total), ph.orderOf(movedIndex(book, p!, t, e.value), total))}`;
        }
        return `${photo(p!)} → ${place.answer(short(t.heading, 40))}, ${e.value === "before" ? a.before(photo(t)) : a.after(photo(t))}`;
      }
      case "photoPlace":
        return `${photo(p!)}: ${placeOf(p!)} → ${spotText(spotOf(book, e.target, e.value.toLowerCase()) as Spot)}`;
      case "coverPhoto":
        return `${a.coverPhoto}: ${photo(p!)}`;
    }
  });
}

/** Предупреждение к правке книги с заказом: макет согласован — снимется; заказ ждёт согласования — согласовать заново. */
export function helpEditWarning(order: HelpEditBook["order"], lang: Locale): string | null {
  if (!order || order.status === "cancelled") return null;
  const a = messagesFor(lang).help.actions;
  if (order.approvedAt && !order.revokedAt) return a.warnApproved;
  if (order.approvalRequired && ["pending_payment", "paid", "in_production"].includes(order.status)) return a.warnOrder;
  return null;
}

// ─── план правки для сервисов authoring ────────────────────────────────────

export interface HelpEditPlan {
  /** Настройки книги для BooksService.updateSettings. */
  settings: {
    titlePage?: boolean;
    showToc?: boolean;
    tocMode?: TocMode;
    dedication?: string;
    chapterStart?: ChapterStart;
    openersLeft?: boolean;
    chapterSide?: ChapterSide;
    title?: string;
    subtitle?: string;
    coverLines?: boolean;
    hideRecipientOnCover?: boolean;
    coverPhotoId?: string | null;
    interiorStyle?: InteriorStyle;
  };
  /** Правки фото для PhotosService.batch. */
  photos: { id: string; patch: { inline?: InlinePhotoStyle | null; caption?: string; questionId?: string | null; chapter?: string | null; opener?: boolean } }[];
  /** Новый порядок всех фото книги для PhotosService.reorder; null — не меняется. */
  order: string[] | null;
  /** Правки ответов для QuestionsService.edit: с новой страницы и текст с пометками (слова те же). */
  questions: { id: string; patch: { pageBreak?: boolean; answer?: string } }[];
}

/** Проверенные правки → вызовы штатных сервисов (по книге, какая она сейчас). */
export function planHelpEdits(edits: readonly HelpEdit[], book: HelpEditBook): HelpEditPlan {
  const settings: HelpEditPlan["settings"] = {};
  let style = book.interiorStyle;
  let styleTouched = false;
  const setStyle = (next: InteriorStyle) => {
    style = next;
    styleTouched = true;
  };
  const photos = new Map<string, HelpEditPlan["photos"][number]["patch"]>();
  const inlines = new Map<string, InlinePhotoStyle>();
  const questions = new Map<string, HelpEditPlan["questions"][number]["patch"]>();
  const answers = new Map(book.questions.map((q) => [q.id, q.answer]));
  let order: string[] | null = null;
  const patchOf = (id: string) => {
    if (!photos.has(id)) photos.set(id, {});
    return photos.get(id)!;
  };
  const inl = (p: HelpEditPhoto) => {
    if (!inlines.has(p.id)) inlines.set(p.id, { ...p.inline });
    return inlines.get(p.id)!;
  };
  const qPatch = (id: string) => {
    if (!questions.has(id)) questions.set(id, {});
    return questions.get(id)!;
  };
  for (const e of edits) {
    const on = e.value === "on";
    const p = e.ref ? photoByRef(book, e.ref) : undefined;
    const q = book.questions.find((x) => x.ref === e.ref);
    switch (e.kind) {
      case "titlePage":
        settings.titlePage = on;
        break;
      case "titleAuthor":
        setStyle(patchSection(style, "elements", { titleAuthor: on ? undefined : false }));
        break;
      case "titleLine":
        setStyle(patchSection(style, "elements", { titleLine: e.value || undefined }));
        break;
      case "dedication":
        settings.dedication = e.value;
        break;
      case "toc":
        settings.showToc = on;
        break;
      case "tocPlace":
        setStyle(patchSection(style, "elements", { toc: e.value === "end" ? "end" : undefined }));
        break;
      case "tocMode":
        settings.tocMode = e.value as TocMode;
        break;
      case "chapterStart":
        settings.chapterStart = e.value as ChapterStart;
        break;
      case "chapterNumber":
        setStyle(patchSection(style, "elements", { number: e.value as ChapterNumber }));
        break;
      case "openersLeft":
        settings.openersLeft = on;
        break;
      case "chapterSide":
        settings.chapterSide = e.value as ChapterSide;
        break;
      case "indent":
        setStyle(patchSection(style, "body", { indent: Number(e.value) }));
        break;
      case "indentFirst":
        setStyle(patchSection(style, "body", { indentFirst: on }));
        break;
      case "leadIn":
        setStyle(patchSection(style, "elements", { leadIn: on }));
        break;
      case "dropCap":
        setStyle(patchSection(style, "elements", { dropCap: e.value as DropCapKind }));
        break;
      case "bookTitle":
        settings.title = e.value;
        break;
      case "subtitle":
        settings.subtitle = e.value;
        break;
      case "coverLines":
        settings.coverLines = on;
        break;
      case "hideRecipient":
        settings.hideRecipientOnCover = on;
        break;
      case "chapterLeadIn": {
        const c = book.chapters.find((x) => x.ref === e.ref)!;
        setStyle(patchChapter(style, c.key, { leadIn: on }));
        break;
      }
      case "questionBreak":
        qPatch(q!.id).pageBreak = on;
        break;
      case "textMark": {
        const next = markAnswer(answers.get(q!.id)!, e.target as TextMark, e.value);
        if (next !== null) {
          answers.set(q!.id, next);
          qPatch(q!.id).answer = next;
        }
        break;
      }
      case "photoPage": {
        const s = inl(p!);
        if (on) Object.assign(s, { page: true, pageFit: book.pageFit(p!) });
        else delete s.page;
        break;
      }
      case "photoFit": {
        const s = inl(p!);
        if (e.value === "contain") s.pageFit = "contain";
        else delete s.pageFit;
        break;
      }
      case "photoSize":
        inl(p!).width = PHOTO_SIZE_WIDTHS[e.value as PhotoSizeWord];
        break;
      case "photoShape":
        inl(p!).aspect = e.value as InlinePhotoStyle["aspect"];
        break;
      case "photoAlign":
        inl(p!).align = e.value as InlinePhotoStyle["align"];
        break;
      case "photoKeepSize":
        inl(p!).keepSize = on;
        break;
      case "photoBreak":
        inl(p!).breakBefore = on;
        break;
      case "photoAnchor":
        inl(p!).anchor = anchorOf(e.value);
        break;
      case "photoCaption":
        patchOf(p!.id).caption = e.value;
        break;
      case "photoMove": {
        const t = photoByRef(book, e.target)!;
        // Рядом с соседом: в его ответе и после того же абзаца.
        if (t.questionId !== p!.questionId) {
          patchOf(p!.id).questionId = t.questionId;
          if (!p!.questionId) inlines.set(p!.id, normalizeStyle(null));
        }
        const s = inl(p!);
        s.anchor = inlines.get(t.id)?.anchor ?? t.inline.anchor;
        const ids: string[] = [...(order ?? book.photoOrder)].filter((id) => id !== p!.id);
        const at = ids.indexOf(t.id);
        ids.splice(e.value === "before" ? at : at + 1, 0, p!.id);
        order = ids;
        break;
      }
      case "photoPlace": {
        const s = spotOf(book, e.target, e.value.toLowerCase()) as Spot;
        const patch = patchOf(p!.id);
        if ("questionId" in s) {
          patch.questionId = s.questionId;
          // Новое фото в ответе — в конце ответа, во всю ширину (как «В ответ…» в листе «Где стоит фото»).
          if (!p!.questionId) inlines.set(p!.id, normalizeStyle(null));
        } else {
          patch.questionId = null;
          patch.chapter = s.chapter;
          patch.opener = "opener" in s ? s.opener : false;
          inlines.delete(p!.id);
          patch.inline = null;
        }
        break;
      }
      case "coverPhoto":
        settings.coverPhotoId = p!.id;
        break;
    }
  }
  if (styleTouched) settings.interiorStyle = style;
  for (const [id, s] of inlines) patchOf(id).inline = normalizeStyle(s);
  return { settings, photos: [...photos].map(([id, patch]) => ({ id, patch })), order, questions: [...questions].map(([id, patch]) => ({ id, patch })) };
}

// ─── журнал: ссылки ↔ id ───────────────────────────────────────────────────

const refTarget = (e: HelpEdit) => e.kind === "photoMove" || (e.kind === "photoPlace" && !(PHOTO_SPOTS as readonly string[]).includes(e.target));

/** Ссылки модели (p…, q…, c…) → id: так правки хранятся в журнале и применяются позже по свежей книге. */
export function editsWithIds(edits: readonly HelpEdit[], book: HelpEditBook): HelpEdit[] {
  const id = (ref: string) => book.photos.find((p) => p.ref === ref)?.id ?? book.questions.find((q) => q.ref === ref)?.id ?? book.chapters.find((c) => c.ref === ref)?.key ?? ref;
  return edits.map((e) => ({ ...e, ref: e.ref ? id(e.ref) : "", target: refTarget(e) ? id(e.target) : e.target }));
}

/** Обратно: id → ссылки по свежей книге; чего-то уже нет (фото удалили, ответ убрали) — null. */
export function editsWithRefs(edits: readonly HelpEdit[], book: HelpEditBook): HelpEdit[] | null {
  const ref = (id: string) => book.photos.find((p) => p.id === id)?.ref ?? book.questions.find((q) => q.id === id)?.ref ?? book.chapters.find((c) => c.key === id)?.ref ?? null;
  const out: HelpEdit[] = [];
  for (const e of edits) {
    const r = e.ref ? ref(e.ref) : "";
    if (r === null) return null;
    let target = e.target;
    if (refTarget(e)) {
      const t = ref(e.target);
      if (t === null) return null;
      target = t;
    }
    out.push({ ...e, ref: r, target });
  }
  return out;
}

/** Правки из журнала → снова в модельный вид для проверки. */
export const editsToRaw = (edits: readonly HelpEdit[]) => edits.map((e) => ({ kind: e.kind, ref: e.ref, target: e.target, value: e.value }));
