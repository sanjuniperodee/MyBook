/**
 * Что из текста автора можно напечатать. Лёгкий модуль без зависимостей: им же чистят превью в браузере,
 * чтобы обложка в кабинете и PDF не расходились.
 */

/** Эмодзи (кроме ©, ®, ™), их модификаторы, склейки и флаги: в книжных шрифтах их нет — в печати они превращаются в мусор. */
const EMOJI = /(?![©®™])\p{Extended_Pictographic}|\p{Emoji_Modifier}|[\u200D\uFE0E\uFE0F\u20E3]|[\u{1F1E6}-\u{1F1FF}]/gu;

/** Есть ли в тексте эмодзи, которые не напечатаются. */
export function hasEmoji(text: string) {
  EMOJI.lastIndex = 0;
  const found = EMOJI.test(text);
  EMOJI.lastIndex = 0;
  return found;
}

/** Текст для печати: без эмодзи и оставшихся после них лишних пробелов. */
export function printableText(text: string) {
  if (!hasEmoji(text)) return text;
  return text
    .replace(EMOJI, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([,.!?…:;)»”])/g, "$1")
    .replace(/[ \t]+$/gm, "")
    .trim();
}
