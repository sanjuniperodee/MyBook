import { describe, expect, it } from "vitest";
import { DEAL_NOTE_MAX, mergeDealNotes, normalizeDealNote } from "@/modules/sales/domain";

describe("примечание к сделке", () => {
  it("сохраняется без пустых строк по краям, с переводами строк одного вида, не длиннее лимита", () => {
    expect(normalizeDealNote("\n\n  первая\r\nвторая  \n\n")).toBe("  первая\nвторая");
    expect(normalizeDealNote("   ")).toBe("");
    expect(normalizeDealNote("я".repeat(DEAL_NOTE_MAX + 10))).toHaveLength(DEAL_NOTE_MAX);
  });

  it("при слиянии сделок примечание слитой дописывается через пустую строку", () => {
    expect(mergeDealNotes("звонить вечером", "юбилей 12 марта")).toBe("звонить вечером\n\nюбилей 12 марта");
    expect(mergeDealNotes("", "юбилей")).toBe("юбилей");
    expect(mergeDealNotes("звонить", "  ")).toBe("звонить");
  });
});
