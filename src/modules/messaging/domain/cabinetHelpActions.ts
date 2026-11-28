/**
 * Правки книги, которые помощник в кабинете делает по просьбе клиента (решение владельца 28.11.2026): белый список
 * безопасных переключателей и настроек, которые клиент и сам меняет в редакторе. Модель только предлагает правку
 * структурно (поле edits ответа), код проверяет её здесь по книге клиента, клиент видит «было → станет» и подтверждает
 * кнопкой — лишь тогда правка применяется штатными сервисами редактора (src/server/book-help.ts).
 *
 * Вне списка — деньги, скидки, сроки, заказы, удаление ответов и фото, текст ответов за клиента: этого здесь нет и
 * быть не должно (такой вопрос уходит менеджеру). Единственный текст со слов клиента — посвящение.
 *
 * Чистые функции: разбор и проверка, подписи (из словарей сайта — те же слова, что в редакторе), план правки для
 * сервисов authoring, предупреждение о согласованном макете.
 */
import { CHAPTER_STARTS, type ChapterStart } from "@/lib/book/chapter-head";
import { CHAPTER_SIDES, type ChapterSide } from "@/lib/book/layout";
import { LIMITS, type InteriorStyle } from "@/lib/book/interiors/style";
import { patchSection } from "@/lib/book/interiors/style-edit";
import { normalizeStyle, type InlinePhotoStyle } from "@/lib/book/inline-photo";
import { PHOTO_SIZE_WIDTHS, PHOTO_SIZE_WORDS, photoSizeWord, type PhotoSizeWord } from "@/lib/book/photo-sizes";
import { DEDICATION_MAX } from "@/lib/content/kinds";
import { messagesFor } from "@/i18n/messages";
import type { Locale } from "@/i18n/config";

/** Что помощник может поменять. */
export const HELP_EDIT_KINDS = [
  "titlePage",
  "toc",
  "tocPlace",
  "dedication",
  "chapterStart",
  "openersLeft",
  "chapterSide",
  "indent",
  "indentFirst",
  "leadIn",
  "dropCap",
  "photoPage",
  "photoSize",
  "photoBreak",
  "photoMove",
] as const;
export type HelpEditKind = (typeof HELP_EDIT_KINDS)[number];

export const DROP_CAPS = ["none", "drop", "raised"] as const;
/** Где оглавление: в начале книги или в конце (interior_style.elements.toc). */
export const TOC_PLACES = ["start", "end"] as const;
export type TocPlace = (typeof TOC_PLACES)[number];
export type DropCapKind = (typeof DROP_CAPS)[number];

export type HelpEdit =
  | { kind: "titlePage" | "toc" | "openersLeft" | "indentFirst" | "leadIn"; on: boolean }
  | { kind: "dedication"; text: string }
  | { kind: "chapterStart"; value: ChapterStart }
  | { kind: "tocPlace"; value: TocPlace }
  | { kind: "chapterSide"; value: ChapterSide }
  | { kind: "indent"; value: number }
  | { kind: "dropCap"; value: DropCapKind }
  | { kind: "photoPage" | "photoBreak"; photo: string; on: boolean }
  | { kind: "photoSize"; photo: string; value: PhotoSizeWord }
  | { kind: "photoMove"; photo: string; target: string; where: "before" | "after" };

/** Фото в ответе — то, что можно двигать и настраивать (ref — короткая ссылка для модели: p1, p2…). */
export interface HelpEditPhoto {
  ref: string;
  id: string;
  questionId: string;
  /** Заголовок ответа — для подписи «Фото 2 из 3 в ответе «…»». */
  heading: string;
  width: number;
  height: number;
  inline: InlinePhotoStyle;
}

/** Книга сейчас — по ней проверяются, описываются и применяются правки. */
export interface HelpEditBook {
  status: "draft" | "ordered";
  titlePage: boolean;
  showToc: boolean;
  /** Оглавление в конце книги (а не в начале). */
  tocAtEnd: boolean;
  dedication: string;
  chapterStart: ChapterStart;
  openersLeft: boolean;
  /** С какой страницы начинается глава: где выпадет, всегда слева, всегда справа (books.pagination_rev). */
  chapterSide: ChapterSide;
  /** Красная строка сейчас, em (с учётом стиля) и есть ли она у первого абзаца. */
  indent: number;
  indentFirst: boolean;
  leadIn: boolean;
  dropCap: DropCapKind;
  /** Настройки дизайнера страниц как в базе (правка — поверх). */
  interiorStyle: InteriorStyle;
  /** Фото в ответах по порядку книги (порядок внутри ответа — по positions). */
  photos: HelpEditPhoto[];
  /** Порядок всех фото книги (id) — для перестановки. */
  photoOrder: string[];
  /** Лист фото на отдельной странице заполняет «до краёв» или «целиком» — как в редакторе (photo-loss.defaultPageFit). */
  pageFit(photo: { width: number; height: number }): "contain" | undefined;
  /** Последний заказ книги (не отменённый) — для предупреждения о согласовании. */
  order: { status: string; approvalRequired: boolean; approvedAt: Date | null; revokedAt: Date | null } | null;
}

/** Почему правки за клиента недоступны: книга заказана (для модели — объяснить путь или передать менеджеру). */
export const HELP_EDITS_LOCKED = "книга заказана — правки в кабинете закрыты";

/** Сколько правок в одном предложении. */
export const HELP_EDITS_MAX = 16;
/** Предложение действует столько — потом клиент спрашивает заново (книга могла измениться). */
export const HELP_PROPOSAL_TTL_MS = 6 * 3_600_000;

/** Схема одной правки в ответе модели: строки, пустая — «не нужно» (строгая схема провайдера требует все поля). */
export const helpEditItemSchema = () =>
  ({
    type: "object",
    properties: {
      kind: { type: "string", enum: [...HELP_EDIT_KINDS] },
      photo: { type: "string" },
      target: { type: "string" },
      value: { type: "string" },
    },
    required: ["kind", "photo", "target", "value"],
    additionalProperties: false,
  }) as const;

const ON = new Set(["on", "true", "yes", "1", "вкл", "да"]);
const OFF = new Set(["off", "false", "no", "0", "выкл", "нет"]);
const flag = (v: string): boolean | null => (ON.has(v) ? true : OFF.has(v) ? false : null);
const str = (v: unknown) => (typeof v === "string" ? v.replace(/\r/g, "").trim() : "");

/**
 * Правки из ответа модели → проверенные правки по книге. problems — что не так (по-русски, для повторной просьбы
 * модели): незнакомая правка, чужое или не найденное фото, значение вне допустимого. Хоть одна ошибка — правок нет.
 */
export function parseHelpEdits(raw: unknown, book: HelpEditBook): { edits: HelpEdit[]; problems: string[] } {
  const problems: string[] = [];
  const list = Array.isArray(raw) ? raw : [];
  if (!list.length) return { edits: [], problems: ["action=propose без правок в edits"] };
  if (list.length > HELP_EDITS_MAX) problems.push(`больше ${HELP_EDITS_MAX} правок за раз`);
  if (book.status !== "draft") problems.push("книга заказана — правки в кабинете закрыты, только менеджер (handoff edit)");
  const byRef = new Map(book.photos.map((p) => [p.ref, p]));
  const edits: HelpEdit[] = [];
  for (const item of list.slice(0, HELP_EDITS_MAX)) {
    const r = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const kind = str(r.kind) as HelpEditKind;
    const value = str(r.value);
    const v = value.toLowerCase();
    if (!(HELP_EDIT_KINDS as readonly string[]).includes(kind)) {
      problems.push(`правки «${kind || "?"}» нет в списке — такое делает менеджер`);
      continue;
    }
    if (kind === "dedication") {
      if (value.length > DEDICATION_MAX) problems.push(`посвящение длиннее ${DEDICATION_MAX} знаков`);
      else edits.push({ kind, text: value });
      continue;
    }
    if (kind === "chapterStart") {
      if ((CHAPTER_STARTS as readonly string[]).includes(v)) edits.push({ kind, value: v as ChapterStart });
      else problems.push(`chapterStart: value — одно из ${CHAPTER_STARTS.join(", ")}`);
      continue;
    }
    if (kind === "indent") {
      const n = Number(v.replace(",", "."));
      if (Number.isFinite(n) && n >= LIMITS.indent[0] && n <= LIMITS.indent[1]) edits.push({ kind, value: Math.round(n * 10) / 10 });
      else problems.push(`indent: value — число em от ${LIMITS.indent[0]} до ${LIMITS.indent[1]}`);
      continue;
    }
    if (kind === "tocPlace") {
      if ((TOC_PLACES as readonly string[]).includes(v)) edits.push({ kind, value: v as TocPlace });
      else problems.push(`tocPlace: value — ${TOC_PLACES.join(" или ")}`);
      continue;
    }
    if (kind === "chapterSide") {
      if ((CHAPTER_SIDES as readonly string[]).includes(v)) edits.push({ kind, value: v as ChapterSide });
      else problems.push(`chapterSide: value — одно из ${CHAPTER_SIDES.join(", ")}`);
      continue;
    }
    if (kind === "dropCap") {
      if ((DROP_CAPS as readonly string[]).includes(v)) edits.push({ kind, value: v as DropCapKind });
      else problems.push(`dropCap: value — одно из ${DROP_CAPS.join(", ")}`);
      continue;
    }
    if (kind === "titlePage" || kind === "toc" || kind === "openersLeft" || kind === "indentFirst" || kind === "leadIn") {
      const on = flag(v);
      if (on === null) problems.push(`${kind}: value — on или off`);
      else edits.push({ kind, on });
      continue;
    }
    // Правки фото: только фото в ответах этой книги (по ссылке из списка «Фото в ответах»).
    const photo = byRef.get(str(r.photo).toLowerCase());
    if (!photo) {
      problems.push(`${kind}: фото «${str(r.photo) || "?"}» нет в списке фото в ответах этой книги`);
      continue;
    }
    if (kind === "photoPage" || kind === "photoBreak") {
      const on = flag(v);
      if (on === null) problems.push(`${kind}: value — on или off`);
      else edits.push({ kind, photo: photo.ref, on });
    } else if (kind === "photoSize") {
      if ((PHOTO_SIZE_WORDS as readonly string[]).includes(v)) edits.push({ kind, photo: photo.ref, value: v as PhotoSizeWord });
      else problems.push(`photoSize: value — одно из ${PHOTO_SIZE_WORDS.join(", ")}`);
    } else {
      const target = byRef.get(str(r.target).toLowerCase());
      if (!target || target.ref === photo.ref) problems.push("photoMove: target — другое фото из списка");
      else if (target.questionId !== photo.questionId) problems.push("photoMove: фото переставляются только внутри одного ответа");
      else if (v !== "before" && v !== "after") problems.push("photoMove: value — before или after");
      else edits.push({ kind, photo: photo.ref, target: target.ref, where: v });
    }
  }
  // Ничего не меняющие правки отбрасываются (клиенту нечего подтверждать); если не осталось ни одной — сказать модели.
  const real = edits.filter((e) => changes(e, book));
  if (!problems.length && !real.length) problems.push("в книге уже так — правка ничего не меняет, просто скажи об этом клиенту (action=answer)");
  return problems.length ? { edits: [], problems } : { edits: real, problems: [] };
}

/** Позиция фото в его ответе: 1-based и сколько всего. */
function orderInAnswer(book: HelpEditBook, ref: string): { n: number; total: number; list: HelpEditPhoto[] } {
  const p = book.photos.find((x) => x.ref === ref)!;
  const list = book.photos.filter((x) => x.questionId === p.questionId);
  return { n: list.indexOf(p) + 1, total: list.length, list };
}

/** Где окажется фото после перестановки (1-based). */
function movedIndex(book: HelpEditBook, e: Extract<HelpEdit, { kind: "photoMove" }>) {
  const { list } = orderInAnswer(book, e.photo);
  const rest = list.filter((x) => x.ref !== e.photo);
  const t = rest.findIndex((x) => x.ref === e.target);
  return (e.where === "before" ? t : t + 1) + 1;
}

const photoOf = (book: HelpEditBook, ref: string) => book.photos.find((p) => p.ref === ref)!;

/** Меняет ли правка книгу. */
function changes(e: HelpEdit, book: HelpEditBook): boolean {
  switch (e.kind) {
    case "titlePage":
      return e.on !== book.titlePage;
    case "toc":
      return e.on !== book.showToc;
    case "openersLeft":
      return e.on !== book.openersLeft;
    case "chapterSide":
      return e.value !== book.chapterSide;
    case "indentFirst":
      return e.on !== book.indentFirst;
    case "leadIn":
      return e.on !== book.leadIn;
    case "dedication":
      return e.text !== book.dedication.trim();
    case "chapterStart":
      return e.value !== book.chapterStart;
    case "tocPlace":
      return (e.value === "end") !== book.tocAtEnd;
    case "indent":
      return e.value !== book.indent;
    case "dropCap":
      return e.value !== book.dropCap;
    case "photoPage":
      return e.on !== !!photoOf(book, e.photo).inline.page;
    case "photoBreak":
      return e.on !== !!photoOf(book, e.photo).inline.breakBefore;
    case "photoSize":
      return PHOTO_SIZE_WIDTHS[e.value] !== photoOf(book, e.photo).inline.width;
    case "photoMove":
      return movedIndex(book, e) !== orderInAnswer(book, e.photo).n;
  }
}

// ─── подписи ───────────────────────────────────────────────────────────────

const short = (s: string, max = 60) => {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > max ? `${one.slice(0, max - 1)}…` : one;
};

/** Что изменится — строками «Настройка: было → станет» на языке сайта клиента (подписи — те же, что в редакторе). */
export function helpEditLines(edits: readonly HelpEdit[], book: HelpEditBook, lang: Locale): string[] {
  const m = messagesFor(lang);
  const a = m.help.actions;
  const el = m.design.pages.elements;
  const tx = m.design.pages.textTab;
  const pg = m.books.pages;
  const ph = m.editor.answerPhoto;
  const yn = (on: boolean) => (on ? a.on : a.off);
  const line = (label: string, from: string, to: string) => `${label}: ${from} → ${to}`;
  const em = (n: number) => (n ? `${String(n).replace(".", lang === "en" ? "." : ",")} ${tx.units.em}` : a.off);
  const photo = (ref: string) => {
    const { n, total } = orderInAnswer(book, ref);
    return a.photo(n, total, short(photoOf(book, ref).heading, 50));
  };
  return edits.map((e) => {
    switch (e.kind) {
      case "titlePage":
        return line(el.titlePagePrint, yn(book.titlePage), yn(e.on));
      case "toc":
        return line(pg.toc, yn(book.showToc), yn(e.on));
      case "openersLeft":
        return line(el.openersLeft, yn(book.openersLeft), yn(e.on));
      case "chapterSide":
        return line(el.chapterSide, el.chapterSides[book.chapterSide], el.chapterSides[e.value]);
      case "indentFirst":
        return line(tx.indentFirst, yn(book.indentFirst), yn(e.on));
      case "leadIn":
        return line(el.leadIn, yn(book.leadIn), yn(e.on));
      case "dedication":
        return line(pg.dedication, book.dedication.trim() ? `«${short(book.dedication, 40)}»` : a.empty, e.text ? `«${short(e.text, 200)}»` : a.empty);
      case "chapterStart":
        return line(el.chapterStart, el.chapterStarts[book.chapterStart], el.chapterStarts[e.value]);
      case "tocPlace":
        return line(pg.tocPlace, pg.tocPlaces[book.tocAtEnd ? "end" : "start"], pg.tocPlaces[e.value]);
      case "indent":
        return line(tx.indent, em(book.indent), em(e.value));
      case "dropCap":
        return line(el.dropCap, el.dropCaps[book.dropCap], el.dropCaps[e.value]);
      case "photoPage":
        return `${photo(e.photo)} — ${ph.how}: ${!photoOf(book, e.photo).inline.page ? ph.inText : ph.onPage} → ${e.on ? ph.onPage : ph.inText}`;
      case "photoBreak":
        return `${photo(e.photo)} — ${line(ph.breakBefore, yn(!!photoOf(book, e.photo).inline.breakBefore), yn(e.on))}`;
      case "photoSize":
        return `${photo(e.photo)} — ${line(ph.size, ph.sizes[photoSizeWord(photoOf(book, e.photo).inline.width)], ph.sizes[e.value])}`;
      case "photoMove": {
        const { n, total } = orderInAnswer(book, e.photo);
        return `${photo(e.photo)} — ${line(ph.order, ph.orderOf(n, total), ph.orderOf(movedIndex(book, e), total))}`;
      }
    }
  });
}

/**
 * Предупреждение к правке книги с заказом (как «Открыть для правок» в заказе): макет согласован — правка снимет
 * согласование; заказ ждёт согласования или в работе — после правок макет нужно проверить и согласовать заново.
 */
export function helpEditWarning(order: HelpEditBook["order"], lang: Locale): string | null {
  if (!order || order.status === "cancelled") return null;
  const a = messagesFor(lang).help.actions;
  if (order.approvedAt && !order.revokedAt) return a.warnApproved;
  if (order.approvalRequired && ["pending_payment", "paid", "in_production"].includes(order.status)) return a.warnOrder;
  return null;
}

// ─── план правки для сервисов authoring ────────────────────────────────────

export interface HelpEditPlan {
  /** Настройки книги для BooksService.updateSettings (пусто — не звать). */
  settings: { titlePage?: boolean; showToc?: boolean; dedication?: string; chapterStart?: ChapterStart; openersLeft?: boolean; chapterSide?: ChapterSide; interiorStyle?: InteriorStyle };
  /** Правки фото для PhotosService.batch: вид фото в ответе целиком (inline), как пишет редактор. */
  photos: { id: string; patch: { inline: InlinePhotoStyle } }[];
  /** Новый порядок всех фото книги для PhotosService.reorder; null — порядок не меняется. */
  order: string[] | null;
}

/** Проверенные правки → вызовы штатных сервисов (по книге, какая она сейчас). */
export function planHelpEdits(edits: readonly HelpEdit[], book: HelpEditBook): HelpEditPlan {
  const settings: HelpEditPlan["settings"] = {};
  let style = book.interiorStyle;
  let styleTouched = false;
  const inline = new Map<string, InlinePhotoStyle>();
  let order: string[] | null = null;
  const inl = (ref: string) => {
    const p = photoOf(book, ref);
    if (!inline.has(p.id)) inline.set(p.id, { ...p.inline });
    return inline.get(p.id)!;
  };
  for (const e of edits) {
    switch (e.kind) {
      case "titlePage":
        settings.titlePage = e.on;
        break;
      case "toc":
        settings.showToc = e.on;
        break;
      case "openersLeft":
        settings.openersLeft = e.on;
        break;
      case "chapterSide":
        settings.chapterSide = e.value;
        break;
      case "dedication":
        settings.dedication = e.text;
        break;
      case "chapterStart":
        settings.chapterStart = e.value;
        break;
      case "tocPlace":
        // «В начале» — как у книг без настройки: ключ убирается.
        style = patchSection(style, "elements", { toc: e.value === "end" ? "end" : undefined });
        styleTouched = true;
        break;
      case "indent":
        style = patchSection(style, "body", { indent: e.value });
        styleTouched = true;
        break;
      case "indentFirst":
        style = patchSection(style, "body", { indentFirst: e.on });
        styleTouched = true;
        break;
      case "leadIn":
        style = patchSection(style, "elements", { leadIn: e.on });
        styleTouched = true;
        break;
      case "dropCap":
        style = patchSection(style, "elements", { dropCap: e.value });
        styleTouched = true;
        break;
      case "photoPage": {
        const s = inl(e.photo);
        const p = photoOf(book, e.photo);
        if (e.on) Object.assign(s, { page: true, pageFit: book.pageFit(p) });
        else delete s.page;
        break;
      }
      case "photoBreak":
        inl(e.photo).breakBefore = e.on;
        break;
      case "photoSize":
        inl(e.photo).width = PHOTO_SIZE_WIDTHS[e.value];
        break;
      case "photoMove": {
        const p = photoOf(book, e.photo);
        const t = photoOf(book, e.target);
        // Рядом с соседом и после того же абзаца, что он (иначе фото останется у своего абзаца).
        inl(e.photo).anchor = inline.get(t.id)?.anchor ?? t.inline.anchor;
        const ids: string[] = (order ?? book.photoOrder).filter((id) => id !== p.id);
        const at = ids.indexOf(t.id);
        ids.splice(e.where === "before" ? at : at + 1, 0, p.id);
        order = ids;
        break;
      }
    }
  }
  if (styleTouched) settings.interiorStyle = style;
  return { settings, photos: [...inline].map(([id, s]) => ({ id, patch: { inline: normalizeStyle(s) } })), order };
}

/** Правки без ссылок модели (p1…) — с id фото: так они хранятся в журнале и применяются позже по свежей книге. */
export function editsWithIds(edits: readonly HelpEdit[], book: HelpEditBook): HelpEdit[] {
  const id = (ref: string) => photoOf(book, ref).id;
  return edits.map((e) => (e.kind === "photoMove" ? { ...e, photo: id(e.photo), target: id(e.target) } : "photo" in e ? { ...e, photo: id(e.photo) } : e));
}

/** Обратно: правки с id фото → со ссылками по свежей книге; фото нет (удалили, убрали из ответа) — null. */
export function editsWithRefs(edits: readonly HelpEdit[], book: HelpEditBook): HelpEdit[] | null {
  const byId = new Map(book.photos.map((p) => [p.id, p.ref]));
  const out: HelpEdit[] = [];
  for (const e of edits) {
    if (!("photo" in e)) {
      out.push(e);
      continue;
    }
    const photo = byId.get(e.photo);
    if (!photo) return null;
    if (e.kind === "photoMove") {
      const target = byId.get(e.target);
      if (!target) return null;
      out.push({ ...e, photo, target });
    } else out.push({ ...e, photo });
  }
  return out;
}

/** Правки из журнала (JSON) → снова в модельный вид для проверки: value строкой, как отвечает модель. */
export function editsToRaw(edits: readonly HelpEdit[]): { kind: string; photo: string; target: string; value: string }[] {
  return edits.map((e) => {
    const photo = "photo" in e ? e.photo : "";
    const target = e.kind === "photoMove" ? e.target : "";
    const value = "on" in e ? (e.on ? "on" : "off") : e.kind === "dedication" ? e.text : e.kind === "photoMove" ? e.where : String(e.value);
    return { kind: e.kind, photo, target, value };
  });
}
