/**
 * Модель редактора вопросов: вопросы и фото в том виде, в каком их показывает редактор, главы превью.
 * Один код для страницы books/[id]/questions, самого QuestionsEditor и стенда html-snapshot (scripts/visual).
 * Данные со страницы готовит editorModel (editor-data.ts) — он тянет каталог тем и в браузер не попадает.
 */
import type { Locale } from "@/i18n/config";
import { printedGalleryTitle, tocKey, type TocLines, type TocMode } from "./toc";
import type { BookKind } from "@/lib/content/kinds";
import { photoUrl } from "@/lib/urls";
import { normalizeMedia } from "./answer-media";
import { isChapterPhotoKey, photoPages, type BookContent, type CoverPhotos, type PhotoItem } from "./layout";
import type { PhotoCrop } from "./photo-crop";
import type { AnswerMedia, Book, InlinePhotoStyle, Photo } from "@/shared/infrastructure/db/schema";

export interface EditorQuestion {
  id: string;
  chapter: string;
  /** Название главы (у глав автора — как есть, может быть пустым: подпись даёт sectionLabel/словарь). */
  chapterTitle: string;
  /** Вопрос автору (в роде автора и адресата); у раздела своей книги — подсказка для себя, чаще всего ''. */
  prompt: string;
  hint: string | null;
  /** Заголовок в книге (у раздела своей книги — его заголовок, может быть ''). */
  defaultTitle: string;
  displayText: string | null;
  hideHeading: boolean;
  answer: string;
  /** Видео и музыка в ответе — QR-коды в книге (answer-media.ts). */
  media: AnswerMedia[];
  /** Свой вопрос или раздел своей книги: текст автора, его можно удалить, род в нём не подставляется. */
  isCustom: boolean;
}

/**
 * Глава в редакторе. У своей книги (kind blank) — главы автора из book_chapters, в их порядке и вместе с пустыми;
 * у книг с банком — главы темы в порядке вопросов (own = false: их нельзя переименовать, переставить и удалить).
 */
export interface EditorChapter {
  key: string;
  title: string;
  /** Эпиграф главы ('' — нет). */
  epigraph: string;
  own: boolean;
}

/**
 * Фото книги в редакторе — все, и снимки обложки тоже (у фото одно место, обложка его не забирает). Где фото стоит
 * в книге, говорит photoPlaceOf по собранной книге (useBookContent: places), а не поля chapter и opener: служебные
 * ключи мест знает только сборка (R6).
 */
export interface EditorPhoto {
  id: string;
  width: number;
  height: number;
  caption: string;
  layout: "full" | "bleed" | "half" | "grid";
  questionId: string | null;
  inline?: InlinePhotoStyle | null;
  /** Кадр автора (photo-crop.ts); null — по правилу места. */
  crop: PhotoCrop | null;
  /** Место вне ответа, выбранное автором (photos.chapter); null — по правилу книги. Только для сборки и правок. */
  chapter: string | null;
  /** Отмечено автором как фото главы chapter (печатается им, если у оформления есть фото главы). */
  opener: boolean;
  /** Снимок виден на обложке или обороте (cover-photos.ts: shownCoverPhotos — считает страница); null — нет. */
  onCover: "cover" | "back" | null;
  /** Счётчик поворотов — сбрасывает кэш картинки в браузере. */
  rev?: number;
}

/** Строка фото с сервера (страница, ответы API фото) — из неё получается EditorPhoto. */
export type EditorPhotoRow = Pick<Photo, "id" | "width" | "height" | "caption" | "layout" | "questionId"> & Partial<Pick<Photo, "inline" | "crop" | "chapter" | "opener">>;

/** Правка фото — поля PATCH …/photos/[pid] и POST …/photos/batch (api/books/[id]/photos/patch.ts). */
export type EditorPhotoPatch = Partial<Pick<EditorPhoto, "caption" | "layout" | "questionId" | "crop" | "chapter" | "opener">> & { inline?: InlinePhotoStyle | null };

/**
 * Прежние значения фото, которые затронула правка, — «Отменить» (R12) отправляет их обратно: место (ответ, глава,
 * фото главы) и кадр всегда, остальные поля — если их правили. Вид в ответе (inline) при переносе остаётся на фото,
 * поэтому возврат в ответ восстанавливает и размер, и место в тексте.
 */
export type PhotoUndo = ({ id: string } & EditorPhotoPatch)[];

export interface EditorBook {
  id: string;
  format: string;
  /** Оформление страниц — id из lib/book/interiors. */
  interior: string;
  /** Настройки дизайнера страниц поверх стиля (interiors/style.ts). */
  interiorStyle?: unknown;
  dedication: string;
  showToc: boolean;
  /** Оглавление по-своему (toc.ts): от него зависит, сколько полос оно займёт. */
  tocMode?: TocMode;
  tocLines?: TocLines;
  photoPlacement: "chapters" | "end" | "none";
  title: string;
  /** Язык книги: вопросы, заголовки и превью — на нём; интерфейс редактора — на языке сайта. */
  language: Locale;
  /** Имена автора и адресата — проверка орфографии их не отмечает. */
  names?: string[];
  /** Тема и род автора и адресата: по ним собирается содержимое книги для оценки объёма (главы темы, заголовки вопросов). */
  theme: Book["theme"];
  /** Вид книги (lib/content/kinds): у своей книги — оглавление автора, разделы вместо вопросов, прогресс по словам. */
  kind: BookKind;
  authorGender: Book["authorGender"];
  recipientGender: Book["recipientGender"];
  /** Правила раскладки фото (layout.ts, LAYOUT_REV_2); нет — прежние. Редактор собирает книгу по ним, как PDF. */
  layoutRev?: Book["layoutRev"];
  /** Снимки обложки и оборота (ссылки книги): правила 2 не ставят их внутрь сами. */
  coverPhotoId?: string | null;
  coverPhotoExtra?: string[];
  backPhotoId?: string | null;
  backPhotoExtra?: string[];
  /**
   * Снимки, которые обложка и оборот печатают на самом деле (cover-photos.ts: shownCoverPhotos) — считает страница:
   * каталог обложек в браузер не идёт. Нет — обложкой считаются все выбранные для неё снимки.
   */
  coverPhotos?: CoverPhotos;
}

export interface PreviewPhoto {
  id: string;
  url: string;
  width: number;
  height: number;
  caption: string;
  inline?: InlinePhotoStyle | null;
}

/** Ответ в вёрстке превью: заголовок, текст, фото и QR-коды в ответе. */
export interface PreviewEntry {
  id: string;
  heading: string | null;
  answer: string;
  photos: PreviewPhoto[];
  media: AnswerMedia[];
}

/** Снимок на полосе превью вне текста (начало главы, страницы фото) — как PagePhoto вёрстки книги. */
export interface PreviewPagePhoto {
  id: string;
  url: string;
  width: number;
  height: number;
  caption: string;
  layout: EditorPhoto["layout"];
  /** Кадр автора; нет — по правилу места. */
  crop?: PhotoCrop;
  /** Лист «под обрез» целиком, с полями (вид из ответа: pageFit contain) — как в PDF. */
  contain?: boolean;
  inline?: InlinePhotoStyle | null;
  /** Место выбрано правилом книги, а не автором (чип «само»). */
  auto?: boolean;
}

export interface PreviewChapter {
  key: string;
  number: number;
  title: string;
  epigraph?: string;
  entries: PreviewEntry[];
  /** Фото главы на начальной полосе (из сборки книги); нет — полоса с названием, как в печати. */
  openerPhoto?: PreviewPagePhoto;
  /** Страницы фото после текста главы (photoPages) — те же, что в PDF. */
  photoPages?: PreviewPagePhoto[][];
}

/** Альбом в конце книги в превью: начальная полоса без номера и страницы фото. */
export interface PreviewGallery {
  title: string;
  photos: number;
  pages: PreviewPagePhoto[][];
}

/** Подряд идущие вопросы одной главы; i — номер вопроса в списке редактора. */
export interface ChapterGroup {
  key: string;
  title: string;
  items: { q: EditorQuestion; i: number }[];
}

/** Заголовок вопроса в книге: свой текст автора, иначе заголовок вопроса; null — заголовок скрыт. */
export function editorHeading(q: Pick<EditorQuestion, "hideHeading" | "displayText" | "defaultTitle">) {
  return q.hideHeading ? null : (q.displayText ?? q.defaultTitle);
}

/**
 * Подпись вопроса или раздела в оглавлении, навигации, фото и на хабе — никогда не пустая. Своя книга (blank):
 * заголовок в книге, иначе подсказка, иначе untitled (подсказка чаще всего пустая, заголовок тоже бывает пустым).
 * Книги с банком: как прежде — вопрос, а если он пуст — заголовок.
 */
export function sectionLabel(q: Pick<EditorQuestion, "hideHeading" | "displayText" | "defaultTitle" | "prompt">, kind: BookKind, untitled: string) {
  const heading = editorHeading(q)?.trim() || q.defaultTitle.trim();
  return (kind === "blank" ? heading || q.prompt.trim() : q.prompt.trim() || heading) || untitled;
}

/**
 * Открытый раздел: ?s=<id> (id раздела, не меняется при перестановке) или прежнее ?q=N (номер, для старых ссылок хаба и писем).
 * Неизвестный id — первый раздел. Параметры могут быть и массивами, и мусором: берётся только строка.
 */
export function sectionIndex(ids: readonly string[], s?: string | string[], q?: string | string[]): number {
  const byId = typeof s === "string" ? ids.indexOf(s) : -1;
  if (byId >= 0) return byId;
  const n = Number(typeof q === "string" ? q : "");
  return Number.isFinite(n) && n >= 1 ? Math.min(Math.floor(n), Math.max(ids.length, 1)) - 1 : 0;
}

export function editorPhotoUrl(p: Pick<EditorPhoto, "id" | "rev">) {
  return photoUrl(p.id) + (p.rev ? `&v=${p.rev}` : "");
}

/**
 * Главы редактора. Со списком глав (своя книга) — по нему, включая пустые главы; разделы, чья глава пропала, — в конце
 * своими группами (как их собирает печать). Без списка — подряд идущие вопросы одной главы.
 */
export function groupByChapter(questions: EditorQuestion[], chapters?: readonly Pick<EditorChapter, "key" | "title">[]): ChapterGroup[] {
  if (chapters) {
    const groups = new Map<string, ChapterGroup>(chapters.map((c) => [c.key, { key: c.key, title: c.title, items: [] }]));
    const lost: ChapterGroup[] = [];
    questions.forEach((q, i) => {
      let g = groups.get(q.chapter) ?? lost.find((x) => x.key === q.chapter);
      if (!g) lost.push((g = { key: q.chapter, title: q.chapterTitle, items: [] }));
      g.items.push({ q, i });
    });
    return [...groups.values(), ...lost];
  }
  const groups: ChapterGroup[] = [];
  questions.forEach((q, i) => {
    let g = groups[groups.length - 1];
    if (!g || g.key !== q.chapter) groups.push((g = { key: q.chapter, title: q.chapterTitle, items: [] }));
    g.items.push({ q, i });
  });
  return groups;
}

/**
 * Вся книга для превью: главы только с заполненными ответами или фото (как в PDF) плюс текущий вопрос, даже пустой.
 * Фото — только вставленные в ответы.
 */
export function previewChapters(groups: ChapterGroup[], photos: EditorPhoto[], epigraphs: Record<string, string>, currentId: string | null, untitled = ""): PreviewChapter[] {
  const toPhoto = (p: EditorPhoto): PreviewPhoto => ({ id: p.id, url: editorPhotoUrl(p), width: p.width, height: p.height, caption: p.caption, inline: p.inline });
  const chapters: PreviewChapter[] = [];
  for (const g of groups) {
    const entries = g.items
      .map(({ q }) => ({ q, ph: photos.filter((p) => p.questionId === q.id) }))
      .filter(({ q, ph }) => q.id === currentId || q.answer.trim() || ph.length || q.media.length)
      .map(({ q, ph }) => ({ id: q.id, heading: editorHeading(q), answer: q.answer, photos: ph.map(toPhoto), media: normalizeMedia(q.media) }));
    if (entries.length) chapters.push({ key: g.key, number: chapters.length + 1, title: g.title.trim() || untitled, epigraph: epigraphs[g.key], entries });
  }
  return chapters;
}

/**
 * Вся книга для превью — по сборке книги (editorContent, та же, что у PDF): главы в порядке и под названиями печати
 * (свои названия, убранные главы влиты в предыдущую), фото в ответах — только те, что сборка там печатает (снимок
 * обложки в ответе по прежним правилам не виден), фото главы с кадром, страницы фото после глав и альбом в конце.
 * Текст ответов — из вопросов редактора (живой, с исходными местами фото в тексте). Текущий вопрос, даже пустой, —
 * в своей главе (глава без текста встаёт по порядку вопросов). places — места фото (photoPlaceOf): чип «само».
 */
export function previewFromContent(
  content: Pick<BookContent, "chapters" | "galleryPhotos" | "galleryTitle" | "tocLines">,
  questions: readonly EditorQuestion[],
  photos: readonly EditorPhoto[],
  opts: { currentId: string | null; tocLines?: TocLines; epigraphs?: Record<string, string>; untitled?: string; places?: ReadonlyMap<string, { auto: boolean }> },
): { chapters: PreviewChapter[]; gallery: PreviewGallery | null } {
  const qById = new Map(questions.map((q) => [q.id, q]));
  const qIndex = new Map(questions.map((q, i) => [q.id, i]));
  const pById = new Map(photos.map((p) => [p.id, p]));
  const toPhoto = (p: EditorPhoto): PreviewPhoto => ({ id: p.id, url: editorPhotoUrl(p), width: p.width, height: p.height, caption: p.caption, inline: p.inline });
  const pagePhoto = (it: PhotoItem): PreviewPagePhoto => {
    const rev = pById.get(it.id)?.rev;
    return {
      id: it.id,
      // Снимок на всю полосу — крупнее миниатюры в ответе.
      url: photoUrl(it.id, "view") + (rev ? `&v=${rev}` : ""),
      width: it.width,
      height: it.height,
      caption: it.caption,
      layout: it.layout,
      ...(it.crop ? { crop: it.crop } : {}),
      // Лист под обрез целиком — как у PDF (photo-page.tsx): вид «целиком, с полями» из ответа.
      ...(it.layout === "bleed" && it.inline?.pageFit === "contain" ? { contain: true } : {}),
      inline: it.inline ?? null,
      ...(opts.places?.get(it.id)?.auto ? { auto: true } : {}),
    };
  };
  const entryOf = (q: EditorQuestion, shown: ReadonlySet<string>): PreviewEntry => ({
    id: q.id,
    heading: editorHeading(q),
    answer: q.answer,
    photos: photos.filter((p) => p.questionId === q.id && shown.has(p.id)).map(toPhoto),
    media: normalizeMedia(q.media),
  });

  const chapters: PreviewChapter[] = content.chapters.map((ch) => {
    // Части одной истории (продолжение после фото на всю страницу) — снова одна история: превью режет её само.
    const parts: { id: string; items: typeof ch.items }[] = [];
    for (const it of ch.items) {
      const last = parts[parts.length - 1];
      if (it.continued && last) last.items.push(it);
      else parts.push({ id: it.id, items: [it] });
    }
    const entries = parts.map(({ id, items }) => {
      const q = qById.get(id);
      if (!q) return { id, heading: items[0].heading, answer: items.map((x) => x.answer).join("\n"), photos: [], media: [] };
      const shown = new Set(items.flatMap((x) => [...(x.photos ?? []), ...(x.photoBefore ? [x.photoBefore] : [])].map((p) => p.id)));
      return entryOf(q, shown);
    });
    return {
      key: ch.key,
      number: ch.number,
      title: ch.title,
      ...(ch.epigraph ? { epigraph: ch.epigraph } : {}),
      entries,
      ...(ch.openerPhoto ? { openerPhoto: pagePhoto(ch.openerPhoto) } : {}),
      photoPages: photoPages(ch.photos).map((g) => g.map(pagePhoto)),
    };
  });

  // Текущий вопрос без текста и фото в книгу не идёт — в превью он всё равно виден, на своём месте.
  const cur = opts.currentId ? qById.get(opts.currentId) : undefined;
  if (cur && !chapters.some((c) => c.entries.some((e) => e.id === cur.id))) {
    const at = qIndex.get(cur.id)!;
    const entry = entryOf(cur, new Set());
    const host = content.chapters.findIndex((c) => c.key === cur.chapter || c.folded?.some((f) => f.key === cur.chapter));
    if (host >= 0) {
      const list = chapters[host].entries;
      const i = list.findIndex((e) => (qIndex.get(e.id) ?? -1) > at);
      list.splice(i < 0 ? list.length : i, 0, entry);
    } else {
      // Глава ещё без текста: перед первой главой, чьи вопросы идут позже (письма — всегда последние).
      const i = chapters.findIndex((c) => c.entries.some((e) => !qIndex.has(e.id)) || c.entries.some((e) => (qIndex.get(e.id) ?? -1) > at));
      const own = opts.tocLines?.[tocKey.chapter(cur.chapter)]?.title?.trim();
      chapters.splice(i < 0 ? chapters.length : i, 0, { key: cur.chapter, number: 0, title: own || cur.chapterTitle.trim() || opts.untitled || "", epigraph: opts.epigraphs?.[cur.chapter] || undefined, entries: [entry], photoPages: [] });
      chapters.forEach((c, n) => (c.number = n + 1));
    }
  }

  const gallery = content.galleryPhotos.length
    ? {
        title: printedGalleryTitle(content),
        photos: content.galleryPhotos.length,
        pages: photoPages(content.galleryPhotos).map((g) => g.map(pagePhoto)),
      }
    : null;
  return { chapters, gallery };
}

/** Виден ли снимок на обложке или обороте — по снимкам, которые они печатают (EditorBook.coverPhotos). */
export function coverPlaceOf(id: string, cover: CoverPhotos | undefined): EditorPhoto["onCover"] {
  return cover?.front.includes(id) ? "cover" : cover?.back.includes(id) ? "back" : null;
}

/** Фото редактора из строки фото с сервера; onCover — с обложки книги (у только что загруженного фото — null). */
export function toEditorPhoto(p: EditorPhotoRow, onCover: EditorPhoto["onCover"] = null, rev?: number): EditorPhoto {
  return {
    id: p.id,
    width: p.width,
    height: p.height,
    caption: p.caption,
    layout: p.layout,
    questionId: p.questionId,
    inline: p.inline ?? null,
    crop: p.crop ?? null,
    chapter: p.chapter ?? null,
    opener: !!p.opener,
    onCover,
    ...(rev ? { rev } : {}),
  };
}

/**
 * Строки фото с сервера (ответ правки, пачки, загрузки) — в список редактора: знакомые фото заменяются (номер поворота
 * и снимок обложки остаются), новые идут в конец — как их позиции в книге.
 */
export function mergePhotoRows(photos: readonly EditorPhoto[], rows: readonly EditorPhotoRow[]): EditorPhoto[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const known = new Set(photos.map((p) => p.id));
  return [
    ...photos.map((p) => {
      const r = byId.get(p.id);
      return r ? toEditorPhoto(r, p.onCover, p.rev) : p;
    }),
    ...rows.filter((r) => !known.has(r.id)).map((r) => toEditorPhoto(r)),
  ];
}

/**
 * Все строки фото книги с сервера (перевод на правила раскладки 2 или сверка версии, POST …/layout) — новый список
 * редактора в их порядке: перевод мог закрепить места и перенумеровать позиции, а сборка раскладывает фото по порядку
 * списка. Номер поворота и снимок обложки знакомых фото остаются; фото, которого на сервере уже нет, уходит.
 */
export function layoutPhotoRows(photos: readonly EditorPhoto[], rows: readonly EditorPhotoRow[]): EditorPhoto[] {
  const byId = new Map(photos.map((p) => [p.id, p]));
  return rows.map((r) => {
    const p = byId.get(r.id);
    return toEditorPhoto(r, p?.onCover ?? null, p?.rev);
  });
}

/**
 * Правки фото в списке редактора — по тем же правилам, что сервер (Photo.update и clearOpeners): вставленное в ответ
 * фото теряет главу и отметку фото главы; отметка — только у фото с настоящей главой (не альбом, не «не печатается»,
 * не письма) и не в ответе; снятая отметка оставляет главу; у главы одно фото главы — прежнее уступает место
 * и остаётся после неё. Так список в браузере совпадает с базой без перечитывания страницы.
 */
export function patchEditorPhotos(photos: readonly EditorPhoto[], updates: readonly { id: string; patch: EditorPhotoPatch }[]): EditorPhoto[] {
  let out = [...photos];
  for (const { id, patch } of updates) {
    const i = out.findIndex((p) => p.id === id);
    if (i < 0) continue;
    const p = { ...out[i] };
    if (patch.caption !== undefined) p.caption = patch.caption;
    if (patch.layout !== undefined) p.layout = patch.layout;
    if (patch.questionId !== undefined) p.questionId = patch.questionId;
    if (patch.inline !== undefined) p.inline = patch.inline;
    if (patch.crop !== undefined) p.crop = patch.crop;
    if (patch.chapter !== undefined) {
      p.chapter = patch.chapter || null;
      if (!isChapterPhotoKey(p.chapter)) p.opener = false;
    }
    if (patch.opener !== undefined) p.opener = patch.opener && isChapterPhotoKey(p.chapter) && !p.questionId;
    if (p.questionId) {
      p.chapter = null;
      p.opener = false;
    }
    out[i] = p;
    if (patch.opener && p.opener) out = out.map((o) => (o.id !== p.id && o.opener && o.chapter === p.chapter ? { ...o, opener: false } : o));
  }
  return out;
}

/** Поля места и кадра — их «Отменить» возвращает всегда (R12). */
const PLACE_FIELDS = ["questionId", "chapter", "opener", "crop"] as const;

/**
 * Что вернёт «Отменить» после этих правок: прежние значения правленых фото и тех, кого правка задела (фото главы,
 * уступившее место). Порядок — порядок фото книги; сервер применит их по тем же правилам и придёт к прежнему.
 */
export function photoUndo(photos: readonly EditorPhoto[], updates: readonly { id: string; patch: EditorPhotoPatch }[]): PhotoUndo {
  const after = new Map(patchEditorPhotos(photos, updates).map((p) => [p.id, p]));
  const out: PhotoUndo = [];
  for (const before of photos) {
    const now = after.get(before.id)!;
    const patched = updates.filter((u) => u.id === before.id).flatMap((u) => Object.keys(u.patch) as (keyof EditorPhotoPatch)[]);
    if (!patched.length && PLACE_FIELDS.every((k) => now[k] === before[k])) continue;
    const entry: PhotoUndo[number] = { id: before.id };
    for (const k of new Set<keyof EditorPhotoPatch>([...PLACE_FIELDS, ...patched])) Object.assign(entry, { [k]: before[k] ?? null });
    out.push(entry);
  }
  return out;
}

/** Правки, которые вернут фото к снимку «Отменить». */
export const undoUpdates = (undo: PhotoUndo) => undo.map(({ id, ...patch }) => ({ id, patch }));

/**
 * Правки, которые приводят правленые фото к их строкам с сервера (кадр и вид приводит домен): место и кадр всегда,
 * остальные поля — только правленые, чтобы ответ сервера не затёр то, что автор успел ввести после запроса.
 */
export function serverUpdates(rows: readonly EditorPhotoRow[], updates: readonly { id: string; patch: EditorPhotoPatch }[]) {
  return rows.map((r) => {
    const row = toEditorPhoto(r);
    const keys = new Set<keyof EditorPhotoPatch>([...PLACE_FIELDS, ...updates.filter((u) => u.id === r.id).flatMap((u) => Object.keys(u.patch) as (keyof EditorPhotoPatch)[])]);
    const patch: EditorPhotoPatch = {};
    for (const k of keys) Object.assign(patch, { [k]: row[k] ?? null });
    return { id: r.id, patch };
  });
}
