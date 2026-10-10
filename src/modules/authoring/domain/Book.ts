import { AggregateRoot } from "@/shared/domain";
import type { Locale } from "@/i18n/config";
import { isKnownCover } from "@/lib/book/covers";
import { formats } from "@/lib/book/formats";
import { DEFAULT_INTERIOR, isInteriorId } from "@/lib/book/interiors";
import { DEFAULT_BACK_LAYOUT, isBackLayout } from "@/lib/book/cover-back";
import { frameKey, parseFrames, type FrameMap } from "@/lib/book/photo-frame";
import { getOccasion } from "@/lib/occasions";
import { AuthoringError } from "./errors";
import { AuthoringEvents, type BookRef } from "./events";

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
  recipientName: string;
  recipientGender: Gender;
  hideRecipientOnCover: boolean;
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
  format: string;
  photoPlacement: "chapters" | "end";
  showToc: boolean;
  inviteToken: string | null;
  language: Locale;
  occasion: string | null;
  occasionDate: string | null;
  createdAt: Date;
}

/** Кто смотрит книгу: владелец или сотрудник CRM. */
export interface BookViewer {
  userId: string;
  isStaff: boolean;
}

/** Настройки книги, которые клиент меняет в редакторе. */
export type BookSettings = Partial<
  Pick<BookProps, "title" | "subtitle" | "authorName" | "authorGender" | "recipientName" | "recipientGender" | "hideRecipientOnCover" | "coverTemplate" | "backText" | "backLayout" | "dedication" | "interior" | "format" | "photoPlacement" | "showToc" | "occasion" | "occasionDate">
>;

/** Вопрос из банка темы, который копируется в книгу при создании. */
export interface QuestionTemplate {
  chapter: string;
  key: string;
  prompt: string;
  title: string;
  hint: string | null;
}

/** Тема книги на конкретном языке (из банка вопросов). */
export interface ThemeOnLanguage {
  id: string;
  recipientGender?: Gender;
  titleSuggestions: string[];
  defaultCover: string;
  /** Оформление страниц новой книги; неизвестное — классика. */
  defaultInterior: string;
  questions: QuestionTemplate[];
}

/**
 * Книга — корень агрегата контекста Authoring. Пока книга не заказана, её можно править;
 * после заказа она заблокирована (кроме случаев, когда сотрудник временно откроет её для правок).
 */
export class Book extends AggregateRoot<BookProps> {
  static restore(id: string, props: BookProps) {
    return new Book(id, props);
  }

  /** Новая книга по теме: вопросы копируются из банка, чтобы банк можно было менять, не ломая начатые книги. */
  static start(
    id: string,
    input: { userId: string; language: Locale; authorName: string; authorGender: Gender; recipientName: string; recipientGender: Gender; title?: string; occasion?: string | null; occasionDate?: string | null },
    theme: ThemeOnLanguage,
    now: Date,
  ) {
    const occasion = input.occasion && getOccasion(input.occasion) ? input.occasion : null;
    const book = new Book(id, {
      userId: input.userId,
      theme: theme.id,
      status: "draft",
      title: input.title?.trim() || theme.titleSuggestions[0] || "",
      subtitle: "",
      authorName: input.authorName.trim(),
      authorGender: input.authorGender,
      recipientName: input.recipientName.trim(),
      recipientGender: theme.recipientGender ?? input.recipientGender,
      hideRecipientOnCover: false,
      coverTemplate: theme.defaultCover,
      coverPhotoId: null,
      coverPhotoExtra: [],
      backText: "",
      backLayout: DEFAULT_BACK_LAYOUT,
      backPhotoId: null,
      backPhotoExtra: [],
      photoFrames: {},
      dedication: "",
      interior: isInteriorId(theme.defaultInterior) ? theme.defaultInterior : DEFAULT_INTERIOR,
      format: "a5",
      photoPlacement: "chapters",
      showToc: true,
      inviteToken: null,
      language: input.language,
      occasion,
      occasionDate: occasion ? input.occasionDate || null : null,
      createdAt: now,
    });
    book.record(AuthoringEvents.bookStarted(book.ref()));
    return { book, questions: theme.questions };
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
    return { bookId: this.id, userId: this.props.userId, title: this.props.title, recipientName: this.props.recipientName, occasion: this.props.occasion, occasionDate: this.props.occasionDate };
  }

  isVisibleTo(viewer: BookViewer) {
    return viewer.isStaff || viewer.userId === this.props.userId;
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
    const clean = Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined)) as BookSettings;
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

  /** Кадры фото на обложке (масштаб и положение по местам). Принимаются только известные места и допустимые числа. */
  setPhotoFrames(raw: unknown) {
    this.assertEditable();
    this.props.photoFrames = parseFrames(raw);
  }

  /** Использует ли обложка (лицо или оборот) это фото. */
  usesPhoto(photoId: string) {
    const p = this.props;
    return p.coverPhotoId === photoId || p.backPhotoId === photoId || p.coverPhotoExtra.includes(photoId) || p.backPhotoExtra.includes(photoId);
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
