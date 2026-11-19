import type { LetterShareBook } from "../ru/letter-share";

/** Просьба написать письмо в книгу — для мессенджера, на языке книги. Текст зависит от вида книги. */
export const share = ({ kind, author, title, recipient, inviteText }: LetterShareBook, link: string) => {
  // Свой текст приглашения автора — как есть, со ссылкой.
  if (inviteText?.trim()) return `${inviteText.trim()}\n${link}`;
  const who = author.trim() || "muallif";
  if (kind === "autobiography") return `Biz hayot kitobini tayyorlayapmiz — muallif: ${who}. Iltimos, bir-ikki iliq so‘z yoki xotira yozib yuboring — ular kitobga kiradi: ${link}`;
  if (kind === "blank") return `${who} «${title}» kitobini yozmoqda. Iltimos, bir-ikki iliq so‘z yoki xotira yozib yuboring — ular kitobga kirishi mumkin: ${link}`;
  return `Men kutilmagan sovg‘a kitob tayyorlayapman${recipient ? ` — uni ${recipient} oladi` : ""}. Iltimos, bir-ikki iliq so‘z yozib yuboring — ular kitobga kiradi: ${link}`;
};
