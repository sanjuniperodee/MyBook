/**
 * Ширины знаков шрифтов реестра → src/lib/book/font-widths.ts. По ним PDF и HTML одинаково уменьшают кегль
 * названия, если самое длинное слово не помещается в строку (см. word-fit.ts). Для каждого шрифта берётся самое
 * широкое прямое начертание: оценка с запасом, кегль никогда не оказывается больше, чем помещается.
 *
 *   node_modules/.bin/tsx scripts/font-widths.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import * as fontkit from "fontkit";
import { fontFaces, type FontKey } from "../src/lib/book/fonts";
import { WIDTH_CHARS } from "../src/lib/book/word-fit-chars";

interface FontkitFont {
  unitsPerEm: number;
  hasGlyphForCodePoint(cp: number): boolean;
  glyphForCodePoint(cp: number): { advanceWidth: number };
}

const dir = path.join(process.cwd(), "assets", "fonts");
const chars = [...WIDTH_CHARS];
const out: Record<string, number[]> = {};

for (const key of Object.keys(fontFaces) as FontKey[]) {
  const faces = fontFaces[key].faces.filter((f) => f.style === "normal");
  const fonts = faces.map((f) => fontkit.create(readFileSync(path.join(dir, f.file))) as FontkitFont);
  out[key] = chars.map((ch) => {
    const cp = ch.codePointAt(0)!;
    let max = 0;
    for (const f of fonts) if (f.hasGlyphForCodePoint(cp)) max = Math.max(max, f.glyphForCodePoint(cp).advanceWidth / f.unitsPerEm);
    // 0 — знака нет: word-fit возьмёт среднюю ширину шрифта.
    return Math.round(max * 1000);
  });
}

const body = (Object.keys(out) as FontKey[]).map((k) => `  ${k}: [${out[k].join(",")}],`).join("\n");
writeFileSync(
  path.join(process.cwd(), "src/lib/book/font-widths.ts"),
  `// Создано scripts/font-widths.ts — не править руками. Ширины знаков WIDTH_CHARS, тысячные доли кегля.\nimport type { FontKey } from "./fonts";\n\nexport const FONT_WIDTHS: Record<FontKey, number[]> = {\n${body}\n};\n`,
);
console.log(`font-widths: ${Object.keys(out).length} шрифтов × ${chars.length} знаков`);
