import { describe, expect, it } from "vitest";
import { bookLine, kindName, progressRatio, progressShort, progressText } from "@/lib/content/crm-labels";

describe("подписи книг в CRM по виду", () => {
  it("строка о книге: «→ получатель» только если он есть", () => {
    expect(bookLine({ theme: "mom", themeShort: "Маме", authorName: "Аня", recipientName: "Мария" })).toBe("Маме · Аня → Мария");
    expect(bookLine({ theme: "mom", themeShort: "Маме", authorName: "Аня", recipientName: "  " })).toBe("Маме · Аня");
    expect(bookLine({ theme: "blank", themeShort: "Своя книга", authorName: "Аня", recipientName: "" })).toBe("Своя книга · Аня");
    expect(bookLine({ theme: "blank", themeShort: "Своя книга", authorName: "Аня", recipientName: "Дочери" })).toBe("Своя книга · Аня → Дочери");
  });

  it("автобиография — рассказчик, получателя в строке нет даже в старых данных", () => {
    expect(bookLine({ theme: "autobiography", themeShort: "Автобиография", authorName: "Бакыт", recipientName: "Внуки" })).toBe("Автобиография · рассказчик Бакыт");
    expect(bookLine({ theme: "autobiography", themeShort: "", authorName: "", recipientName: "" })).toBe("Автобиография");
  });

  it("название вида книги", () => {
    expect(kindName("gift", "Папе")).toBe("Папе");
    expect(kindName("autobiography", "x")).toBe("Автобиография");
    expect(kindName("blank", "x")).toBe("Своя книга");
  });

  it("прогресс: ответы у книг с вопросами, слова у своей книги", () => {
    expect(progressText({ theme: "love", answered: 12, total: 90, words: 800 })).toBe("12 из 90 ответов");
    expect(progressText({ theme: "blank", answered: 4, total: 5, words: 1250 })).toBe("4 из 5 разделов с текстом · 1250 слов");
    expect(progressShort({ theme: "dad", answered: 12, total: 90, words: 0 })).toBe("12/90");
    expect(progressShort({ theme: "blank", answered: 4, total: 5, words: 1250 })).toBe("1250 сл.");
  });

  it("полоска: доля ответов; у своей книги — слова до порога «почти готова» (3000)", () => {
    expect(progressRatio({ theme: "mom", answered: 20, total: 40, words: 0 })).toBe(0.5);
    expect(progressRatio({ theme: "mom", answered: 0, total: 0, words: 0 })).toBe(0);
    expect(progressRatio({ theme: "blank", answered: 1, total: 1, words: 1500 })).toBe(0.5);
    expect(progressRatio({ theme: "blank", answered: 1, total: 1, words: 9000 })).toBe(1);
  });
});
