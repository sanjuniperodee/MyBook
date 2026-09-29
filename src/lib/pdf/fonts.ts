import "server-only";
import path from "node:path";
import { Font } from "@react-pdf/renderer";
import hyphenRu from "hyphen/ru/index.js";
import { fontFaces, type FontKey } from "../book/fonts";

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
      parts = hyphenRu.hyphenateSync(word, { minWordLength: 6 }).split("­");
      if (cache.size < 50_000) cache.set(word, parts);
    }
    return parts;
  });
  registered = true;
}

/** Подбирает ближайшее зарегистрированное начертание, чтобы react-pdf не падал на отсутствующем весе. */
export function face(key: FontKey, weight = 400, italic = false) {
  const def = fontFaces[key];
  const style = italic ? "italic" : "normal";
  const candidates = def.faces.filter((f) => f.style === style);
  const pool = candidates.length ? candidates : def.faces;
  const best = pool.reduce((a, b) => (Math.abs(b.weight - weight) < Math.abs(a.weight - weight) ? b : a));
  return { fontFamily: def.family, fontWeight: best.weight, fontStyle: best.style } as const;
}
