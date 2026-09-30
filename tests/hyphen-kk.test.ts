import { describe, expect, it } from "vitest";
import { hyphenateKk, isKazakhWord } from "@/lib/book/hyphen-kk";

describe("казахские переносы", () => {
  it("распознаёт казахские слова по особым буквам", () => {
    expect(isKazakhWord("мерекеге")).toBe(false);
    expect(isKazakhWord("бәрімсің")).toBe(true);
  });
  it("делит по слогам: V-CV и VC-CV", () => {
    expect(hyphenateKk("балалығымның").join("-")).toBe("ба-ла-лы-ғым-ның");
    expect(hyphenateKk("естеліктер").join("-")).toBe("ес-те-лік-тер");
  });
  it("не отрывает по одной букве и не трогает короткие слова", () => {
    expect(hyphenateKk("ауыл")).toEqual(["ауыл"]);
    expect(hyphenateKk("ұлдары")).toEqual(["ұл", "да", "ры"]);
    for (const w of ["Көктөбеге", "мерейтойға", "әжесіңдер"]) for (const part of hyphenateKk(w)) expect(part.length).toBeGreaterThanOrEqual(2);
  });
  it("склеенные части дают исходное слово (с пунктуацией)", () => {
    for (const w of ["сүйіспеншілікпен,", "«Құпиялылық»", "тапсырысты."]) expect(hyphenateKk(w).join("")).toBe(w);
  });
});
