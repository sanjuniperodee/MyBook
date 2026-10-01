import { AggregateRoot } from "@/shared/domain";
import type { Locale } from "@/i18n/config";
import { coverTemplates } from "@/lib/book/covers";
import { formats } from "@/lib/book/formats";
import { typographies } from "@/lib/book/fonts";
import { getOccasion } from "@/lib/occasions";
import { AuthoringError } from "./errors";
import { AuthoringEvents, type BookRef } from "./events";

export type Gender = "m" | "f";

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
  backText: string;
  dedication: string;
  typography: string;
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
  Pick<BookProps, "title" | "subtitle" | "authorName" | "authorGender" | "recipientName" | "recipientGender" | "hideRecipientOnCover" | "coverTemplate" | "backText" | "dedication" | "typography" | "format" | "photoPlacement" | "showToc" | "occasion" | "occasionDate">
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
      backText: "",
      dedication: "",
      typography: "classic",
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

  /** Настройки из редактора: каталоги обложек, шрифтов, форматов и поводов проверяются здесь. */
  applySettings(s: BookSettings) {
    this.assertEditable();
    if (s.coverTemplate !== undefined && !coverTemplates.some((t) => t.id === s.coverTemplate)) throw new AuthoringError("unknownCover");
    if (s.typography !== undefined && !(s.typography in typographies)) throw new AuthoringError("unknownTypography");
    if (s.format !== undefined && !(s.format in formats)) throw new AuthoringError("unknownFormat");
    if (s.occasion && !getOccasion(s.occasion)) throw new AuthoringError("unknownOccasion");
    const clean = Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined)) as BookSettings;
    this.props = { ...this.props, ...clean };
  }

  /** Фото обложки (принадлежность фото книге проверяет сервис). */
  setCoverPhoto(photoId: string | null) {
    this.assertEditable();
    this.props.coverPhotoId = photoId;
  }

  /** Удалённое фото не должно оставаться на обложке. */
  forgetPhoto(photoId: string) {
    if (this.props.coverPhotoId === photoId) this.props.coverPhotoId = null;
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
