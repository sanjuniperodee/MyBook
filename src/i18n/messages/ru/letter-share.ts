import type { BookKind } from "@/lib/content/kinds";

/** О какой книге просят письма. Имя автора (рассказчика) не склоняется: оно стоит только в именительном падеже. */
export interface LetterShareBook {
  kind: BookKind;
  author: string;
  title: string;
  recipient: string;
  /** Свой текст приглашения (books.invite_text); пусто — текст по виду книги. */
  inviteText?: string;
}

/** Просьба написать письмо в книгу — для мессенджера, на языке книги. Текст зависит от вида книги. */
export const share = ({ kind, author, title, recipient, inviteText }: LetterShareBook, link: string) => {
  // Свой текст приглашения автора — как есть, со ссылкой.
  if (inviteText?.trim()) return `${inviteText.trim()}\n${link}`;
  const who = author.trim() || "автор";
  if (kind === "autobiography") return `Мы готовим книгу жизни — автор: ${who}. Напишите, пожалуйста, пару тёплых слов или воспоминание — они войдут в книгу: ${link}`;
  if (kind === "blank") return `${who} пишет книгу «${title}». Напишите, пожалуйста, пару тёплых слов или воспоминание — они могут войти в книгу: ${link}`;
  return `Я готовлю книгу-сюрприз${recipient ? ` — её получит ${recipient}` : ""}. Напишите, пожалуйста, пару тёплых слов — они войдут в книгу: ${link}`;
};
