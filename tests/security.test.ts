import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/modules/identity/domain/redirects";
import { buildBookContent, LETTERS_CHAPTER } from "@/lib/book/layout";

describe("safeNextPath", () => {
  it("пропускает только внутренние пути", () => {
    expect(safeNextPath("/books/1")).toBe("/books/1");
    for (const bad of ["https://evil.com", "//evil.com", "/\\evil.com", "javascript:alert(1)", 42, undefined]) {
      expect(safeNextPath(bad)).toBe("/books");
    }
  });
});

describe("письма близких", () => {
  it("становятся последней главой книги, без пустых писем", () => {
    const book = {
      theme: "love",
    language: "ru" as const,
      title: "Т",
      subtitle: "",
      authorName: "А",
      authorGender: "f" as const,
      recipientName: "Б",
      recipientGender: "m" as const,
      dedication: "",
      interior: "classic",
      format: "a5",
      photoPlacement: "chapters" as const,
      showToc: true,
      coverPhotoId: null,
    };
    const q = { id: "1", chapter: "intro", position: 0, title: "Заголовок", displayText: null, hideHeading: false, answer: "Ответ" };
    const photo = { id: "p", caption: "", layout: "full" as const, width: 1, height: 1, storageKey: "", thumbKey: "" };
    const c = buildBookContent(book, [q], [photo], 2026, [
      { id: "l1", authorName: "Дана", relation: "подруга", text: "Тёплые слова" },
      { id: "l2", authorName: "Пусто", relation: "", text: "   " },
    ]);
    const last = c.chapters[c.chapters.length - 1];
    expect(last.key).toBe(LETTERS_CHAPTER);
    expect(last.items.map((i) => i.heading)).toEqual(["Дана, подруга"]);
    expect(last.photos).toHaveLength(0);
    expect(c.chapters[0].photos).toHaveLength(1);
  });
});

describe("фото внутри ответа", () => {
  it("печатается после ответа и не дублируется между главами", () => {
    const book = {
      theme: "love",
    language: "ru" as const,
      title: "Т",
      subtitle: "",
      authorName: "А",
      authorGender: "f" as const,
      recipientName: "Б",
      recipientGender: "m" as const,
      dedication: "",
      interior: "classic",
      format: "a5",
      photoPlacement: "chapters" as const,
      showToc: true,
      coverPhotoId: null,
    };
    const q = { id: "q1", chapter: "intro", position: 0, title: "Заголовок", displayText: null, hideHeading: false, answer: "" };
    const inline = { id: "p1", caption: "Снег", layout: "full" as const, width: 3, height: 2, storageKey: "", thumbKey: "", questionId: "q1" };
    const loose = { id: "p2", caption: "", layout: "full" as const, width: 1, height: 1, storageKey: "", thumbKey: "", questionId: null };
    const c = buildBookContent(book, [q], [inline, loose], 2026);
    // Вопрос без текста, но с фото — всё равно попадает в книгу
    expect(c.chapters[0].items[0].photos?.map((p) => p.id)).toEqual(["p1"]);
    expect(c.chapters[0].photos.map((p) => p.id)).toEqual(["p2"]);
  });
});
