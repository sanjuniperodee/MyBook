import path from "node:path";
import * as fontkit from "fontkit";
import { Document, Page, Text } from "@react-pdf/renderer";
import { describe, expect, it } from "vitest";
import { breakLines, glyphAdvance, justifySpacing } from "@/lib/book/linebreak";
import { hyphenateWord } from "@/lib/book/hyphenate";
import { fontFaces, type FontKey } from "@/lib/book/fonts";
import { ensureFonts, face, fontsDir, renderPdf } from "@/modules/production/infrastructure/pdf/fonts";
import { fixtureTexts } from "./fixtures/texts";

// Разбивка строк превью (lib/book/linebreak.ts) — та же, что у react-pdf: на тех же ширинах из того же шрифта строки
// совпадают знак в знак. Ширины здесь — из fontkit (как у react-pdf), в браузере — из canvas по тем же шрифтам.

type Layout = {
  children?: Layout[];
  lines?: { string?: string; box?: { x: number; width: number }; runs?: { glyphs?: { codePoints?: number[] }[]; positions?: { xAdvance: number }[] }[] }[];
};

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

/** Строки абзаца react-pdf целиком (с позициями глифов после выключки). */
async function pdfLayoutLines(text: string, font: FontKey, size: number, width: number, lang: "ru" | "kk", indent = 0) {
  ensureFonts();
  let layout: Layout | undefined;
  await renderPdf(
    <Document onRender={(r) => (layout = (r as { _INTERNAL__LAYOUT__DATA_?: Layout })._INTERNAL__LAYOUT__DATA_)}>
      <Page size={{ width: width + 40, height: 3000 }} style={{ padding: 20 }}>
        <Text style={{ ...face(font), fontSize: size, lineHeight: 1.5, textAlign: "justify", textIndent: indent }}>{text}</Text>
      </Page>
    </Document>,
    lang,
  );
  const find = (n: Layout | undefined): NonNullable<Layout["lines"]> | null => (n?.lines ? n.lines : (n?.children ?? []).reduce<NonNullable<Layout["lines"]> | null>((acc, c) => acc ?? find(c), null));
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

describe("выключка по ширине — как у react-pdf", () => {
  // Слова в растянутой строке стоят там же, где их ставит textkit: пробел растёт до 1 pt, остальное — между буквами.
  const paragraphs = [...fixtureTexts.ru.answers.flat(), ...fixtureTexts.kk.answers.flat()].flatMap((a) => a.split("\n")).filter((p) => p.length > 80);
  const cases = paragraphs.slice(0, 16).map((p, i) => ({ p, font: (i % 2 ? "cormorant" : "ptserif") as FontKey, size: i % 2 ? 11 : 10, width: i % 3 ? 300 : 220, indent: i % 3 ? 0 : 12 }));

  it.each(cases.map((c, i) => [i, c] as const))("абзац %i: начала слов", async (_, c) => {
    const lang = /[әғқңөұүһі]/i.test(c.p) ? "kk" : "ru";
    const advance = fontkitAdvance(c.p, c.font, c.size);
    const hyphenAdvance = fontkitAdvance("-", c.font, c.size)(0, 1);
    const lines = breakLines({ text: c.p, syllables: (w) => hyphenateWord(w, lang), advance, widths: [c.width - c.indent, c.width], justify: true, hyphenAdvance });
    const pdf = await pdfLayoutLines(c.p, c.font, c.size, c.width, lang, c.indent);
    expect(pdf.length).toBe(lines.length);
    let checked = 0;
    lines.slice(0, -1).forEach((l, i) => {
      const glyphs = (pdf[i].runs ?? []).flatMap((r) => (r.glyphs ?? []).map((g, k) => ({ cp: g.codePoints ?? [], x: r.positions?.[k]?.xAdvance ?? 0 })));
      const text = c.p.slice(l.start, l.end).replace(/ +$/, "") + (l.hyphen ? "-" : "");
      // Глифы — по знакам (лигатур в этих шрифтах на кириллице нет); иначе строку не сверяем.
      if (glyphs.length < text.length) return;
      const { letter, space } = justifySpacing(text, (i === 0 ? c.width - c.indent : c.width) - l.natural!);
      if (process.env.DBG && i === 0) console.log(JSON.stringify({ text, natural: l.natural, box: pdf[i].box, gap: (i === 0 ? c.width - c.indent : c.width) - l.natural!, letter, space, pdfSum: glyphs.reduce((a, g) => a + g.x, 0), adv: text.split("").slice(0, 12).map((_, k) => +(advance(l.start + k, l.start + k + 1)).toFixed(3)), pdfx: glyphs.slice(0, 12).map((g) => +g.x.toFixed(3)), cps: glyphs.slice(0, 12).map((g) => g.cp) }));
      let pdfX = 0;
      for (let k = 0; k < text.length; k++) {
        if (k > 0 && text[k - 1] === " " && text[k] !== " ") {
          // Начало слова: ширина до него по шрифту + добавки после каждого знака (буква — letter, пробел — space).
          const before = text.slice(0, k);
          const spaces = before.split(" ").length - 1;
          const oursX = advance(l.start, l.start + k) + (k - spaces) * letter + spaces * space;
          expect(oursX, `строка ${i}, знак ${k}`).toBeCloseTo(pdfX, 2);
          checked++;
        }
        pdfX += glyphs[k].x;
      }
    });
    expect(checked).toBeGreaterThan(0);
  });
});
