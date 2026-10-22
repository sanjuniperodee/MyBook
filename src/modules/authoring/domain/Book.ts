import { AggregateRoot } from "@/shared/domain";
import type { Locale } from "@/i18n/config";
import { isKnownCover } from "@/lib/book/covers";
import { formats } from "@/lib/book/formats";
import { DEFAULT_INTERIOR, isInteriorId, parseInteriorStyle } from "@/lib/book/interiors";
import { coverDesignPhotoIds, dropCoverPhoto, parseCoverDesign } from "@/lib/book/cover-design";
import { DEFAULT_BACK_LAYOUT, isBackLayout } from "@/lib/book/cover-back";
import { frameKey, parseFrames, type FrameMap } from "@/lib/book/photo-frame";
import { NAMES_ON_COVER_MAX } from "@/lib/book/cover-names";
import { isTocMode, parseTocLines, type TocLines, type TocMode } from "@/lib/book/toc";
import { getOccasion } from "@/lib/occasions";
import { bookKind, CHAPTER_TITLE_MAX, RECORDED_BY_MAX, type BookKind, type RecipientPolicy } from "@/lib/content/kinds";
import { AuthoringError } from "./errors";
import { AuthoringEvents, type BookRef } from "./events";
import { CUSTOM_QUESTION } from "./Question";

export type Gender = "m" | "f";

/** Сколько дополнительных мест под фото бывает у обложки или оборота (коллаж из пяти — с запасом). */
export const MAX_EXTRA_PHOTOS = 5;

export interface BookProps {
  userId: string;
  theme: string;
  status: "draft" | "ordered";
  title: string;
  subtitle: string;
  authorName: string;
  authorGender: Gender;
  /** Автобиография: кто записал со слов рассказчика (печатается на обороте титула); у остальных — пусто. */
  recordedBy: string;
  recipientName: string;
  recipientGender: Gender;
  hideRecipientOnCover: boolean;
  /** Своя строка имён на обложке; пусто — «Автор & Получатель». */
  namesOnCover: string;
  coverTemplate: string;
  coverPhotoId: string | null;
  /** Остальные снимки обложек на несколько фото, по порядку мест (первое — coverPhotoId). */
  coverPhotoExtra: string[];
  backText: string;
  /** Вариант задней стороны: цитата, письмо, фото или лаконично (src/lib/book/cover-back.ts). */
  backLayout: string;
  backPhotoId: string | null;
  /** Остальные снимки оборота «Полароиды» (первый — backPhotoId). */
  backPhotoExtra: string[];
  /** Кадры фото на обложке по местам: масштаб и положение (src/lib/book/photo-frame.ts). */
  photoFrames: FrameMap;
  dedication: string;
  interior: string;
  /** Настройки дизайнера страниц поверх стиля (src/lib/book/interiors/style.ts); {} — стиль как есть. */
  interiorStyle: Record<string, unknown>;
  /** Обложка из слоёв поверх шаблона (src/lib/book/cover-design); null — обложка шаблона. */
  coverDesign: Record<string, unknown> | null;
  format: string;
  photoPlacement: "chapters" | "end" | "none";
  showToc: boolean;
  /** Оглавление: режим и настройки строк (src/lib/book/toc.ts). */
  tocMode: TocMode;
  tocLines: TocLines;
  inviteToken: string | null;
  language: Locale;
  occasion: string | null;
  occasionDate: string | null;
  createdAt: Date;
}

/** Кто смотрит книгу: владелец или сотрудник CRM. */
export interface BookViewer {
  userId: string;
  /** Сотрудник, которому открыты книги клиентов (право clients.view, пройдены IP-allowlist и 2FA). */
  isStaff: boolean;
  /** …и который может их менять (ещё и clients.edit). */
  staffEdits: boolean;
}

/** Книгу видят её владелец и сотрудник. Одно правило для агрегата (Book.isVisibleTo) и read-моделей. */
export const isBookVisibleTo = (ownerId: string, viewer: BookViewer) => viewer.isStaff || viewer.userId === ownerId;

/** Менять книгу могут владелец и сотрудник с правом на правку. */
export const isBookEditableBy = (ownerId: string, viewer: BookViewer) => (viewer.isStaff && viewer.staffEdits) || viewer.userId === ownerId;

/** Настройки книги, которые клиент меняет в редакторе. */
export type BookSettings = Partial<
  Pick<BookProps, "title" | "subtitle" | "authorName" | "authorGender" | "recordedBy" | "recipientName" | "recipientGender" | "hideRecipientOnCover" | "namesOnCover" | "coverTemplate" | "backText" | "backLayout" | "dedication" | "interior" | "format" | "photoPlacement" | "showToc" | "tocMode" | "occasion" | "occasionDate">
>;

/** Вопрос из банка темы, который копируется в книгу при создании. */
export interface QuestionTemplate {
  chapter: string;
  key: string;
  prompt: string;
  title: string;
  hint: string | null;
}

/** Глава своей книги (тема blank), которая создаётся вместе с книгой. */
export interface ChapterSeed {
  key: string;
  title: string;
  epigraph: string;
}

/** Тема книги на конкретном языке (из банка вопросов). */
export interface ThemeOnLanguage {
  id: string;
  /** Вид книги: подарок, автобиография или своя книга (lib/content/kinds). */
  kind: BookKind;
  /** Получатель: обязателен (подарок), по желанию (своя книга) или его нет (автобиография). */
  recipient: RecipientPolicy;
  recipientGender?: Gender;
  titleSuggestions: string[];
  /** Название первой главы своей книги, если автор не ввёл своё; у тем с банком — пусто. */
  firstChapterTitle: string;
  defaultCover: string;
  /** Оформление страниц новой книги; неизвестное — классика. */
  defaultInterior: string;
  questions: QuestionTemplate[];
}

/** Данные мастера новой книги. */
export interface StartInput {
  userId: string;
  language: Locale;
  authorName: string;
  authorGender: Gender;
  recipientName: string;
  recipientGender: Gender;
  title?: string;
  occasion?: string | null;
  occasionDate?: string | null;
  /** Автобиография: кто записывает со слов рассказчика. */
  recordedBy?: string;
  /** Своя книга: название первой главы (пусто — по умолчанию темы, «Начало»). */
  firstChapterTitle?: string;
  /** Посвящение из мастера (у автобиографии — «кому посвящаете»; получателя у неё нет). */
  dedication?: string;
}

const clip = (s: string, max: number) => s.trim().slice(0, max);
/** Посвящение — те же 600 знаков, что у настроек книги. */
const DEDICATION_MAX = 600;

/**
 * Книга — корень агрегата контекста Authoring. Пока книга не заказана, её можно править;
 * после заказа она заблокирована (кроме случаев, когда сотрудник временно откроет её для правок).
 */
export class Book extends AggregateRoot<BookProps> {
  static restore(id: string, props: BookProps) {
    return new Book(id, props);
  }

  /**
   * Новая книга по теме: вопросы копируются из банка, чтобы банк можно было менять, не ломая начатые книги.
   * Получатель — по виду книги: у автобиографии его нет (посвящение пишут в dedication), у своей книги — по желанию,
   * род получателя у обеих не используется. Своя книга (blank) создаётся с первой главой и одним пустым разделом —
   * редактор открывается сразу на нём; ключ главы даёт newKey (uuid).
   */
  static start(id: string, input: StartInput, theme: ThemeOnLanguage, now: Date, newKey?: () => string) {
    const occasion = input.occasion && getOccasion(input.occasion) ? input.occasion : null;
    const book = new Book(id, {
      userId: input.userId,
      theme: theme.id,
      status: "draft",
      title: input.title?.trim() || theme.titleSuggestions[0] || "",
      subtitle: "",
      authorName: input.authorName.trim(),
      authorGender: input.authorGender,
      recordedBy: theme.kind === "autobiography" ? clip(input.recordedBy ?? "", RECORDED_BY_MAX) : "",
      recipientName: theme.recipient === "none" ? "" : input.recipientName.trim(),
      recipientGender: theme.recipientGender ?? (theme.recipient === "required" ? input.recipientGender : "m"),
      hideRecipientOnCover: false,
      namesOnCover: "",
      coverTemplate: theme.defaultCover,
      coverPhotoId: null,
      coverPhotoExtra: [],
      backText: "",
      backLayout: DEFAULT_BACK_LAYOUT,
      backPhotoId: null,
      backPhotoExtra: [],
      photoFrames: {},
      dedication: clip(input.dedication ?? "", DEDICATION_MAX),
      interior: isInteriorId(theme.defaultInterior) ? theme.defaultInterior : DEFAULT_INTERIOR,
      interiorStyle: {},
      coverDesign: null,
      format: "a5",
      photoPlacement: "chapters",
      showToc: true,
      tocMode: "chapters",
      tocLines: {},
      inviteToken: null,
      language: input.language,
      occasion,
      occasionDate: occasion ? input.occasionDate || null : null,
      createdAt: now,
    });
    book.record(AuthoringEvents.bookStarted(book.ref()));
    if (theme.kind !== "blank") return { book, questions: theme.questions, chapters: [] as ChapterSeed[] };
    if (!newKey) throw new Error("Book.start: blank book needs a chapter key generator");
    const chapter: ChapterSeed = { key: newKey(), title: clip(input.firstChapterTitle?.trim() || theme.firstChapterTitle, CHAPTER_TITLE_MAX), epigraph: "" };
    const section: QuestionTemplate = { chapter: chapter.key, key: CUSTOM_QUESTION, prompt: "", title: "", hint: null };
    return { book, questions: [section], chapters: [chapter] };
  }

  get userId() {
    return this.props.userId;
  }
  get status() {
    return this.props.status;
  }
  get title() {
    return this.props.title;
  }
  get language() {
    return this.props.language;
  }
  get theme() {
    return this.props.theme;
  }
  get kind(): BookKind {
    return bookKind(this.props.theme);
  }
  get coverPhotoId() {
    return this.props.coverPhotoId;
  }
  get backPhotoId() {
    return this.props.backPhotoId;
  }
  get coverPhotoExtra() {
    return this.props.coverPhotoExtra;
  }
  get backPhotoExtra() {
    return this.props.backPhotoExtra;
  }
  get inviteToken() {
    return this.props.inviteToken;
  }
  get isEditable() {
    return this.props.status === "draft";
  }

  ref(): BookRef {
    const p = this.props;
    return { bookId: this.id, userId: p.userId, theme: p.theme, title: p.title, authorName: p.authorName, recipientName: p.recipientName, occasion: p.occasion, occasionDate: p.occasionDate };
  }

  /** Прогресс книги сдвинулся (удалены раздел или глава с текстом, своя книга пересекла порог по словам). */
  noteProgress() {
    this.record(AuthoringEvents.bookProgressed({ bookId: this.id, userId: this.props.userId }));
  }

  isVisibleTo(viewer: BookViewer) {
    return isBookVisibleTo(this.props.userId, viewer);
  }

  isEditableBy(viewer: BookViewer) {
    return isBookEditableBy(this.props.userId, viewer);
  }

  assertEditable() {
    if (!this.isEditable) throw new AuthoringError("bookLocked");
  }

  /** Настройки из редактора: каталоги обложек, оформлений, форматов и поводов проверяются здесь. */
  applySettings(s: BookSettings) {
    this.assertEditable();
    if (s.coverTemplate !== undefined && !isKnownCover(s.coverTemplate)) throw new AuthoringError("unknownCover");
    if (s.interior !== undefined && !isInteriorId(s.interior)) throw new AuthoringError("unknownInterior");
    if (s.backLayout !== undefined && !isBackLayout(s.backLayout)) throw new AuthoringError("unknownBackLayout");
    if (s.format !== undefined && !(s.format in formats)) throw new AuthoringError("unknownFormat");
    if (s.occasion && !getOccasion(s.occasion)) throw new AuthoringError("unknownOccasion");
    if (s.tocMode !== undefined && !isTocMode(s.tocMode)) throw new AuthoringError("unknownTocMode");
    const clean = Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined)) as BookSettings;
    // Поля по виду книги: «кто записал» — только у автобиографии, получателя у неё нет, его рода нет и у своей книги.
    const kind = this.kind;
    if (clean.recordedBy !== undefined) {
      if (kind === "autobiography") clean.recordedBy = clip(clean.recordedBy, RECORDED_BY_MAX);
      else delete clean.recordedBy;
    }
    if (clean.namesOnCover !== undefined) clean.namesOnCover = clip(clean.namesOnCover, NAMES_ON_COVER_MAX);
    if (kind === "autobiography") delete clean.recipientName;
    if (kind !== "gift") delete clean.recipientGender;
    this.props = { ...this.props, ...clean };
  }

  /** Фото обложки (принадлежность фото книге проверяет сервис). */
  setCoverPhoto(photoId: string | null) {
    this.assertEditable();
    const before = this.slotIds("cover");
    this.props.coverPhotoId = photoId;
    this.dropChangedFrames("cover", before);
  }

  /** Фото на задней стороне (принадлежность фото книге проверяет сервис). */
  setBackPhoto(photoId: string | null) {
    this.assertEditable();
    const before = this.slotIds("back");
    this.props.backPhotoId = photoId;
    this.dropChangedFrames("back", before);
  }

  /** Остальные места под фото на обложке и обороте (принадлежность фото книге проверяет сервис). */
  setExtraPhotos(side: "cover" | "back", photoIds: string[]) {
    this.assertEditable();
    const before = this.slotIds(side);
    this.props[side === "cover" ? "coverPhotoExtra" : "backPhotoExtra"] = photoIds.slice(0, MAX_EXTRA_PHOTOS);
    this.dropChangedFrames(side, before);
  }

  /** Снимки по местам стороны обложки: первое — основное фото, дальше — остальные. */
  private slotIds(side: "cover" | "back") {
    const p = this.props;
    return side === "cover" ? [p.coverPhotoId, ...p.coverPhotoExtra] : [p.backPhotoId, ...p.backPhotoExtra];
  }

  /** На месте теперь другое фото — прежний кадр (масштаб и сдвиг) к нему не подходит. */
  private dropChangedFrames(side: "cover" | "back", before: (string | null)[]) {
    const after = this.slotIds(side);
    const frames = { ...this.props.photoFrames };
    for (let i = 0; i < Math.max(before.length, after.length); i++) if ((before[i] ?? null) !== (after[i] ?? null)) delete frames[frameKey(side, i)];
    this.props.photoFrames = frames;
  }

  /** Свои названия и скрытые строки оглавления: принимаются только ключи строк и названия в пределах длины. */
  setTocLines(raw: unknown) {
    this.assertEditable();
    this.props.tocLines = parseTocLines(raw);
  }

  /** Настройки дизайнера страниц: принимаются только известные поля, числа — в допустимых пределах, цвета — #RRGGBB. */
  setInteriorStyle(raw: unknown) {
    this.assertEditable();
    this.props.interiorStyle = parseInteriorStyle(raw) as Record<string, unknown>;
  }

  /**
   * Обложка из слоёв (null — вернуться к обложке шаблона). Слои проверяются и ограничиваются; фото слоёв должны
   * принадлежать книге — это проверяет сервис (coverDesignPhotos).
   */
  setCoverDesign(raw: unknown) {
    this.assertEditable();
    this.props.coverDesign = raw === null ? null : (parseCoverDesign(raw) as unknown as Record<string, unknown> | null);
  }

  /** Фото, которые стоят в слоях обложки. */
  coverDesignPhotos(raw: unknown = this.props.coverDesign): string[] {
    const design = raw ? parseCoverDesign(raw) : null;
    return design ? coverDesignPhotoIds(design) : [];
  }

  /** Кадры фото на обложке (масштаб и положение по местам). Принимаются только известные места и допустимые числа. */
  setPhotoFrames(raw: unknown) {
    this.assertEditable();
    this.props.photoFrames = parseFrames(raw);
  }

  /** Использует ли обложка (лицо или оборот) это фото. */
  usesPhoto(photoId: string) {
    const p = this.props;
    return p.coverPhotoId === photoId || p.backPhotoId === photoId || p.coverPhotoExtra.includes(photoId) || p.backPhotoExtra.includes(photoId) || this.coverDesignPhotos().includes(photoId);
  }

  /** Удалённое фото не должно оставаться на обложке — ни спереди, ни сзади. */
  forgetPhoto(photoId: string) {
    const coverBefore = this.slotIds("cover");
    const backBefore = this.slotIds("back");
    if (this.props.coverPhotoId === photoId) this.props.coverPhotoId = null;
    if (this.props.backPhotoId === photoId) this.props.backPhotoId = null;
    this.props.coverPhotoExtra = this.props.coverPhotoExtra.filter((id) => id !== photoId);
    this.props.backPhotoExtra = this.props.backPhotoExtra.filter((id) => id !== photoId);
    this.dropChangedFrames("cover", coverBefore);
    this.dropChangedFrames("back", backBefore);
    // Слой обложки с этим фото остаётся местом под снимок — без фото (его можно заполнить другим).
    if (this.props.coverDesign && this.coverDesignPhotos().includes(photoId)) {
      const design = parseCoverDesign(this.props.coverDesign);
      if (design) this.props.coverDesign = dropCoverPhoto(design, photoId) as unknown as Record<string, unknown>;
    }
  }

  /**
   * Смена языка: стандартные вопросы и заголовки из банка заменяются переводом (возвращаем
   * тексты по ключам), ответы и свои вопросы не трогаем. Название меняем, только если это был
   * один из предложенных вариантов.
   */
  switchLanguage(language: Locale, from: ThemeOnLanguage, to: ThemeOnLanguage): Map<string, { prompt: string; title: string; hint: string | null }> {
    this.assertEditable();
    if (language === this.props.language) return new Map();
    const suggestion = from.titleSuggestions.indexOf(this.props.title.trim());
    if (suggestion >= 0) this.props.title = to.titleSuggestions[suggestion] ?? this.props.title;
    this.props.language = language;
    return new Map(to.questions.map((q) => [q.key, { prompt: q.prompt, title: q.title, hint: q.hint }]));
  }

  /** Приём писем от близких по публичной ссылке. */
  setLetterInvite(enabled: boolean, regenerate: boolean, newToken: () => string): string | null {
    this.assertEditable();
    this.props.inviteToken = enabled ? (regenerate || !this.props.inviteToken ? newToken() : this.props.inviteToken) : null;
    return this.props.inviteToken;
  }

  /** Письмо от близкого принимается только пока книга пишется. */
  assertAcceptsLetters() {
    if (!this.props.inviteToken) throw new AuthoringError("letterClosed");
    if (!this.isEditable) throw new AuthoringError("letterPrinted");
  }
}
