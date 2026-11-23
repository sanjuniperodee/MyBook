import { describe, expect, it } from "vitest";
import { applyInteriorStyle, getInteriorDesign, parseInteriorStyle } from "@/lib/book/interiors";
import { paraIndent, tocNumbered } from "@/lib/book/typesetting";

// Обращения №5 и №6: красная строка у первого абзаца по желанию автора; без номера главы — без номеров в оглавлении.
describe("красная строка у первого абзаца", () => {
  const base = getInteriorDesign("classic");

  it("по умолчанию первый абзац без отступа, остальные — с отступом", () => {
    const d = applyInteriorStyle(base, { body: { indent: 1.25 } });
    expect(paraIndent(d, true)).toBe(false);
    expect(paraIndent(d, false)).toBe(true);
  });

  it("indentFirst — отступ и у первого абзаца", () => {
    const style = parseInteriorStyle({ body: { indent: 1.25, indentFirst: true } });
    expect(style.body?.indentFirst).toBe(true);
    const d = applyInteriorStyle(base, style);
    expect(paraIndent(d, true)).toBe(true);
  });

  it("мусор вместо boolean отбрасывается", () => {
    expect(parseInteriorStyle({ body: { indentFirst: "yes" } }).body?.indentFirst).toBeUndefined();
  });
});

describe("номера глав в оглавлении", () => {
  it("есть, пока у главы есть номер", () => {
    expect(tocNumbered(getInteriorDesign("classic"))).toBe(true);
  });

  it("нет, когда автор убрал номер главы", () => {
    expect(tocNumbered(applyInteriorStyle(getInteriorDesign("classic"), { elements: { number: "none" } }))).toBe(false);
  });
});
