import { describe, expect, it } from "vitest";
import { splitParagraphsDetailed, stripLineIndents } from "@/lib/book/inline-photo";

// Заказ №93: автор ставил пять пробелов перед каждым абзацем, редактор их показывал, книга — нет.
const indented = "     Біздің таныстығымыз басталды.\n     Екінші абзац.\n\n   \n\t Стих строка\n  вторая  ";

describe("пробелы в начале строк ответа", () => {
  it("убираются только в начале строк, переносы и пробелы внутри и в конце остаются", () => {
    expect(stripLineIndents(indented)).toBe("Біздің таныстығымыз басталды.\nЕкінші абзац.\n\n\nСтих строка\nвторая  ");
    expect(stripLineIndents("слово  слово\n")).toBe("слово  слово\n");
    expect(stripLineIndents("  неразрывные")).toBe("неразрывные");
  });

  it("книга видит тот же текст: абзацы, пустые строки и номера абзацев не меняются", () => {
    expect(splitParagraphsDetailed(stripLineIndents(indented))).toEqual(splitParagraphsDetailed(indented));
  });

  it("повторная чистка ничего не меняет", () => {
    const once = stripLineIndents(indented);
    expect(stripLineIndents(once)).toBe(once);
  });
});
