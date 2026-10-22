import { describe, expect, it } from "vitest";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFString } from "pdf-lib";
import { contentFor, renderInterior, type BookBundle } from "@/modules/production/infrastructure/pdf/render";
import { estimatePages } from "@/lib/book/estimate";
import type { AnswerMedia, Book, BookQuestion } from "@/shared/infrastructure/db/schema";

const now = new Date();
const book: Book = {
  id: "00000000-0000-0000-0000-000000000001",
  userId: "00000000-0000-0000-0000-000000000002",
  theme: "mom",
  status: "draft",
  title: "Анама",
  subtitle: "",
  authorName: "Айгерим",
  authorGender: "f",
  recordedBy: "",
  recipientName: "Анашым",
  recipientGender: "f",
  hideRecipientOnCover: false,
  namesOnCover: "",
  coverTemplate: "linen",
  coverPhotoId: null,
  coverPhotoExtra: [],
  backText: "",
  backLayout: "quote",
  backPhotoId: null,
  backPhotoExtra: [],
  photoFrames: {},
  dedication: "",
  interior: "classic",
  interiorStyle: {},
  coverDesign: null,
  format: "a5",
  photoPlacement: "chapters",
  showToc: false,
  tocMode: "chapters",
  tocLines: {},
  inviteToken: null,
  occasion: null,
  occasionDate: null,
  language: "kk",
  createdAt: now,
  updatedAt: now,
};

const card = (id: string, anchor: number | null, kind: AnswerMedia["kind"] = "video", title = "Әжеміздің тілегі — бүкіл әулет атынан, ең жақсы тілектермен"): AnswerMedia => ({
  id,
  kind,
  url: `https://youtu.be/dQw4w9WgXcQ?t=${id.length}`,
  title,
  anchor,
});

const paragraph = "Біз сол күні таңертең ерте тұрдық, ауада жаңбырдың иісі бар еді. Анам бәрімізге шай құйып, күліп отырды. ";
const questions: BookQuestion[] = [
  // Текст и карточки между абзацами и в конце.
  { media: [card("a", -1), card("bb", 0, "music", "Күй «Адай»"), card("ccc", null)], answer: [paragraph.repeat(3), paragraph.repeat(2), paragraph].join("\n") },
  // Ответ без текста: только пожелания на видео.
  { media: Array.from({ length: 6 }, (_, i) => card(`v${"x".repeat(i)}`, null, "video", `Тілек ${i + 1}`)), answer: "" },
  { media: [], answer: paragraph.repeat(8) },
].map((q, i) => ({
  id: `q${i}`,
  bookId: book.id,
  position: i,
  chapter: ["intro", "intro", "family"][i],
  questionKey: null,
  prompt: "Сұрақ",
  title: `Тақырып ${i + 1}`,
  hint: null,
  displayText: null,
  hideHeading: false,
  pageBreak: false,
  createdAt: now,
  updatedAt: now,
  ...q,
}));

/** URI ссылок на полосах PDF. */
async function linkUris(pdf: Buffer) {
  const doc = await PDFDocument.load(pdf);
  const uris: string[] = [];
  for (const page of doc.getPages()) {
    const annots = page.node.lookupMaybe(PDFName.of("Annots"), PDFArray);
    for (let i = 0; i < (annots?.size() ?? 0); i++) {
      const a = annots!.lookup(i, PDFDict);
      const uri = a.lookupMaybe(PDFName.of("A"), PDFDict)?.lookup(PDFName.of("URI"));
      if (uri instanceof PDFString) uris.push(uri.decodeText());
    }
  }
  return uris;
}

describe("PDF: QR-коды видео и музыки", () => {
  it.each(["classic", "romance", "editorial", "herbarium", "oyu", "album", "confetti", "luna"])("оформление %s: число полос совпадает с оценкой", async (interior) => {
    const bundle: BookBundle = { book: { ...book, interior }, questions, chapters: [], photos: [] };
    const res = await renderInterior(bundle, "reading");
    expect(res.contentPages).toBe(estimatePages(contentFor(bundle)));
  });

  it("в электронной версии карточки — ссылки, в печатной — нет", async () => {
    const bundle: BookBundle = { book, questions, chapters: [], photos: [] };
    const reading = await linkUris((await renderInterior(bundle, "reading")).pdf);
    expect(reading).toHaveLength(9);
    expect(reading).toContain("https://youtu.be/dQw4w9WgXcQ?t=1");
    expect(await linkUris((await renderInterior(bundle, "print")).pdf)).toEqual([]);
  });

  it("книги без QR-кодов: содержимое и отпечаток кэша прежние", () => {
    const plain: BookBundle = { book, questions: questions.map((q) => ({ ...q, media: [] })), chapters: [], photos: [] };
    expect(JSON.stringify(contentFor(plain))).not.toContain("media");
  });
});
