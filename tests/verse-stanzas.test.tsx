import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { estimateAnswerPages, textMetrics } from "@/lib/book/estimate";
import { getFormat } from "@/lib/book/formats";
import { getInteriorDesign } from "@/lib/book/interiors";
import { ANSWER } from "@/lib/book/typesetting";
import { renderInterior, type BookBundle } from "@/modules/production/infrastructure/pdf/render";
import type { Book, BookQuestion } from "@/shared/infrastructure/db/schema";
import { hasTool, textRows } from "./pdf-inspect";

// Строфы стихов: пустая строка автора между строфами — просвет ANSWER.verse.stanza в PDF и в оценке объёма одинаково.

const now = new Date();
const book: Book = {
  id: "00000000-0000-0000-0000-000000000001",
  userId: "00000000-0000-0000-0000-000000000002",
  theme: "love",
  status: "draft",
  title: "Ты — моё всё",
  subtitle: "",
  authorName: "Алия",
  authorGender: "f",
  recordedBy: "",
  recipientName: "Марғұлан",
  recipientGender: "m",
  hideRecipientOnCover: false,
  namesOnCover: "",
  coverTemplate: "midnight",
  coverPhotoId: null,
  coverPhotoExtra: [],
  backText: "",
  backLayout: "quote",
  backPhotoId: null,
  backPhotoExtra: [],
  photoFrames: {},
  dedication: "Моему самому близкому человеку",
  interior: "classic",
  interiorStyle: {},
  coverDesign: null,
  coverBack: null,
  format: "a5",
  photoPlacement: "chapters",
  showToc: true,
  tocMode: "chapters",
  tocLines: {},
  layoutRev: 2,
  paginationRev: 2,
  inviteToken: null,
  inviteText: "",
  endText: null,
  titlePage: true,
  chapterStart: "page",
  occasion: null,
  occasionDate: null,
  language: "ru",
  createdAt: now,
  updatedAt: now,
};


const stanzas = [
  ["Ауылым менің, туған жерім.", "Саған сәлем, қуаныш пен өрім!", "Көктем келді, көңіл тасыды.", "Жүрегімде әнім жасады."],
  ["Күзде алтын, жазда жасыл.", "Сенде өтті балалық шақ.", "Жаңбыр жауды, шықты қасың.", "Сағындым мен, сені, бақ!"],
  ["Анам айтқан әндер қалды.", "Әкем айтқан сөздер қалды.", "Көкте құстар қайтқан сайын.", "Көзде жас та, күлкі қалды."],
];
// Без точек в конце строк: так и без пустых строк это стихи (прежнее правило), и сравнивать можно одну и ту же вёрстку.
const poem = (glue: string) => stanzas.map((s) => s.map((l) => l.replace(/[.!]+$/, "")).join("\n")).join(glue);

const bundleOf = (answer: string): BookBundle => ({
  book,
  questions: [{ id: "q0", bookId: book.id, position: 0, chapter: "intro", questionKey: null, prompt: "Вопрос", title: "Стихи", hideHeading: false, pageBreak: false, displayText: null, hint: null, answer, media: [], createdAt: now, updatedAt: now } satisfies BookQuestion],
  chapters: [],
  photos: [],
});

describe("строфы стихов", () => {
  const m = textMetrics(getFormat("a5"), getInteriorDesign("classic"));
  const gapPt = m.sizes.body * ANSWER.verse.stanza;

  it("оценка: каждая строфа после первой добавляет просвет, без пустых строк — прежняя высота", () => {
    const plain = estimateAnswerPages(null, poem("\n"), [], m);
    const spaced = estimateAnswerPages(null, poem("\n\n"), [], m);
    expect((spaced - plain) * m.height).toBeCloseTo(2 * gapPt, 5);
  });

  it.skipIf(!hasTool("pdftotext"))("PDF: между строфами тот же просвет, что в оценке; внутри строфы — обычный шаг строк", async () => {
    const rows = async (answer: string) => {
      const res = await renderInterior(bundleOf(answer), "preview");
      const file = path.join(mkdtempSync(path.join(tmpdir(), "verse-stanzas-")), "book.pdf");
      writeFileSync(file, res.pdf);
      const page = textRows(file).find((rs) => rs.some((r) => r.text.includes("Ауылым менің")))!;
      const first = page.findIndex((r) => r.text.includes("Ауылым менің"));
      return page.slice(first, first + 12);
    };
    const joined = await rows(poem("\n"));
    expect(joined).toHaveLength(12);
    const spaced = await rows(poem("\n\n"));
    expect(spaced.map((r) => r.text)).toEqual(joined.map((r) => r.text));
    const diffs = spaced.slice(1).map((r, i) => r.top - spaced[i].top - (joined[i + 1].top - joined[i].top));
    // Просвет — перед 5-й и 9-й строками (индексы 3 и 7), остальные промежутки без изменений.
    diffs.forEach((d, i) => (i === 3 || i === 7 ? expect(d).toBeCloseTo(gapPt, 0) : expect(Math.abs(d)).toBeLessThan(0.6)));
  });
});
