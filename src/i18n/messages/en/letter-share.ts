import type { LetterShareBook } from "../ru/letter-share";

/** A request to write a letter for the book — for a messenger, in the book’s language. The text depends on the book type. */
export const share = ({ kind, author, title, recipient, inviteText }: LetterShareBook, link: string) => {
  // The author’s own invitation text — as it is, with the link.
  if (inviteText?.trim()) return `${inviteText.trim()}\n${link}`;
  const who = author.trim() || "the author";
  if (kind === "autobiography") return `We are preparing the book of a life — the author is ${who}. Please write a few warm words or a memory — they will go into the book: ${link}`;
  if (kind === "blank") return `${who} is writing the book “${title}”. Please write a few warm words or a memory — they may go into the book: ${link}`;
  return `I am preparing a surprise book${recipient ? ` — it is for ${recipient}` : ""}. Please write a few warm words — they will go into the book: ${link}`;
};
