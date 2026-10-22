import "server-only";
import path from "node:path";
import type { ReactElement } from "react";
import { Font, renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import hyphenRu from "hyphen/ru/index.js";
import { fontFaces, type FontKey } from "@/lib/book/fonts";
import { hyphenateKk, isKazakhWord } from "@/lib/book/hyphen-kk";

let registered = false;

export function fontsDir() {
  return path.join(process.cwd(), "assets", "fonts");
}

export function ensureFonts() {
  if (registered) return;
  for (const key of Object.keys(fontFaces) as FontKey[]) {
    const def = fontFaces[key];
    Font.register({
      family: def.family,
      fonts: def.faces.map((f) => ({ src: path.join(fontsDir(), f.file), fontWeight: f.weight, fontStyle: f.style })),
    });
  }
  const cache = new Map<string, string[]>();
  Font.registerHyphenationCallback((word) => {
    if (word.length < 6) return [word];
    let parts = cache.get(word);
    if (!parts) {
      // Слова с казахскими буквами — по слоговым правилам, остальные — по русским шаблонам.
      parts = isKazakhWord(word) ? hyphenateKk(word) : hyphenRu.hyphenateSync(word, { minWordLength: 6 }).split("­");
      if (cache.size < 50_000) cache.set(word, parts);
    }
    return parts;
  });
  registered = true;
}

let renderQueue: Promise<unknown> = Promise.resolve();

/**
 * Собирает PDF строго по одному на процесс. Шрифты react-pdf общие для всех документов, и две сборки
 * одновременно портят подмножество шрифта: из надписей пропадают буквы (заказ №14 — «ИТАЛИЙ» на титуле).
 */
export function renderPdf(document: ReactElement<DocumentProps>): Promise<Buffer> {
  const run = renderQueue.then(() => renderToBuffer(document));
  renderQueue = run.catch(() => undefined);
  return run;
}

/** Подбирает ближайшее зарегистрированное начертание, чтобы react-pdf не падал на отсутствующем весе. */
export function face(key: FontKey, weight = 400, italic = false): { fontFamily: string | string[]; fontWeight: number; fontStyle: "normal" | "italic" } {
  const def = fontFaces[key];
  const style = italic ? "italic" : "normal";
  const candidates = def.faces.filter((f) => f.style === style);
  const pool = candidates.length ? candidates : def.faces;
  const best = pool.reduce((a, b) => (Math.abs(b.weight - weight) < Math.abs(a.weight - weight) ? b : a));
  // Знаки, которых нет в шрифте (₸, №, многоточие), react-pdf берёт из запасного — он идёт вторым в списке.
  const fontFamily: string | string[] = def.fallback ? [def.family, fontFaces[def.fallback].family] : def.family;
  return { fontFamily, fontWeight: best.weight, fontStyle: best.style };
}
