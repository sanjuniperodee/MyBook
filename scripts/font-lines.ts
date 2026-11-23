/**
 * Высота строки без интерлиньяжа у каждого начертания → src/lib/book/font-lines.ts. react-pdf ставит текст без
 * lineHeight (подписи под фото, «* * *») строками высотой (ascent − descent + lineGap) шрифта (textkit: height); превью
 * ставит их той же высотой — иначе ряд фото с подписью у него выше, и полосы расходятся.
 *
 *   node_modules/.bin/tsx scripts/font-lines.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import * as fontkit from "fontkit";
import { fontFaces, type FontKey } from "../src/lib/book/fonts";

interface FontkitFont {
  unitsPerEm: number;
  ascent: number;
  descent: number;
  lineGap: number;
}

const dir = path.join(process.cwd(), "assets", "fonts");
const lines: string[] = [];
for (const key of Object.keys(fontFaces) as FontKey[])
  for (const f of fontFaces[key].faces) {
    const font = fontkit.create(readFileSync(path.join(dir, f.file))) as unknown as FontkitFont;
    lines.push(`  "${f.file}": ${Math.round(((font.ascent - font.descent + font.lineGap) / font.unitsPerEm) * 100000) / 100000},`);
  }
writeFileSync(
  path.join(process.cwd(), "src/lib/book/font-lines.ts"),
  `// Создано scripts/font-lines.ts — не править руками. Высота строки без интерлиньяжа, доли кегля: (ascent − descent + lineGap) / em.\nexport const FONT_LINES: Record<string, number> = {\n${lines.join("\n")}\n};\n`,
);
