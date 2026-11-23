import { readFileSync } from "node:fs";
import path from "node:path";
import * as fontkit from "fontkit";
import { beforeAll, describe, expect, it } from "vitest";
import { pageKit, type PageKit } from "@/components/interior/kit";
import type { LineBreaker, TextSpec } from "@/components/interior/line-breaker";
import { paginateChapter, previewTreeEntry } from "@/components/interior/pdf-tree";
import { pxUnits } from "@/components/interior/units";
import { editorBook, editorModel } from "@/lib/book/editor-data";
import { editorContent } from "@/lib/book/editor-estimate";
import { previewFromContent } from "@/lib/book/editor-model";
import { fontFaces } from "@/lib/book/fonts";
import { MM_TO_PT } from "@/lib/book/formats";
import { hyphenateWord } from "@/lib/book/hyphenate";
import { framedBox, placedByAuthor } from "@/lib/book/inline-photo";
import { breakLines, glyphAdvance } from "@/lib/book/linebreak";
import { textArea } from "@/lib/book/page-geometry";
import { flowMinLead } from "@/lib/book/typesetting";
import { photoPlaceOf } from "@/lib/book/photo-place";
import { fixtureSample, fixtureVariants, type FixtureBook } from "./fixtures/books";
import { useFixtureStorage } from "./fixtures/photos";

// Разбивка превью на полосы (components/interior/pdf-tree.ts → lib/book/paginate.ts) — без браузера, со строками по
// fontkit (ширины те же, что у canvas в превью): у каждой главы те же полосы и с тех же полос начинаются ответы, что в
// печатном PDF. В браузере то же сверяет scripts/visual/parity.ts.

/** Разбивка строк по fontkit — как createLineBreaker в браузере (ширины — продвижения глифов с кернингом). */
function nodeBreaker(language: "ru" | "kk" | "uz" | "en"): LineBreaker {
  const fonts = new Map<string, { layout: (s: string) => { advanceWidth: number }; unitsPerEm: number }>();
  const measure = (spec: TextSpec) => {
    const def = fontFaces[spec.font];
    const style = spec.italic ? "italic" : "normal";
    const pool = def.faces.filter((f) => f.style === style);
    const face = (pool.length ? pool : def.faces).reduce((a, b) => (Math.abs(b.weight - spec.weight) < Math.abs(a.weight - spec.weight) ? b : a));
    let f = fonts.get(face.file);
    if (!f) fonts.set(face.file, (f = fontkit.create(readFileSync(path.join("assets/fonts", face.file))) as unknown as { layout: (s: string) => { advanceWidth: number }; unitsPerEm: number }));
    const font = f;
    return (s: string) => (font.layout(s).advanceWidth * spec.size) / font.unitsPerEm + (spec.tracking ?? 0) * [...s].length;
  };
  const breaker: LineBreaker = (req) => {
    const runs = req.runs?.length ? req.runs : [{ start: 0, end: req.text.length, spec: req.spec }];
    const shown = runs.map((r) => (r.spec.upper ? req.text.slice(r.start, r.end).toUpperCase() : req.text.slice(r.start, r.end))).join("");
    const parts = runs.map((r) => ({ ...r, advance: glyphAdvance(shown.slice(r.start, r.end), measure(r.spec)) }));
    const advance = (a: number, b: number) => parts.reduce((w, r) => (Math.min(b, r.end) > Math.max(a, r.start) ? w + r.advance(Math.max(a, r.start) - r.start, Math.min(b, r.end) - r.start) : w), 0);
    return breakLines({ text: shown, runs, syllables: req.hyphens ? (w) => hyphenateWord(w, language) : (w) => [w], advance, widths: [req.width - (req.indent ?? 0), req.width], justify: req.justify });
  };
  breaker.width = (spec, text) => measure(spec)(spec.upper ? text.toUpperCase() : text);
  return breaker;
}

let render: typeof import("@/modules/production/infrastructure/pdf/render");
beforeAll(async () => {
  await useFixtureStorage();
  render = await import("@/modules/production/infrastructure/pdf/render");
});

const books = [...fixtureSample(), ...fixtureVariants()].filter((b) => ["classic-a5-ru", "antique-a5-ru", "luna-a5-kk", "magazine-square-ru", "kids-square-kk", "cinema-a5-ru", "thin", "blank"].includes(b.key));

describe("полосы превью — как у PDF (без браузера)", () => {
  it.each(books.map((b) => [b.key, b] as const))("%s: полос у глав и начала ответов", async (_, { bundle }: FixtureBook) => {
    const letters = (bundle.letters ?? []).filter((l) => l.status === "approved");
    const model = editorModel(bundle.book, bundle.questions, bundle.chapters, bundle.photos, letters);
    const eb = editorBook(bundle.book, model.coverPhotos);
    const content = editorContent(eb, model.questions, model.photos, model.letters, model.chapters);
    const { chapters } = previewFromContent(content, model.questions, model.photos, { currentId: null, tocLines: bundle.book.tocLines, epigraphs: model.epigraphs, places: photoPlaceOf(content, model.photos, eb) });
    const kit: PageKit = { ...pageKit(content.interior, content.format, pxUnits(1), content.language, undefined, nodeBreaker(content.language)), decides: true };
    const area = textArea(content.format);

    const res = await render.renderInterior({ ...bundle, letters }, "preview");
    for (const ch of chapters) {
      const entries = ch.entries.map((e) => previewTreeEntry(e, content.interior.plainAnswers));
      const rowHeights = new Map<string, number>();
      for (const e of entries)
        for (const [key, rows] of e.rows)
          rows.forEach((row, r) => {
            if (!placedByAuthor(row[0].style) && !row.some((x) => x.style.keepSize)) rowHeights.set(`r:${e.id}:${key}:${r}`, Math.max(...row.map((x) => framedBox(x.p, x.style, area.w * MM_TO_PT, area.h * MM_TO_PT, row.length).outerH)));
          });
      const hasText = ch.entries.some((e) => e.answer || e.photos.length || e.media.length);
      const ours = paginateChapter({ kit, chapterKey: ch.key, entries, start: content.chapterStart, measured: new Map(), hasText, rowHeights, minLead: flowMinLead(content.interior, kit.sizes), pageHeight: area.h * MM_TO_PT });
      expect(ours, ch.key).not.toBeNull();
      // PDF: полосы главы (текст и фото внутри текста) и первая полоса каждого ответа от начала текста главы.
      const pages = res.pages.filter((p) => p.chapterKey === ch.key && (p.kind === "text" || p.kind === "photo"));
      const firstText = pages[0]?.n ?? 0;
      const photoAfter = ch.photoPages?.length ?? 0;
      expect(ours!.pages + photoAfter, `${ch.key}: полос`).toBe(pages.length);
      const item = (id: string) => id.split(":")[1];
      for (const e of ch.entries) {
        const pdf = res.entryPages[e.id];
        if (!pdf) continue;
        const piece = ours!.pieces.find((p) => item(p.id) === e.id);
        expect(piece?.page, `${ch.key}/${e.id}`).toBe(pdf - firstText);
      }
    }
  });
});
