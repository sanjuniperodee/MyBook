import { describe, expect, it } from "vitest";
import { zoneHref } from "@/lib/book/book-build";
import { paragraphOffset, splitParagraphs } from "@/lib/book/inline-photo";

describe("куда ведёт нажатие на полосу", () => {
  it("текст — ответ (и абзац, кроме первого), фото — ответ и фото, глава — лист главы, альбом — его лист", () => {
    expect(zoneHref("b1", { t: "text", q: "q1" })).toBe("/books/b1/questions?s=q1");
    expect(zoneHref("b1", { t: "text", q: "q1", p: 0 })).toBe("/books/b1/questions?s=q1");
    expect(zoneHref("b1", { t: "text", q: "q1", p: 3 })).toBe("/books/b1/questions?s=q1&p=3");
    expect(zoneHref("b1", { t: "photo", q: "q1", id: "ph" })).toBe("/books/b1/questions?s=q1&photo=ph");
    expect(zoneHref("b1", { t: "photo", id: "ph" })).toBe("/books/b1/questions?photo=ph");
    expect(zoneHref("b1", { t: "chapter", key: "meet", q: "q5" })).toBe("/books/b1/questions?s=q5&chapter=meet");
    expect(zoneHref("b1", { t: "chapter", key: "__gallery" })).toBe("/books/b1/questions?album=1");
  });
});

describe("курсор в начало абзаца", () => {
  it("номер абзаца — как у splitParagraphs: пустые строки и отступы пропускаются", () => {
    const answer = "Первый абзац\n\n  Второй абзац\nТретий";
    expect(splitParagraphs(answer)).toEqual(["Первый абзац", "Второй абзац", "Третий"]);
    expect(answer.slice(paragraphOffset(answer, 0))).toMatch(/^Первый/);
    expect(answer.slice(paragraphOffset(answer, 1))).toMatch(/^Второй/);
    expect(answer.slice(paragraphOffset(answer, 2))).toBe("Третий");
    expect(paragraphOffset(answer, 9)).toBe(answer.length);
  });
});
