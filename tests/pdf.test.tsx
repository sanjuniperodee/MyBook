import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { renderCover, renderInterior, type BookBundle } from "@/lib/pdf/render";
import { print } from "@/lib/book/formats";
import type { Book, BookQuestion } from "@/lib/db/schema";

const now = new Date();
const book: Book = {
  id: "00000000-0000-0000-0000-000000000001",
  userId: "00000000-0000-0000-0000-000000000002",
  theme: "love",
  status: "draft",
  title: "Ты — моё всё",
  subtitle: "Четыре года вместе",
  authorName: "Алия",
  authorGender: "f",
  recipientName: "Марғұлан",
  recipientGender: "m",
  hideRecipientOnCover: false,
  coverTemplate: "midnight",
  coverPhotoId: null,
  backText: "Каждая страница — о тебе.",
  dedication: "Моему самому близкому человеку",
  typography: "classic",
  format: "a5",
  photoPlacement: "chapters",
  showToc: true,
  createdAt: now,
  updatedAt: now,
};

const questions: BookQuestion[] = Array.from({ length: 30 }, (_, i) => ({
  id: `q${i}`,
  bookId: book.id,
  position: i,
  chapter: ["intro", "meet", "date"][i % 3],
  questionKey: null,
  prompt: "Вопрос",
  title: `Заголовок ${i + 1}: когда я {понял|поняла}`,
  hint: null,
  displayText: null,
  hideHeading: false,
  answer: "Мы встретились в самый обычный вторник, когда в Алматы шёл первый снег. ".repeat(6 + (i % 5)),
  createdAt: now,
  updatedAt: now,
}));

describe("генерация PDF", () => {
  const bundle: BookBundle = { book, questions, photos: [] };

  it("блок: вылеты, TrimBox и кратность страниц", async () => {
    const res = await renderInterior(bundle, "print");
    expect(res.pageCount % print.pageMultiple).toBe(0);
    const doc = await PDFDocument.load(res.pdf);
    expect(doc.getPageCount()).toBe(res.pageCount);
    const page = doc.getPage(0);
    const mm = (v: number) => (v * 72) / 25.4;
    expect(page.getWidth()).toBeCloseTo(mm(148 + 2 * print.bleedMm), 0);
    expect(page.getTrimBox().width).toBeCloseTo(mm(148), 0);
  });

  it("обложка: развёртка с корешком", async () => {
    const res = await renderCover(bundle, 64, "preview");
    const doc = await PDFDocument.load(res.pdf);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getPage(0).getWidth()).toBeCloseTo((res.geometry.width * 72) / 25.4, 0);
  });
});
