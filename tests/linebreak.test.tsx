import path from "node:path";
import * as fontkit from "fontkit";
import { Document, Page, Text } from "@react-pdf/renderer";
import { describe, expect, it } from "vitest";
import { breakLines, glyphAdvance } from "@/lib/book/linebreak";
import { hyphenateWord } from "@/lib/book/hyphenate";
import { fontFaces, type FontKey } from "@/lib/book/fonts";
import { ensureFonts, face, fontsDir, renderPdf } from "@/modules/production/infrastructure/pdf/fonts";
import { fixtureTexts } from "./fixtures/texts";

// Разбивка строк превью (lib/book/linebreak.ts) — та же, что у react-pdf: на тех же ширинах из того же шрифта строки
// совпадают знак в знак. Ширины здесь — из fontkit (как у react-pdf), в браузере — из canvas по тем же шрифтам.

type Layout = { children?: Layout[]; lines?: { string?: string }[] };

/** Строки абзаца, как их поставил react-pdf: Text шириной width на полосе. */
async function pdfLines(text: string, font: FontKey, size: number, width: number, lang: "ru" | "kk", align: "justify" | "left", indent = 0): Promise<string[]> {
  ensureFonts();
  let layout: Layout | undefined;
  await renderPdf(
    <Document onRender={(r) => (layout = (r as { _INTERNAL__LAYOUT__DATA_?: Layout })._INTERNAL__LAYOUT__DATA_)}>
      <Page size={{ width: width + 40, height: 3000 }} style={{ padding: 20 }}>
        <Text style={{ ...face(font), fontSize: size, lineHeight: 1.5, textAlign: align, textIndent: indent }}>{text}</Text>
      </Page>
    </Document>,
    lang,
  );
  const find = (n: Layout | undefined): string[] | null => (n?.lines ? n.lines.map((l) => l.string ?? "") : (n?.children ?? []).reduce<string[] | null>((acc, c) => acc ?? find(c), null));
  return find(layout) ?? [];
}

/** Ширина текста по fontkit — как у react-pdf (раскладка глифов с кернингом). */
function fontkitAdvance(text: string, font: FontKey, size: number) {
  const file = path.join(fontsDir(), fontFaces[font].faces.find((f) => f.weight === face(font).fontWeight && f.style === "normal")!.file);
  const f = (fontkit as unknown as { openSync: (p: string) => unknown }).openSync(file) as { layout: (s: string) => { advanceWidth: number }; unitsPerEm: number };
  return glyphAdvance(text, (s) => (f.layout(s).advanceWidth * size) / f.unitsPerEm);
}

const ours = (text: string, font: FontKey, size: number, width: number, lang: "ru" | "kk", align: "justify" | "left", indent = 0) =>
  breakLines({ text, syllables: (w) => hyphenateWord(w, lang), advance: fontkitAdvance(text, font, size), widths: [width - indent, width], justify: align === "justify" }).map(
    (l) => text.slice(l.start, l.end) + (l.hyphen ? "-" : ""),
  );

describe("разбивка строк — как у react-pdf", () => {
  const paragraphs = [...fixtureTexts.ru.answers.flat(), ...fixtureTexts.kk.answers.flat()].flatMap((a) => a.split("\n")).filter((p) => p.length > 80);
  const cases = paragraphs.slice(0, 24).flatMap((p, i) => [
    { p, font: "ptserif" as FontKey, size: 10, width: 300, align: "justify" as const, indent: i % 3 ? 0 : 12 },
    { p, font: "cormorant" as FontKey, size: 11, width: 250, align: "left" as const, indent: 0 },
  ]);

  it.each(cases.map((c, i) => [i, c] as const))("абзац %i", async (_, c) => {
    const lang = /[әғқңөұүһі]/i.test(c.p) ? "kk" : "ru";
    const pdf = await pdfLines(c.p, c.font, c.size, c.width, lang, c.align, c.indent);
    expect(ours(c.p, c.font, c.size, c.width, lang, c.align, c.indent)).toEqual(pdf);
  });
});
