/**
 * Орфография по словарю: какие слова ответа отправлять на проверку и как превратить ответ сервера
 * в замечания. Сам словарь (Hunspell) живёт на сервере — см. server/spell.ts.
 *
 * Проверяем только то, где словарь надёжен: русские слова строчными буквами. Слова с заглавной
 * (имена, названия, начало предложения), казахские (ә, ғ, қ, ң, ө, ұ, ү, һ, і), латиница, слова
 * с цифрами и имена из книги — пропускаем: иначе книга о любви пестрела бы красным на каждом имени.
 */
import type { Issue } from "./types";

interface WordAt {
  word: string;
  start: number;
  end: number;
}

const WORD = /[\p{L}]+(?:[-'’][\p{L}]+)*/gu;
const KAZAKH = /[әғқңөұүһіӘҒҚҢӨҰҮҺІ]/u;
const RUSSIAN_ONLY = /^[а-яё]+(?:-[а-яё]+)*$/u;

/** Слова ответа, которые стоит проверить словарём. */
export function spellCandidates(text: string, ignore: (word: string) => boolean = () => false): WordAt[] {
  const out: WordAt[] = [];
  for (const m of text.matchAll(WORD)) {
    const word = m[0];
    if (word.length < 3 || KAZAKH.test(word) || !RUSSIAN_ONLY.test(word) || ignore(word)) continue;
    out.push({ word, start: m.index, end: m.index + word.length });
  }
  return out;
}

/** Уникальные слова для запроса к серверу (без уже известных). */
export function wordsToCheck(candidates: WordAt[], known: Map<string, string[] | null>, limit = 300): string[] {
  const set = new Set<string>();
  for (const c of candidates) {
    if (!known.has(c.word)) set.add(c.word);
    if (set.size >= limit) break;
  }
  return [...set];
}

/** Замечания по результатам словаря: null — слово верное, массив — варианты исправления. */
export function spellIssues(candidates: WordAt[], known: Map<string, string[] | null>): Issue[] {
  return candidates.flatMap((c) => {
    const suggestions = known.get(c.word);
    if (!suggestions) return [];
    return [{ key: `spell|${c.word}`, start: c.start, end: c.end, kind: "spelling" as const, rule: "spell", replacements: suggestions.slice(0, 4), source: "spell" as const }];
  });
}
