// Перенесено обратно из mybook-web (27.11): здесь — проверки общего кода и домена; экраны — в тестах веба.
import { describe, expect, it } from "vitest";
import { computeStats } from "@/modules/authoring/domain/stats";
import { fixtureBook, fixtureVariants } from "./fixtures/books";

describe("статистика книги: пустые главы", () => {
  it("своя книга: главы без текста и фото считаются — о них предупредит проверка перед заказом", () => {
    const b = fixtureVariants().find((v) => v.key === "blank")!.bundle;
    const stats = computeStats(b.book, b.questions, b.chapters, b.photos, b.letters ?? []);
    const empty = b.chapters.filter((c) => !b.questions.some((q) => q.chapter === c.key && q.answer.trim()) && !b.photos.some((p) => b.questions.some((q) => q.chapter === c.key && q.id === p.questionId)));
    expect(empty.length).toBeGreaterThan(0);
    expect(stats.emptyChapters).toBe(empty.length);
  });

  it("книга с банком: пустых глав нет по определению", () => {
    const b = fixtureBook("classic", "a5", "ru").bundle;
    expect(computeStats(b.book, b.questions, b.chapters, b.photos, b.letters ?? []).emptyChapters).toBe(0);
  });
});
