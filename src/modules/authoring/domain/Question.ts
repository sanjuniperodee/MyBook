import { AggregateRoot } from "@/shared/domain";
import { AuthoringEvents } from "./events";

export interface QuestionProps {
  bookId: string;
  userId: string;
  position: number;
  chapter: string;
  /** Ключ из банка вопросов; "custom" — собственный вопрос клиента. */
  key: string | null;
  prompt: string;
  title: string;
  hint: string | null;
  answer: string;
  displayText: string | null;
  hideHeading: boolean;
}

export const MAX_QUESTIONS = 600;
export const MAX_ANSWER_LENGTH = 40_000;

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
    return this.props.key === "custom";
  }
  get isAnswered() {
    return !!this.props.answer.trim();
  }

  /**
   * Правка ответа и заголовка. Событие о прогрессе — только когда вопрос стал отвеченным или
   * перестал им быть (а не на каждое автосохранение).
   */
  edit(patch: { answer?: string; displayText?: string | null; hideHeading?: boolean }) {
    const wasAnswered = this.isAnswered;
    if (patch.answer !== undefined) this.props.answer = patch.answer.slice(0, MAX_ANSWER_LENGTH);
    if (patch.displayText !== undefined) this.props.displayText = patch.displayText?.trim() || null;
    if (patch.hideHeading !== undefined) this.props.hideHeading = patch.hideHeading;
    if (wasAnswered !== this.isAnswered) this.record(AuthoringEvents.bookProgressed({ bookId: this.props.bookId, userId: this.props.userId }));
  }
}
