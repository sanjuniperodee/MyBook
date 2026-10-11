import { describe, expect, it } from "vitest";
import { locateEdits, parseProofread, proofreadChunks, proofreadSystemPrompt } from "@/modules/assistant/domain/proofread";
import { spellCandidates, spellIssues, wordsToCheck } from "@/lib/proofread/spelling";
import { misspelled } from "@/server/spell";

const edit = (fragment: string, replacement: string, kind = "punctuation") => ({ fragment, replacement, kind: kind as "punctuation", note: "правило" });

describe("AI-корректор: привязка правок к тексту", () => {
  const text = "Я думаю что ты прав. Я думаю что мы успеем придти во время.";

  it("сужает правку до изменившегося слова и ставит её на своё место", () => {
    const [i] = locateEdits(text, [edit("думаю что ты", "думаю, что ты")]);
    expect([text.slice(i.start, i.end), i.replacements[0], i.kind, i.source]).toEqual(["думаю", "думаю,", "punctuation", "ai"]);
    expect(i.start).toBe(2);
  });

  it("одинаковые фрагменты занимают разные вхождения, ненайденные отбрасываются", () => {
    const found = locateEdits(text, [edit("думаю что", "думаю, что"), edit("думаю что", "думаю, что"), edit("придти", "прийти", "spelling"), edit("выдумка", "правда"), edit("ты", "ты")]);
    expect(found.map((i) => [i.start, text.slice(i.start, i.end), i.replacements[0]])).toEqual([
      [2, "думаю", "думаю,"],
      [23, "думаю", "думаю,"],
      [43, "придти", "прийти"],
    ]);
  });

  it("смещение куска и правка из нескольких слов", () => {
    const [i] = locateEdits("мы пришли во время", [edit("во время", "вовремя", "spelling")], 100);
    expect([i.start, i.end, i.replacements[0]]).toEqual([110, 118, "вовремя"]);
  });

  it("разбор ответа модели: мусор отбрасывается, неизвестный вид — грамматика", () => {
    expect(parseProofread({ issues: [{ fragment: "а", replacement: "б", kind: "magic", note: "x" }, { fragment: "", replacement: "в" }, "строка"] })).toEqual([{ fragment: "а", replacement: "б", kind: "grammar", note: "x" }]);
    expect(parseProofread(null)).toEqual([]);
  });

  it("длинный ответ режется по абзацам, смещения сходятся", () => {
    const para = "Предложение номер один. ".repeat(40).trim();
    const long = [para, para, para].join("\n");
    const chunks = proofreadChunks(long, 1500);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(long.slice(c.offset, c.offset + c.text.length)).toBe(c.text);
  });

  it("промпт на языке книги, пояснения — на языке интерфейса", () => {
    expect(proofreadSystemPrompt("kk", "ru")).toContain("казахском");
    expect(proofreadSystemPrompt("kk", "ru")).toContain("по-русски");
  });
});

describe("орфография по словарю", () => {
  it("проверяем только русские слова строчными: не имена, не казахские, не латиницу", () => {
    const words = spellCandidates("Алмат сказал вокрук Марғұлан hello дом-музей ёлка я", (w) => w === "ёлка").map((c) => c.word);
    expect(words).toEqual(["сказал", "вокрук", "дом-музей"]);
  });

  it("запрашиваем только незнакомые слова, замечания — по ответу словаря", () => {
    const cands = spellCandidates("вокрук дома вокрук");
    const known = new Map<string, string[] | null>([["дома", null]]);
    expect(wordsToCheck(cands, known)).toEqual(["вокрук"]);
    known.set("вокрук", ["вокруг"]);
    expect(spellIssues(cands, known).map((i) => [i.start, i.replacements])).toEqual([
      [0, ["вокруг"]],
      [12, ["вокруг"]],
    ]);
  });

  it("словарь Hunspell находит опечатки и предлагает исправление", async () => {
    const wrong = await misspelled(["вокрук", "встретились", "по-моему", "красно-синий", "придти", "ёлка", "елка"]);
    expect(Object.keys(wrong)).toEqual(["вокрук"]);
    expect(wrong.вокрук[0]).toBe("вокруг");
  });
});
