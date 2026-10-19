import { describe, expect, it } from "vitest";
import { columnPages } from "@/lib/book/page-geometry";

describe("columnPages: полосы текста, разложенного CSS-колонками", () => {
  it("одна колонка — одна полоса; n колонок с промежутками — n полос", () => {
    expect(columnPages(300, 300, 40)).toBe(1);
    expect(columnPages(300 * 3 + 40 * 2, 300, 40)).toBe(3);
  });

  it("доли пикселя от масштаба не добавляют и не теряют полосу", () => {
    expect(columnPages(300 * 2 + 40 + 0.4, 300, 40)).toBe(2);
    expect(columnPages(300 * 2 + 40 - 0.4, 300, 40)).toBe(2);
  });

  it("пустой текст — всё равно одна полоса", () => {
    expect(columnPages(0, 300, 40)).toBe(1);
  });
});
