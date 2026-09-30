/**
 * Переносы для казахского текста. Готовых шаблонов под казахский в пакете hyphen нет, а русские
 * рвут слова с ә/ғ/қ/ң/ө/ұ/ү/һ/і как попало. Казахский слог устроен просто, поэтому хватает правил:
 *   V-CV   (а-на)       одна согласная уходит к следующему слогу;
 *   VC-CV  (қар-лы)     из группы согласных к следующему слогу уходит последняя;
 *   V-V    (редко, в заимствованиях).
 * «у» и «и» после гласной — полугласные (ауыл, биік не делим как гласную пару).
 * У края слова оставляем минимум по две буквы, ь и ъ не отрываем от предыдущей согласной.
 */

const VOWELS = new Set("аәеёиоөуұүыіэюя");
const KAZAKH_ONLY = /[әғқңөұүһі]/i;

export function isKazakhWord(word: string) {
  return KAZAKH_ONLY.test(word);
}

export function hyphenateKk(word: string, minLength = 6): string[] {
  const chars = [...word];
  if (chars.length < minLength) return [word];
  const lower = chars.map((c) => c.toLowerCase());
  const isLetter = (i: number) => /\p{L}/u.test(chars[i] ?? "");
  const vowel = lower.map((c, i) => VOWELS.has(c) && !((c === "у" || c === "и") && i > 0 && VOWELS.has(lower[i - 1])));

  const nuclei = vowel.flatMap((v, i) => (v ? [i] : []));
  const cuts: number[] = [];
  for (let k = 0; k < nuclei.length - 1; k++) {
    const a = nuclei[k];
    const b = nuclei[k + 1];
    let cut = b - 1 > a ? b - 1 : b;
    if (lower[cut] === "ь" || lower[cut] === "ъ") cut += 1;
    // Перенос только внутри сплошного слова и не ближе двух букв к краям.
    const left = chars.slice(0, cut).filter((_, i) => isLetter(i)).length;
    const right = chars.slice(cut).filter((_, i) => isLetter(cut + i)).length;
    if (cut <= a || cut > b || left < 2 || right < 2 || !isLetter(cut - 1) || !isLetter(cut)) continue;
    cuts.push(cut);
  }
  if (!cuts.length) return [word];
  const parts: string[] = [];
  let start = 0;
  for (const c of cuts) {
    parts.push(chars.slice(start, c).join(""));
    start = c;
  }
  parts.push(chars.slice(start).join(""));
  return parts;
}
