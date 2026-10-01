import { domainEvent, type DomainEvent } from "@/shared/domain";

export interface BookRef {
  bookId: string;
  userId: string;
  title: string;
  recipientName: string;
  occasion: string | null;
  occasionDate: string | null;
}

export type BookStarted = DomainEvent<"authoring.book_started", BookRef>;
/** Число отвеченных вопросов изменилось (вопрос получил ответ или ответ стёрт) — прогресс книги. */
export type BookProgressed = DomainEvent<"authoring.book_progressed", { bookId: string; userId: string }>;
export type LetterSubmitted = DomainEvent<"authoring.letter_submitted", { bookId: string; letterId: string; authorName: string; relation: string }>;

export type AuthoringEvent = BookStarted | BookProgressed | LetterSubmitted;

export const AuthoringEvents = {
  bookStarted: (p: BookRef): BookStarted => domainEvent("authoring.book_started", p),
  bookProgressed: (p: BookProgressed["payload"]): BookProgressed => domainEvent("authoring.book_progressed", p),
  letterSubmitted: (p: LetterSubmitted["payload"]): LetterSubmitted => domainEvent("authoring.letter_submitted", p),
};
