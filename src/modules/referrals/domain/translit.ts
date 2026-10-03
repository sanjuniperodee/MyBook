/** Имя клиента латиницей — для кода-приглашения (русские и казахские буквы). */

const LETTERS: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o",
  п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu",
  я: "ya", ә: "a", ғ: "g", қ: "q", ң: "n", ө: "o", ұ: "u", ү: "u", һ: "h", і: "i",
};

/** Латиница для кода: «Асель» → ASEL, «Әсем» → ASEM. Буквы других алфавитов отбрасываются. */
export function latinName(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? "";
  const latin = [...first.toLowerCase()].map((ch) => LETTERS[ch] ?? ch).join("");
  return latin.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 10);
}
