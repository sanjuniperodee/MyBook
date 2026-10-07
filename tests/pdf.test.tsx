import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { renderCover, renderInterior, type BookBundle } from "@/modules/production/infrastructure/pdf/render";
import { formats, print } from "@/lib/book/formats";
import { interiorDesigns } from "@/lib/book/interiors";
import type { Book, BookQuestion } from "@/shared/infrastructure/db/schema";

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
  backLayout: "quote",
  backPhotoId: null,
  dedication: "Моему самому близкому человеку",
  interior: "classic",
  format: "a5",
  photoPlacement: "chapters",
  showToc: true,
  inviteToken: null,
  occasion: null,
  occasionDate: null,
  language: "ru",
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

  it("казахская книга: блок и обложка собираются, текст с казахскими буквами переносится", async () => {
    const kkBook: Book = { ...book, language: "kk", title: "Сен — менің бәрімсің", subtitle: "Бірге төрт жыл" };
    const kkQuestions = questions.map((q) => ({ ...q, title: `Біз қалай таныстық ${q.position + 1}`, answer: "Біз Алматыға алғашқы қар жауған қарапайым сейсенбіде кездестік. Көктөбеге шығып, қаланың шамдарына ұзақ қарадық. ".repeat(6) }));
    const res = await renderInterior({ book: kkBook, questions: kkQuestions, photos: [] }, "preview");
    expect(res.pageCount % print.pageMultiple).toBe(0);
    const cover = await renderCover({ book: kkBook, questions: kkQuestions, photos: [] }, res.pageCount, "preview");
    expect((await PDFDocument.load(cover.pdf)).getPageCount()).toBe(1);
  });

  // Короткая книга: в каждой главе один ответ на полстраницы. Объём не зависит от оформления:
  // титул, оборот, посвящение, оглавление, по две полосы на главу и финал. Если графика оформления
  // попадёт в поток текста, react-pdf вынесет её на отдельную полосу — и счёт разойдётся.
  it.each(interiorDesigns.flatMap((d) => Object.keys(formats).map((f) => [d.id, f] as const)))("оформление %s, %s: ровно расчётное число полос", async (interior, format) => {
    const short = questions.filter((q) => q.position < 3).map((q) => ({ ...q, answer: "Мы встретились в самый обычный вторник, когда в Алматы шёл первый снег." }));
    const res = await renderInterior({ book: { ...book, interior, format }, questions: short, photos: [] }, "reading");
    expect(res.contentPages).toBe(4 + short.length * 2 + 1);
  });

  it("обложка: развёртка с корешком", async () => {
    const res = await renderCover(bundle, 64, "preview");
    const doc = await PDFDocument.load(res.pdf);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getPage(0).getWidth()).toBeCloseTo((res.geometry.width * 72) / 25.4, 0);
  });
});

describe("подарочный сертификат", () => {
  it("рендерится в одну страницу A5 альбомной ориентации", async () => {
    const { renderGiftPdf } = await import("@/modules/production/infrastructure/pdf/gift");
    const pdf = await renderGiftPdf({
      locale: "ru",
      number: 12,
      code: "GIFT-ABCD-EFGH",
      plan: "hardcover",
      amount: 24900,
      buyerName: "Айгерим",
      recipientName: "мамы",
      message: "Мама, напиши историю нашей семьи — я хочу, чтобы она осталась у внуков",
      validUntil: new Date(2027, 8, 30),
    });
    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBe(1);
    const { width, height } = doc.getPage(0).getSize();
    expect(Math.round(width)).toBe(595);
    expect(Math.round(height)).toBe(420);
  });

  it("казахский сертификат собирается тем же макетом", async () => {
    const { renderGiftPdf } = await import("@/modules/production/infrastructure/pdf/gift");
    const pdf = await renderGiftPdf({
      locale: "kk",
      number: 13,
      code: "GIFT-ABCD-EFGH",
      plan: "premium",
      amount: 34900,
      buyerName: "Айгерім",
      recipientName: "Гүлнар Серікқызы",
      message: "Анашым, отбасымыздың тарихын жазшы — ол немерелеріңе қалсын деймін",
      validUntil: new Date(2027, 8, 30),
    });
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(1);
  });
});
