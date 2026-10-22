/**
 * Оглавление книги: какие строки в нём стоят и с какими названиями. Модуль общий для сервера и браузера —
 * по нему печатает PDF (interior/toc.tsx), рисуют превью разворота и 3D-книги и считается объём.
 *
 * Автор выбирает режим (tocMode) и для любой строки может задать своё название или скрыть её (tocLines).
 * Глава — часть книги: её название меняется во всей книге, скрытая глава убирается (истории идут дальше в
 * предыдущей) — это делает сборка содержимого (layout.ts, foldChapters). Строка раздела меняется только в оглавлении.
 */
import type { BookContent } from "./layout";

export const TOC_MODES = ["chapters", "sections", "both"] as const;
/** По главам; по заголовкам разделов; главы и под ними заголовки разделов. */
export type TocMode = (typeof TOC_MODES)[number];

export const isTocMode = (v: unknown): v is TocMode => (TOC_MODES as readonly unknown[]).includes(v);

/** Настройка строки: своё название (пустое — как в книге) и «не показывать в оглавлении». */
export interface TocLineSetting {
  title?: string;
  hidden?: boolean;
  /** Свой эпиграф главы (только у строк глав) — на начальной полосе вместо эпиграфа темы. */
  epigraph?: string;
  /**
   * Автор решил начать главу без фото (только у строк глав): редактор больше не предлагает выбрать фото главы.
   * Не вёрстка — в содержимое книги не идёт (layout.ts, tocSettings) и не действует, когда фото главы выбрано.
   */
  noOpenerPhoto?: boolean;
}
/** Настройки строк по ключу строки (tocKey). */
export type TocLines = Record<string, TocLineSetting>;

export const TOC_TITLE_MAX = 200;
export const TOC_EPIGRAPH_MAX = 300;
/** Строк с настройками в одной книге — с запасом: в книге сотни разделов не бывает. */
export const TOC_LINES_MAX = 400;

/** Ключ строки: глава — `c:<ключ главы>` (галерея — `c:__gallery`), раздел — `q:<id ответа или письма>`. */
export const tocKey = {
  chapter: (key: string) => `c:${key}`,
  section: (id: string) => `q:${id}`,
};
const KEY = /^[cq]:[\w-]{1,80}$/;

/** Ключ галереи в номерах страниц (как у начальной полосы галереи в PDF). */
export const GALLERY_KEY = "__gallery";

/**
 * Строка-кандидат: всё, что может попасть в оглавление, до режима и настроек автора.
 * pageKey — по нему ищется номер страницы: у главы — ключ главы, у раздела — ключ строки.
 */
export interface TocCandidate {
  key: string;
  pageKey: string;
  kind: "chapter" | "section";
  /** Номер главы; у галереи и разделов — null. */
  number: number | null;
  /** Название по умолчанию: название главы или заголовок раздела (у раздела без заголовка — пусто). */
  label: string;
  /** Глава раздела (ключ строки главы) — для вложенного режима и редактора. */
  parent?: string;
  /** Глава убрана автором (её истории — в предыдущей): в оглавлении её нет, редактор показывает её, чтобы вернуть. */
  folded?: boolean;
  /** Первая глава: убрать её некуда — скрытие действует только на оглавление. */
  first?: boolean;
  /** Эпиграф главы по книге (до своего) — подсказка редактору; у разделов нет. */
  epigraph?: string;
}

/** Строка, которая печатается: level 1 — раздел под главой в режиме «главы и заголовки». */
export interface TocLine {
  key: string;
  pageKey: string;
  level: 0 | 1;
  number: number | null;
  label: string;
}

/** Все кандидаты по порядку книги: глава, её разделы, следующая глава…, в конце галерея. */
export function tocCandidates(content: Pick<BookContent, "chapters" | "galleryPhotos" | "galleryTitle">): TocCandidate[] {
  const out: TocCandidate[] = [];
  content.chapters.forEach((ch, i) => {
    let parent = tocKey.chapter(ch.key);
    const epigraph = ch.defaultEpigraph ?? ch.epigraph;
    out.push({ key: parent, pageKey: ch.key, kind: "chapter", number: ch.number, label: ch.defaultTitle ?? ch.title, ...(i === 0 ? { first: true } : {}), ...(epigraph ? { epigraph } : {}) });
    ch.items.forEach((it, at) => {
      for (const f of ch.folded ?? []) {
        if (f.at !== at) continue;
        parent = tocKey.chapter(f.key);
        out.push({ key: parent, pageKey: f.key, kind: "chapter", number: null, label: f.title, folded: true });
      }
      // Продолжение истории после фото на всю страницу — та же история, отдельной строкой её нет.
      if (it.continued) return;
      const key = tocKey.section(it.id);
      out.push({ key, pageKey: key, kind: "section", number: null, label: it.heading ?? "", parent });
    });
  });
  if (content.galleryPhotos.length) out.push({ key: tocKey.chapter(GALLERY_KEY), pageKey: GALLERY_KEY, kind: "chapter", number: null, label: content.galleryTitle });
  return out;
}

/** Попадает ли кандидат в оглавление этого режима (до скрытия автором). Галерея — во всех режимах. */
export function inMode(c: Pick<TocCandidate, "kind" | "pageKey">, mode: TocMode) {
  if (mode === "both") return true;
  if (mode === "chapters") return c.kind === "chapter";
  return c.kind === "section" || c.pageKey === GALLERY_KEY;
}

/**
 * Строки оглавления: режим, скрытые строки и свои названия. Строка без названия (раздел без заголовка, которому
 * автор не дал названия) не печатается. В режиме «по заголовкам» номеров нет: нумеруются только главы.
 */
export function selectToc(candidates: readonly TocCandidate[], mode: TocMode, lines: TocLines): TocLine[] {
  // Номера глав — подряд по оставшимся главам: убранная глава номер не занимает (в редакторе видно сразу, до сохранения).
  let chapterNo = 0;
  return candidates.flatMap((c): TocLine[] => {
    const s = lines[c.key];
    if (isRemovedChapter(c, lines)) return [];
    const number = c.kind === "chapter" && c.pageKey !== GALLERY_KEY ? ++chapterNo : null;
    if (!inMode(c, mode) || s?.hidden) return [];
    const label = s?.title?.trim() || c.label;
    if (!label) return [];
    return [{ key: c.key, pageKey: c.pageKey, level: mode === "both" && c.kind === "section" ? 1 : 0, number: mode === "sections" ? null : number, label }];
  });
}

/**
 * Глава убрана из книги: автор скрыл её строку (кроме первой и галереи — их убрать некуда). По текущим настройкам, а не
 * по folded: вернул главу в редакторе — она сразу на месте, хотя образец собран ещё с убранной.
 */
export function isRemovedChapter(c: Pick<TocCandidate, "kind" | "key" | "pageKey" | "first">, lines: TocLines) {
  return c.kind === "chapter" && !!lines[c.key]?.hidden && !c.first && c.pageKey !== GALLERY_KEY;
}

/**
 * Название альбома в конце, как его печатает книга: своё (название строки альбома в оглавлении) или по умолчанию.
 * Одно на начальную полосу альбома в PDF, строку оглавления, образец «Страниц» и превью редактора.
 */
export const printedGalleryTitle = (content: Pick<BookContent, "galleryTitle" | "tocLines">) => content.tocLines?.[tocKey.chapter(GALLERY_KEY)]?.title || content.galleryTitle;

/** Оглавление книги по её настройкам. */
export function bookToc(content: BookContent): TocLine[] {
  return selectToc(tocCandidates(content), content.tocMode ?? "chapters", content.tocLines ?? {});
}

/** Есть ли в книге страница оглавления: включено, в книге есть главы и в оглавлении осталась хоть одна строка. */
export const hasToc = (content: BookContent) => content.showToc && content.chapters.length > 0 && bookToc(content).length > 0;

/** Настроено ли оглавление не по умолчанию (по главам, без своих строк). */
export const isCustomToc = (mode: TocMode, lines: TocLines) => mode !== "chapters" || Object.keys(lines).length > 0;

/**
 * Настройки строк из запроса: только известный вид ключа, название не длиннее TOC_TITLE_MAX, пустые настройки
 * не хранятся. Что строки нет в книге (раздел удалён) — не ошибка: настройка просто не применится.
 */
export function parseTocLines(raw: unknown): TocLines {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: TocLines = {};
  for (const [key, v] of Object.entries(raw as Record<string, unknown>).slice(0, TOC_LINES_MAX)) {
    if (!KEY.test(key) || !v || typeof v !== "object") continue;
    const { title, hidden, epigraph, noOpenerPhoto } = v as Record<string, unknown>;
    const s: TocLineSetting = {};
    if (typeof title === "string" && title.trim()) s.title = title.trim().slice(0, TOC_TITLE_MAX);
    if (hidden === true) s.hidden = true;
    if (key.startsWith("c:") && typeof epigraph === "string" && epigraph.trim()) s.epigraph = epigraph.trim().slice(0, TOC_EPIGRAPH_MAX);
    if (key.startsWith("c:") && noOpenerPhoto === true) s.noOpenerPhoto = true;
    if (s.title !== undefined || s.hidden || s.epigraph !== undefined || s.noOpenerPhoto) out[key] = s;
  }
  return out;
}

/** Кандидат с примерным номером страницы — для превью, где книгу не верстают. */
export type SampleTocCandidate = TocCandidate & { page: number };

/** Строка оглавления в превью (разворот «Оглавление» на сайте). */
export interface SampleTocLine {
  /** Нет — у статичного примера на лендинге. */
  key?: string;
  title: string;
  number: number | null;
  level?: 0 | 1;
  page: number;
}

/** Строки оглавления для разворота: на странице помещается не больше полосы — лишнее всё равно обрезается. */
export function sampleToc(all: readonly SampleTocCandidate[], mode: TocMode, lines: TocLines): SampleTocLine[] {
  const page = new Map(all.map((c) => [c.key, c.page]));
  return selectToc(all, mode, lines)
    .slice(0, 24)
    .map((l) => ({ key: l.key, title: l.label, number: l.number, level: l.level, page: page.get(l.key) ?? 0 }));
}
