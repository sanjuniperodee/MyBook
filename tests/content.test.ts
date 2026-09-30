import { describe, expect, it } from "vitest";
import { applyGender } from "@/lib/content/gender";
import { countQuestions, getThemes, themeChaptersByLocale, themeIds } from "@/lib/content/themes";

const allThemes = [...getThemes("ru"), ...getThemes("kk")];

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
    for (const theme of allThemes)
      for (const ch of theme.chapters)
        for (const s of [ch.title, ...ch.questions.flat()].filter(Boolean) as string[])
          for (const a of ["m", "f"] as const)
            for (const r of ["m", "f"] as const) expect(applyGender(s, a, r), `${theme.id}: ${s}`).not.toMatch(/[[\]{}|]/);
  });
  it("в каждой теме достаточно вопросов и уникальные ключи глав", () => {
    for (const theme of allThemes) {
      expect(countQuestions(theme)).toBeGreaterThan(40);
      const keys = theme.chapters.map((c) => c.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
  it("казахский банк повторяет русский: те же главы и столько же вопросов в каждой", () => {
    // Ключ вопроса (theme.chapter.N) одинаков на обоих языках — на нём держатся аналитика и CRM.
    for (const id of themeIds) {
      const { ru, kk } = themeChaptersByLocale(id);
      expect(kk.map((c) => c.key), id).toEqual(ru.map((c) => c.key));
      ru.forEach((ch, i) => {
        expect(kk[i].questions.length, `${id}.${ch.key}`).toBe(ch.questions.length);
        expect(Boolean(kk[i].epigraph), `${id}.${ch.key} эпиграф`).toBe(Boolean(ch.epigraph));
        ch.questions.forEach((q, j) => expect(Boolean(kk[i].questions[j][2]), `${id}.${ch.key}.${j + 1} подсказка`).toBe(Boolean(q[2])));
      });
    }
  });
  it("в казахских текстах нет русских слов-двойников", () => {
    // Грубая проверка на недопереведённые строки: русские буквы ё/щ/ъ/э в казахском почти не встречаются.
    for (const id of themeIds)
      for (const ch of themeChaptersByLocale(id).kk)
        for (const s of [ch.title, ch.epigraph ?? "", ...ch.questions.flat()] as string[]) expect(s, `${id}.${ch.key}`).not.toMatch(/[ёщъэ]/i);
  });
});
