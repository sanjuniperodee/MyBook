import { AggregateRoot } from "@/shared/domain";
import { countWords, CUSTOM_KEY } from "@/lib/book/layout";
import { SECTION_PROMPT_MAX, SECTION_TITLE_MAX } from "@/lib/content/kinds";
import { AuthoringEvents } from "./events";

/** Ключ собственного вопроса клиента и раздела своей книги (blank): их текст не склоняется и их можно удалять. */
export const CUSTOM_QUESTION = CUSTOM_KEY;

export interface QuestionProps {
  bookId: string;
  userId: string;
  position: number;
  chapter: string;
  /** Ключ из банка вопросов; "custom" — собственный вопрос клиента или раздел своей книги. */
  key: string | null;
  /** Вопрос автору; у раздела своей книги — подсказка для себя ('' — нет), не печатается. */
  prompt: string;
  /** Заголовок в книге; у раздела своей книги может быть пустым — тогда в печати разделитель. */
  title: string;
  hint: string | null;
  answer: string;
  displayText: string | null;
  hideHeading: boolean;
}

/** Правка вопроса из редактора. title и prompt меняются только у разделов своей книги — это проверяет сервис. */
export interface QuestionPatch {
  answer?: string;
  displayText?: string | null;
  hideHeading?: boolean;
  title?: string;
  prompt?: string;
}

export const MAX_QUESTIONS = 600;
const MAX_ANSWER_LENGTH = 40_000;

/** Вопрос книги. Сохраняется часто (автосохранение), поэтому это отдельный небольшой агрегат. */
export class Question extends AggregateRoot<QuestionProps> {
  static restore(id: string, props: QuestionProps) {
    return new Question(id, props);
  }

  get bookId() {
    return this.props.bookId;
  }
  get position() {
    return this.props.position;
  }
  get chapter() {
    return this.props.chapter;
  }
  get isCustom() {
    return this.props.key === CUSTOM_QUESTION;
  }
  get isAnswered() {
    return !!this.props.answer.trim();
  }
  /** Слов в ответе — так же, как их считает книга (countWords) и SQL отчётов (bookProgress.ts). */
  get words() {
    return countWords(this.props.answer);
  }

  /**
   * Правка ответа, заголовка и (у разделов своей книги) подсказки. Событие о прогрессе — только когда вопрос стал
   * отвеченным или перестал им быть (а не на каждое автосохранение); пороги по словам своей книги проверяет сервис.
   */
  edit(patch: QuestionPatch) {
    const wasAnswered = this.isAnswered;
    if (patch.answer !== undefined) this.props.answer = patch.answer.slice(0, MAX_ANSWER_LENGTH);
    if (patch.displayText !== undefined) this.props.displayText = patch.displayText?.trim() || null;
    if (patch.hideHeading !== undefined) this.props.hideHeading = patch.hideHeading;
    if (patch.title !== undefined) this.props.title = patch.title.trim().slice(0, SECTION_TITLE_MAX);
    if (patch.prompt !== undefined) this.props.prompt = patch.prompt.trim().slice(0, SECTION_PROMPT_MAX);
    if (wasAnswered !== this.isAnswered) this.record(AuthoringEvents.bookProgressed({ bookId: this.props.bookId, userId: this.props.userId }));
  }
}
