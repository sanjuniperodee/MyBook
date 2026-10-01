import { AggregateRoot } from "@/shared/domain";
import { AuthoringEvents } from "./events";

export type LetterStatus = "pending" | "approved" | "hidden";

export interface LetterProps {
  bookId: string;
  authorName: string;
  relation: string;
  text: string;
  status: LetterStatus;
}

export const MAX_LETTERS = 200;

/** Письмо от близкого: приходит по ссылке-приглашению и попадает в книгу после одобрения владельцем. */
export class Letter extends AggregateRoot<LetterProps> {
  static restore(id: string, props: LetterProps) {
    return new Letter(id, props);
  }

  static submit(id: string, input: { bookId: string; authorName: string; relation: string; text: string }) {
    const letter = new Letter(id, { bookId: input.bookId, authorName: input.authorName.trim(), relation: input.relation.trim(), text: input.text.trim(), status: "pending" });
    letter.record(AuthoringEvents.letterSubmitted({ bookId: input.bookId, letterId: id, authorName: letter.props.authorName, relation: letter.props.relation }));
    return letter;
  }

  get bookId() {
    return this.props.bookId;
  }

  edit(patch: Partial<Pick<LetterProps, "status" | "authorName" | "relation" | "text">>) {
    const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    this.props = { ...this.props, ...clean };
  }
}
