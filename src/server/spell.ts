import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadModule } from "hunspell-asm";

/**
 * Русский орфографический словарь (Hunspell, словарь LibreOffice — assets/dictionaries) в WebAssembly:
 * ~25 МБ памяти, загрузка ~0,1 с, проверка слова — микросекунды. Грузится при первой проверке.
 */
type Checker = { spell(word: string): boolean; suggest(word: string): string[] };

let checker: Promise<Checker> | undefined;

function load(): Promise<Checker> {
  return (checker ??= (async () => {
    const dir = path.join(process.cwd(), "assets", "dictionaries");
    const [factory, aff, dic] = await Promise.all([loadModule(), readFile(path.join(dir, "ru.aff")), readFile(path.join(dir, "ru.dic"))]);
    return factory.create(factory.mountBuffer(aff, "ru.aff"), factory.mountBuffer(dic, "ru.dic"));
  })().catch((err) => {
    checker = undefined;
    throw err;
  }));
}

/** Слово верное целиком или по частям через дефис («красно-синий»), в том числе с «е» вместо «ё». */
function correct(h: Checker, word: string) {
  if (h.spell(word)) return true;
  if (word.includes("-") && word.split("-").every((p) => p.length < 2 || h.spell(p))) return true;
  return false;
}

/** Неверные слова и до 4 вариантов исправления (слова без вариантов тоже отмечаются). */
export async function misspelled(words: string[]): Promise<Record<string, string[]>> {
  const h = await load();
  const out: Record<string, string[]> = {};
  for (const w of words) {
    if (correct(h, w)) continue;
    out[w] = h
      .suggest(w)
      .filter((s) => s !== w && !/\s/.test(s) && s.toLowerCase() === s)
      .slice(0, 4);
  }
  return out;
}
