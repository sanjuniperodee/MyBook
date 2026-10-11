import { describe, expect, it } from "vitest";
import { checkRules, fixSafe } from "@/lib/proofread/rules";
import { applyIssue, shiftIssues, withoutOverlaps } from "@/lib/proofread/types";

const rules = (text: string, lang: "ru" | "kk" = "ru") => checkRules(text, lang).map((i) => [i.rule, text.slice(i.start, i.end), i.replacements[0]]);

describe("правила проверки текста", () => {
  it("пробелы у знаков препинания", () => {
    expect(rules("Мы шли , говорили .Тут ( тихо ) пришёл")).toEqual([
      ["spaceBefore", " ", ""],
      ["spaceBefore", " ", ""],
      ["spaceAfterOpen", " ", ""],
      ["spaceBefore", " ", ""],
    ]);
    expect(rules("Привет,мир! Конец.Начало")).toEqual([
      ["spaceAfter", ",", ", "],
      ["spaceAfter", ".", ". "],
    ]);
    // Сокращения, числа и адреса — не ошибки.
    expect(rules("В 10.30 мы, т.е. я и он, зашли на site.kz.")).toEqual([]);
  });

  it("тире, многоточие, кавычки, двойные пробелы", () => {
    expect(rules("- Привет! Это  моя книга - наша история...")).toEqual([
      ["dash", "- ", "— "],
      ["doubleSpace", "  ", " "],
      ["dash", " - ", " — "],
      ["ellipsis", "...", "…"],
    ]);
    expect(rules('Она сказала "да" и “нет”.')).toEqual([
      ["quotes", '"да"', "«да»"],
      ["quotes", "“нет”", "«нет»"],
    ]);
    expect(rules("Уже «правильно» — и… так")).toEqual([]);
    // Удвоенные и непарные кавычки не захватывают полабзаца.
    expect(rules('Фразу ""бүл не"" и "Үят болады" и "Төрге " перед')).toEqual([
      ["quotes", '""бүл не""', "«бүл не»"],
      ["quotes", '"Үят болады"', "«Үят болады»"],
      ["quotes", '"Төрге "', "«Төрге»"],
    ]);
    expect(rules('Рост 2" и всё, а потом "Рамэо" .')).toEqual([
      ["quotes", '"Рамэо"', "«Рамэо»"],
      ["spaceBefore", " ", ""],
    ]);
  });

  it("заглавная в начале предложения, но не после сокращений и многоточия", () => {
    expect(rules("мы встретились. он улыбнулся")).toEqual([
      ["capital", "мы", "Мы"],
      ["capital", "он", "Он"],
    ]);
    expect(rules("Было много дел, работы и т. д. и всё же. И т. п. Мы ждали… и дождались.")).toEqual([]);
    expect(rules("Первая строка,\nпродолжение мысли.")).toEqual([]);
  });

  it("повтор слова и слова-сокращения", () => {
    expect(rules("Я думал что что-то и и случится")).toEqual([["repeatWord", " и", ""]]);
    expect(rules("Да да, тук тук")).toEqual([]);
    expect(rules("Вообщем всё было итд, тк из за дождя кто то ушёл")).toEqual([
      ["word", "Вообщем", "В общем"],
      ["word", "итд", "и т. д."],
      ["word", "тк", "т. к."],
      ["word", "из за", "из-за"],
      ["word", "кто то", "кто-то"],
    ]);
    // Русские слова-правила не трогают казахский текст.
    expect(rules("Біз тк кездестік", "kk")).toEqual([]);
  });

  it("эмодзи не печатаются — удаляются вместе с лишним пробелом", () => {
    expect(rules("Люблю тебя ❤️ очень😊")).toEqual([
      ["emoji", " ❤️", ""],
      ["emoji", "😊", ""],
    ]);
  });

  it("«Исправить оформление» применяет только безопасные правки", () => {
    expect(fixSafe('мы шли , "домой" - и пришли...😊 итд', "ru")).toBe("Мы шли, «домой» — и пришли… и т. д.");
    // Повтор слова и «!!!» не безопасны — их решает автор.
    expect(fixSafe("Я я рад!!!", "ru")).toBe("Я я рад!!!");
  });
});

describe("замечания при правке текста", () => {
  it("сдвигаются после правки и пропадают, если правка их задела", () => {
    const before = "один два три четыре";
    const issues = [
      { start: 0, end: 4 },
      { start: 5, end: 8 },
      { start: 14, end: 20 },
    ];
    const after = "один ДВАА три четыре";
    expect(shiftIssues(issues, before, after)).toEqual([
      { start: 0, end: 4 },
      { start: 15, end: 21 },
    ]);
  });

  it("применение замены и снятие наложений", () => {
    expect(applyIssue("abc def", { start: 4, end: 7 }, "XYZ")).toBe("abc XYZ");
    expect(withoutOverlaps([{ start: 0, end: 5 }, { start: 3, end: 8 }, { start: 8, end: 9 }])).toEqual([
      { start: 0, end: 5 },
      { start: 8, end: 9 },
    ]);
  });
});
