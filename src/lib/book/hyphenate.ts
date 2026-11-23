/**
 * Переносы в основном тексте книги — одни для PDF и HTML-превью. PDF отдаёт их react-pdf (hyphenationCallback в
 * pdf/fonts.ts): слово — кусок между пробелами, со знаками препинания. Превью ставит в те же места мягкие переносы
 * (softHyphenate) и выключает переносы браузера: у браузера свои словари (а казахского нет вовсе), и строки
 * ломались бы в других местах, чем в книге.
 *
 * Модуль тяжёлый (шаблоны русского и английского — около 240 КБ), в браузер он грузится отдельно (import()).
 */
import hyphenEn from "hyphen/en-us/index.js";
import hyphenRu from "hyphen/ru/index.js";
import type { Locale } from "@/i18n/config";
import { hyphenateKk, isKazakhWord } from "./hyphen-kk";
import { hyphenateUz, isUzbekWord } from "./hyphen-uz";

/** Слова короче не переносим. */
const MIN_WORD = 6;
const SOFT_HYPHEN = "­";

const cache = new Map<string, string[]>();

/**
 * Слоги слова для переноса. Слова с казахскими буквами — по слоговым правилам; латиница — по языку книги (английские
 * шаблоны или узбекские слоги); остальные — по русским шаблонам.
 */
export function hyphenateWord(word: string, lang: Locale | undefined): string[] {
  if (word.length < MIN_WORD) return [word];
  const key = `${lang}:${word}`;
  let parts = cache.get(key);
  if (!parts) {
    parts = isKazakhWord(word)
      ? hyphenateKk(word)
      : isUzbekWord(word)
        ? lang === "en"
          ? hyphenEn.hyphenateSync(word, { minWordLength: MIN_WORD }).split(SOFT_HYPHEN)
          : hyphenateUz(word)
        : hyphenRu.hyphenateSync(word, { minWordLength: MIN_WORD }).split(SOFT_HYPHEN);
    if (cache.size < 50_000) cache.set(key, parts);
  }
  return parts;
}

/** Текст с мягкими переносами там же, где их ставит PDF: слова — куски между пробелами, как у react-pdf. */
export function softHyphenate(text: string, lang: Locale): string {
  return text
    .split(/([ ]+)/g)
    .map((w) => (w.includes(SOFT_HYPHEN) || w.trim() === "" ? w : hyphenateWord(w, lang).join(SOFT_HYPHEN)))
    .join("");
}
