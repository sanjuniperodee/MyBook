import { createHash } from "node:crypto";
import type { Locale } from "@/i18n/config";
import { formats, type FormatId } from "@/lib/book/formats";
import { interiorDesigns, type InteriorId } from "@/lib/book/interiors";
import type { BackLayout } from "@/lib/book/cover-back";
import type { BookBundle } from "@/modules/production/infrastructure/pdf/render";
import type { Book, BookLetter, BookQuestion, InlinePhotoStyle, Photo } from "@/shared/infrastructure/db/schema";
import { photoKey, photoSpecs, thumbKey, type PhotoName } from "./photos";
import { fixtureTexts } from "./texts";

/**
 * Детерминированный набор книг без БД — для эталонных PDF, снимков HTML и характеристических тестов:
 * каждое оформление × каждый формат × ru и kk. Фиксированы id, даты и тексты; фото — tests/fixtures/photos.ts
 * (для рендера — `useFixtureStorage()` до импорта рендера). Казахские книги квадратного формата собирают фото
 * в конце книги (photoPlacement: "end"), остальные — по главам. Крайние случаи вне матрицы — fixtureVariants().
 */

const fixtureLanguages: Locale[] = ["ru", "kk"];

export interface FixtureOptions {
  designs?: InteriorId[];
  formats?: FormatId[];
  languages?: Locale[];
}

export interface FixtureBook {
  /** «<оформление>-<формат>-<язык>», например «classic-a5-ru», или имя варианта (fixtureVariants). */
  key: string;
  bundle: BookBundle;
}

const CREATED = new Date("2026-03-08T09:00:00Z");
const UPDATED = new Date("2026-04-12T18:30:00Z");

/** Стабильный id в виде UUID из строки-зерна: не зависит от порядка книг в наборе. */
function fixtureId(seed: string) {
  const h = createHash("sha256").update(`mybook-fixture:${seed}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Обложка и оборот — из пар оформления: обложки без фото, со снимком из каталога и на 1, 2, 3, 4 и 6 фото. */
const COVERS: Record<InteriorId, { cover: string; back: BackLayout }> = {
  classic: { cover: "linen", back: "quote" },
  photobook: { cover: "mosaic", back: "polaroids" },
  gallery: { cover: "passepartout", back: "photo" },
  romance: { cover: "peony", back: "letter" },
  cinema: { cover: "film", back: "fullPhoto" },
  stars: { cover: "midnight", back: "minimal" },
  memories: { cover: "stack", back: "polaroids" },
  arches: { cover: "diptych", back: "photo" },
  herbarium: { cover: "eucalyptus", back: "letter" },
  oyu: { cover: "oyu", back: "quote" },
  luna: { cover: "grid", back: "fullPhoto" },
  editorial: { cover: "magazine", back: "minimal" },
  watercolor: { cover: "sakura", back: "quote" },
  shanyrak: { cover: "terracotta", back: "letter" },
  mountains: { cover: "alatau", back: "photo" },
  deco: { cover: "deco", back: "minimal" },
  album: { cover: "collage", back: "polaroids" },
  sea: { cover: "surf", back: "fullPhoto" },
  airmail: { cover: "stamp", back: "letter" },
  vintage: { cover: "medallion", back: "photo" },
  confetti: { cover: "party", back: "polaroids" },
  modern: { cover: "noir", back: "quote" },
  minimal: { cover: "photo", back: "fullPhoto" },
};

/** Вопросы по порядку: глава и скрытый заголовок. Ответы и заголовки — в texts.ts под тем же номером. */
const QUESTIONS: { chapter: string; hideHeading?: boolean }[] = [
  { chapter: "intro" }, // 0 лид и длинный текст; фото перед текстом
  { chapter: "intro" }, // 1 короткий ответ — цитата
  { chapter: "intro" }, // 2 маркированный список; фото после списка
  { chapter: "meet", hideHeading: true }, // 3 стихи; первый в главе — без заголовка и без разделителя
  { chapter: "meet", hideHeading: true }, // 4 нумерованный список; разделитель после короткого ответа — посреди полосы
  { chapter: "meet" }, // 5 длинный ответ с диалогом; полароид внутри текста
  { chapter: "travel" }, // 6 ряд из двух фото в конце
  { chapter: "travel" }, // 7 только фото, без текста
  { chapter: "travel" }, // 8 заголовок исправлен автором; эмодзи и типографская чистка
  { chapter: "dreams" }, // 9 очень длинный ответ
  { chapter: "dreams" }, // 10 без ответа и фото — в книгу не попадает
  { chapter: "dreams" }, // 11 короткий ответ в конце главы
];

const DISPLAY_TEXT_AT = 8;

const style = (s: Partial<InlinePhotoStyle>): InlinePhotoStyle => ({ width: 100, align: "center", anchor: null, aspect: "original", focusX: 0.5, focusY: 0.5, frame: "none", ...s });

/** Фото в ответах: все рамки, выравнивания и пропорции, места в тексте и ряд из двух. */
const INLINE: { photo: PhotoName; question: number; style: InlinePhotoStyle }[] = [
  { photo: "a", question: 0, style: style({ anchor: -1 }) },
  { photo: "b", question: 2, style: style({ width: 60, align: "left", anchor: 0, aspect: "4:3", frame: "line" }) },
  { photo: "c", question: 5, style: style({ width: 45, align: "right", anchor: 3, aspect: "1:1", frame: "polaroid" }) },
  { photo: "d", question: 6, style: style({ width: 50, aspect: "3:4", frame: "round" }) },
  { photo: "e", question: 6, style: style({ width: 45, aspect: "16:9", focusX: 0.2, focusY: 0.8 }) },
  { photo: "f", question: 7, style: style({ width: 80, align: "center", aspect: "4:3", focusX: 0.8, focusY: 0.3, frame: "line" }) },
];

/**
 * Фотостраницы — по четыре на главу (вопросных глав четыре): во весь лист, под обрез, половинки парой и по одной,
 * сетка на 4, 3 и 2 снимка. В оформлениях с фото на начальной полосе первое фото главы уходит туда.
 */
const PAGES: { photo: PhotoName; layout: Photo["layout"] }[] = [
  { photo: "p1", layout: "full" },
  { photo: "p2", layout: "bleed" },
  { photo: "p3", layout: "half" },
  { photo: "p4", layout: "half" },
  { photo: "p5", layout: "grid" },
  { photo: "p6", layout: "grid" },
  { photo: "p7", layout: "grid" },
  { photo: "p8", layout: "grid" },
  { photo: "p9", layout: "half" },
  { photo: "p10", layout: "grid" },
  { photo: "p11", layout: "grid" },
  { photo: "p12", layout: "full" },
  { photo: "p13", layout: "bleed" },
  { photo: "p14", layout: "grid" },
  { photo: "p15", layout: "grid" },
  { photo: "p16", layout: "grid" },
];

/** Остальные места обложек на несколько фото и снимки оборота — из фото книги, как в редакторе. */
const COVER_EXTRA: PhotoName[] = ["p5", "p7", "p13", "p14", "p16"];
const BACK: PhotoName[] = ["p1", "p6", "p10"];

function bookRow(key: string, design: InteriorId, format: FormatId, language: Locale): Book {
  const t = fixtureTexts[language];
  const photo = (name: PhotoName) => fixtureId(`${key}:photo:${name}`);
  const [back, ...backExtra] = BACK.map(photo);
  return {
    id: fixtureId(`${key}:book`),
    userId: fixtureId("user"),
    theme: "love",
    status: "draft",
    title: t.title,
    subtitle: t.subtitle,
    authorName: t.authorName,
    authorGender: "f",
    recordedBy: "",
    recipientName: t.recipientName,
    recipientGender: "m",
    hideRecipientOnCover: false,
    coverTemplate: COVERS[design].cover,
    coverPhotoId: photo("cover"),
    coverPhotoExtra: COVER_EXTRA.map(photo),
    backText: t.backText,
    backLayout: COVERS[design].back,
    backPhotoId: back,
    backPhotoExtra: backExtra,
    photoFrames: { "cover:0": { zoom: 1.5, x: 0.3, y: 0.6 }, "cover:1": { zoom: 1.25, x: 0.7, y: 0.4 }, "back:0": { zoom: 1.3, x: 0.4, y: 0.5 } },
    dedication: t.dedication,
    interior: design,
    format,
    photoPlacement: language === "kk" && format === "square" ? "end" : "chapters",
    showToc: true,
    inviteToken: null,
    occasion: null,
    occasionDate: null,
    language,
    createdAt: CREATED,
    updatedAt: UPDATED,
  };
}

function questionRows(key: string, book: Book): BookQuestion[] {
  const t = fixtureTexts[book.language];
  return QUESTIONS.map((q, i) => ({
    id: fixtureId(`${key}:q${i}`),
    bookId: book.id,
    position: i,
    chapter: q.chapter,
    questionKey: null,
    prompt: t.headings[i],
    title: t.headings[i],
    hint: null,
    displayText: i === DISPLAY_TEXT_AT ? t.displayText : null,
    hideHeading: q.hideHeading ?? false,
    answer: t.answers[i],
    createdAt: CREATED,
    updatedAt: UPDATED,
  }));
}

function photoRows(key: string, book: Book, questions: BookQuestion[]): Photo[] {
  const captions = fixtureTexts[book.language].captions;
  const list: { photo: PhotoName; layout: Photo["layout"]; question?: number; style?: InlinePhotoStyle }[] = [{ photo: "cover", layout: "full" }, ...INLINE.map((p) => ({ ...p, layout: "full" as const })), ...PAGES];
  return list.map((p, position) => ({
    id: fixtureId(`${key}:photo:${p.photo}`),
    bookId: book.id,
    position,
    storageKey: photoKey(p.photo),
    thumbKey: thumbKey(p.photo),
    width: photoSpecs[p.photo][0],
    height: photoSpecs[p.photo][1],
    caption: captions[p.photo] ?? "",
    layout: p.layout,
    questionId: p.question === undefined ? null : questions[p.question].id,
    inline: p.style ?? null,
    createdAt: CREATED,
    updatedAt: UPDATED,
  }));
}

function letterRows(key: string, book: Book): BookLetter[] {
  return fixtureTexts[book.language].letters.map((l, i) => ({
    id: fixtureId(`${key}:letter${i}`),
    bookId: book.id,
    ...l,
    status: "approved",
    createdAt: new Date(CREATED.getTime() + (i + 1) * 86_400_000),
    updatedAt: UPDATED,
  }));
}

/** Книга под ключом key: от ключа зависят все id, поэтому книги вариантов не совпадают с книгами матрицы. */
function buildBook(key: string, design: InteriorId, format: FormatId, language: Locale): FixtureBook {
  const book = bookRow(key, design, format, language);
  const questions = questionRows(key, book);
  return { key, bundle: { book, questions, chapters: [], photos: photoRows(key, book, questions), letters: letterRows(key, book) } };
}

export function fixtureBook(design: InteriorId, format: FormatId, language: Locale): FixtureBook {
  return buildBook(`${design}-${format}-${language}`, design, format, language);
}

/** Набор книг в стабильном порядке: оформления — как в interiorDesigns, затем формат, затем язык. Каждый вызов строит новые объекты. */
export function fixtureBooks(opts: FixtureOptions = {}): FixtureBook[] {
  const designs = interiorDesigns.map((d) => d.id).filter((id) => !opts.designs || opts.designs.includes(id));
  const formatIds = (Object.keys(formats) as FormatId[]).filter((id) => !opts.formats || opts.formats.includes(id));
  const languages = fixtureLanguages.filter((l) => !opts.languages || opts.languages.includes(l));
  return designs.flatMap((d) => formatIds.flatMap((f) => languages.map((l) => fixtureBook(d, f, l))));
}

/** Сочетания формата и языка по кругу для выборки fixtureSample: все четыре и оба размещения фото (kk-квадрат — в конце книги). */
const SAMPLE_COMBOS: [FormatId, Locale][] = [
  ["a5", "ru"],
  ["square", "kk"],
  ["a5", "kk"],
  ["square", "ru"],
];

/** Каждое оформление один раз, формат и язык по кругу (a5-ru, square-kk, a5-kk, square-ru): быстрые прогоны вместо всего набора. */
export function fixtureSample(): FixtureBook[] {
  return interiorDesigns.map((d, i) => fixtureBook(d.id, ...SAMPLE_COMBOS[i % SAMPLE_COMBOS.length]));
}

// ─── варианты вне матрицы ──────────────────────────────────────────────────

/** Вариант: книга-основа (под ключом варианта) и правка её бандла. */
interface Variant {
  base: [InteriorId, FormatId, Locale];
  patch: (b: BookBundle) => BookBundle;
}

const withBook = (b: BookBundle, patch: Partial<Book>): BookBundle => ({ ...b, book: { ...b.book, ...patch } });

/** Ответы тонкой книги: «Ты в трёх словах» и «Одно слово напоследок». */
const THIN_ANSWERS = [1, 11];
/** Главы набора → главы темы «Другу» (intro и meet в ней есть). */
const FRIEND_CHAPTERS: Record<string, string> = { travel: "adventures", dreams: "future" };
/** Главы набора → главы банка автобиографии (ключи §1.3 спецификации). */
const AUTOBIOGRAPHY_CHAPTERS: Record<string, string> = { intro: "intro", meet: "childhood", travel: "youth", dreams: "wisdom" };
/** Своя книга: оглавление автора по порядку (name — глава набора; «empty» — глава без разделов). */
const BLANK_CHAPTERS: { name: string; title: string; epigraph: string }[] = [
  { name: "intro", title: "С чего всё началось 🌿", epigraph: "Всё, что помню, записываю, пока помню." },
  { name: "meet", title: "Встреча", epigraph: "Случайностей не бывает — бывают встречи." },
  { name: "empty", title: "Пока пустая глава", epigraph: "" },
  { name: "travel", title: "", epigraph: "" },
  { name: "dreams", title: "Что дальше", epigraph: "Лучшее — впереди." },
];
/** Заголовки разделов своей книги по номеру вопроса набора: пустой — раздел без заголовка (в печати — разделитель). */
const BLANK_TITLES = [
  "Почему я решила написать эту книгу",
  "В трёх словах",
  "Мы [Аня|Анна] — так нас звали во дворе",
  "",
  "",
  "Как мы познакомились",
  "Первое путешествие",
  "Снимок, который я храню",
  "Горы, чай из термоса 🏔",
  "О чём я мечтаю",
  "Без ответа",
  "Напоследок",
];

const VARIANTS: Record<string, Variant> = {
  // Два коротких ответа, из фото — только обложка: оценка меньше print.minPages, печать добивает до минимума.
  thin: {
    base: ["classic", "a5", "ru"],
    patch: (b) => ({
      ...withBook(b, { coverPhotoExtra: [], backPhotoId: null, backPhotoExtra: [] }),
      questions: b.questions.map((q) => (THIN_ANSWERS.includes(q.position) ? q : { ...q, answer: "" })),
      photos: b.photos.filter((p) => p.id === b.book.coverPhotoId),
    }),
  },
  // Без оглавления, посвящения, писем и фото обложки; адресат на обложке скрыт.
  bare: {
    base: ["gallery", "square", "kk"],
    patch: (b) => ({
      ...withBook(b, { showToc: false, dedication: "", coverPhotoId: null, coverPhotoExtra: [], hideRecipientOnCover: true }),
      photos: b.photos.filter((p) => p.id !== b.book.coverPhotoId),
      letters: [],
    }),
  },
  // Автор — мужчина, адресат — женщина, тема «Другу»; второе письмо не одобрено.
  gender: {
    base: ["confetti", "a5", "ru"],
    patch: (b) => ({
      ...withBook(b, { theme: "friend", authorGender: "m", recipientGender: "f", authorName: b.book.recipientName, recipientName: b.book.authorName }),
      questions: b.questions.map((q) => ({ ...q, chapter: FRIEND_CHAPTERS[q.chapter] ?? q.chapter })),
      letters: b.letters?.map((l, i) => (i === 1 ? { ...l, status: "pending" as const } : l)),
    }),
  },
  // Фотостраница p1 — она же фото оборота «во всю» — снимок 4000×3000: печать ужимает его под 300 dpi, фон обложки — до 3200 px.
  bigphoto: {
    base: ["minimal", "a5", "ru"],
    patch: (b) => ({
      ...b,
      photos: b.photos.map((p) => (p.storageKey === photoKey("p1") ? { ...p, storageKey: photoKey("big"), thumbKey: thumbKey("big"), width: photoSpecs.big[0], height: photoSpecs.big[1] } : p)),
    }),
  },
  // Автобиография: получателя нет, «кто записал» на обороте титула, фото — в разделе в конце книги («Из семейного альбома»).
  autobiography: {
    base: ["vintage", "a5", "ru"],
    patch: (b) => ({
      ...withBook(b, { theme: "autobiography", recipientName: "", recordedBy: "внучка Аружан", title: "История моей жизни", subtitle: "", photoPlacement: "end" }),
      questions: b.questions.map((q) => ({ ...q, chapter: AUTOBIOGRAPHY_CHAPTERS[q.chapter], questionKey: `autobiography.${AUTOBIOGRAPHY_CHAPTERS[q.chapter]}.${q.position + 1}` })),
    }),
  },
  // Своя книга: главы автора с эпиграфами, эмодзи в названии, пустая глава и глава без названия; разделы — свой текст
  // («[Аня|Анна]» не склоняется), два раздела без заголовка; название книги пустое — печатается название по умолчанию.
  blank: {
    base: ["classic", "a5", "ru"],
    patch: (b) => {
      const key = (name: string) => fixtureId(`blank:chapter:${name}`);
      return {
        ...withBook(b, { theme: "blank", title: "", subtitle: "", recipientName: "" }),
        chapters: BLANK_CHAPTERS.map((c, position) => ({ id: fixtureId(`blank:chapter-row:${c.name}`), bookId: b.book.id, key: key(c.name), position, title: c.title, epigraph: c.epigraph, createdAt: CREATED, updatedAt: UPDATED })),
        questions: b.questions.map((q) => ({ ...q, chapter: key(q.chapter), questionKey: "custom", prompt: "", title: BLANK_TITLES[q.position], displayText: null, hideHeading: false })),
      };
    },
  },
};

/** Крайние случаи вне матрицы: thin, bare, gender, bigphoto, autobiography, blank. Каждый вызов строит новые объекты. */
export function fixtureVariants(): FixtureBook[] {
  return Object.entries(VARIANTS).map(([key, v]) => ({ key, bundle: v.patch(buildBook(key, ...v.base).bundle) }));
}
