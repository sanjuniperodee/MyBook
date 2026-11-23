import { describe, expect, it } from "vitest";
import { normalizeStyle } from "@/lib/book/inline-photo";

// Обращение №14: «не уменьшать внизу страницы» — признак самого фото, а не настройка книги.
describe("фото «не уменьшать»", () => {
  it("true сохраняется, всё остальное убирается", () => {
    expect(normalizeStyle({ keepSize: true }).keepSize).toBe(true);
    expect("keepSize" in normalizeStyle({ keepSize: false })).toBe(false);
    expect("keepSize" in normalizeStyle({})).toBe(false);
  });
});
