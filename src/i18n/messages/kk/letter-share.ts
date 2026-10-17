import type { LetterShareBook } from "../ru/letter-share";

/** Просьба написать письмо в книгу — для мессенджера, на языке книги. Текст зависит от вида книги. */
export const share = ({ kind, author, title, recipient }: LetterShareBook, link: string) => {
  const who = author.trim() || "автор";
  if (kind === "autobiography") return `Өмір кітабын дайындап жатырмыз — автор: ${who}. Бірнеше жылы сөз немесе естелік жазып жіберіңізші — олар кітапқа кіреді: ${link}`;
  if (kind === "blank") return `${who} «${title}» кітабын жазып жатыр. Бірнеше жылы сөз немесе естелік жазып жіберіңізші — олар кітапқа кіруі мүмкін: ${link}`;
  return `Мен тосынсый-кітап дайындап жатырмын${recipient ? ` — оны ${recipient} алады` : ""}. Бірнеше жылы сөз жазып жіберіңізші — олар кітапқа кіреді: ${link}`;
};
