import { describe, expect, it } from "vitest";
import { applyGender } from "@/lib/content/gender";
import { countQuestions, themes } from "@/lib/content/themes";

describe("applyGender", () => {
  it("подставляет род автора и адресата независимо", () => {
    const t = "Я {увидел|увидела} тебя, и ты [улыбнулся|улыбнулась]";
    expect(applyGender(t, "m", "f")).toBe("Я увидел тебя, и ты улыбнулась");
    expect(applyGender(t, "f", "m")).toBe("Я увидела тебя, и ты улыбнулся");
  });
  it("поддерживает пустую форму", () => {
    expect(applyGender("сказал[|а]", "m", "f")).toBe("сказала");
    expect(applyGender("сказал[|а]", "m", "m")).toBe("сказал");
  });
  it("не трогает текст без шаблонов", () => {
    expect(applyGender("Обычный [текст] без {вариантов}", "m", "m")).toBe("Обычный [текст] без {вариантов}");
  });
});

describe("банк вопросов", () => {
  it("во всех темах шаблоны корректно раскрываются для всех сочетаний рода", () => {
    for (const theme of themes)
      for (const ch of theme.chapters)
        for (const s of [ch.title, ...ch.questions.flat()].filter(Boolean) as string[])
          for (const a of ["m", "f"] as const)
            for (const r of ["m", "f"] as const) expect(applyGender(s, a, r), `${theme.id}: ${s}`).not.toMatch(/[[\]{}|]/);
  });
  it("в каждой теме достаточно вопросов и уникальные ключи глав", () => {
    for (const theme of themes) {
      expect(countQuestions(theme)).toBeGreaterThan(40);
      const keys = theme.chapters.map((c) => c.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});
