/**
 * Переносы для узбекского текста (латиница). Готовых шаблонов в пакете hyphen нет, а русские на латинице не работают
 * (слова не рвутся вовсе). Слог устроен просто, поэтому хватает правил, как в казахском (hyphen-kk.ts):
 *   V-CV   (ki-tob)    одна согласная уходит к следующему слогу;
 *   VC-CV  (qa-lam-dan, bog‘-lam) из группы согласных к следующему слогу уходит последняя.
 * Единицы, которые не делятся: o‘ и g‘ (с апострофом U+2018 или U+2019), sh, ch, ng — это одна буква.
 * У края слова оставляем минимум по две буквы.
 */

/** Слово целиком из латиницы и апострофов узбекской записи. */
export function isUzbekWord(word: string) {
  return /^[A-Za-z‘’]+$/.test(word);
}

const VOWELS = new Set(["a", "e", "i", "o", "u", "o‘", "o’"]);

/** Делит слово на «буквы» узбекского алфавита: o‘, g‘, sh, ch, ng — одна единица. */
function letters(word: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < word.length; i++) {
    const two = word.slice(i, i + 2).toLowerCase();
    if (/^[og][‘’]$/.test(two) || two === "sh" || two === "ch" || two === "ng") {
      out.push(word.slice(i, i + 2));
      i++;
    } else out.push(word[i]);
  }
  return out;
}

export function hyphenateUz(word: string, minLength = 6): string[] {
  if (!isUzbekWord(word) || word.length < minLength) return [word];
  const units = letters(word);
  const isVowel = units.map((u) => VOWELS.has(u.toLowerCase()));
  const nuclei = isVowel.flatMap((v, i) => (v ? [i] : []));
  const cuts: number[] = [];
  for (let k = 0; k < nuclei.length - 1; k++) {
    const a = nuclei[k];
    const b = nuclei[k + 1];
    // между гласными a и b: одна согласная — к следующему слогу; группа — последняя согласная к следующему
    const cut = b - 1 > a ? b - 1 : b;
    cuts.push(cut);
  }
  const parts: string[] = [];
  let from = 0;
  for (const cut of cuts) {
    const left = units.slice(from, cut).join("");
    const right = units.slice(cut).join("");
    if (left.length >= 2 && right.length >= 2) {
      parts.push(left);
      from = cut;
    }
  }
  parts.push(units.slice(from).join(""));
  return parts;
}
