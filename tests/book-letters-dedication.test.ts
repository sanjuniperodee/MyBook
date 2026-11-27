// Перенесено обратно из mybook-web (27.11): здесь — проверки общего кода и домена; экраны — в тестах веба.
import { describe, expect, it } from "vitest";
import { ruClient } from "@/i18n/messages/ru/client";
import { kkClient } from "@/i18n/messages/kk/client";
import { share as ruShare } from "@/i18n/messages/ru/letter-share";
import { share as kkShare } from "@/i18n/messages/kk/letter-share";
import { Book } from "@/modules/authoring/domain";
import { autobiographyTheme, now } from "./doubles/authoring";
// Письма близких по виду книги и посвящение из мастера (домен книги); сам мастер — в тестах mybook-web.

describe("письма близких по виду книги", () => {
  const book = { author: "Зауре", title: "Моя книга", recipient: "Алия" };
  it("автобиография и своя книга не склоняют имя автора, подарок называет получателя", () => {
    for (const share of [ruShare, kkShare]) {
      expect(share({ kind: "autobiography", ...book }, "https://x/l")).toContain("Зауре");
      expect(share({ kind: "blank", ...book }, "https://x/l")).toContain("«Моя книга»");
      expect(share({ kind: "blank", ...book }, "https://x/l")).not.toContain("Алия");
    }
    expect(ruShare({ kind: "gift", ...book }, "https://x/l")).toContain("её получит Алия");
    expect(ruShare({ kind: "autobiography", ...book }, "https://x/l")).toContain("автор: Зауре");
  });

  it("строка приватности зависит от наличия получателя", () => {
    expect(ruClient.books.letters.privacy(true)).toContain("получателя");
    expect(ruClient.books.letters.privacy(false)).not.toContain("получателя");
    expect(kkClient.books.letters.privacy(true)).not.toBe(kkClient.books.letters.privacy(false));
  });
});

describe("посвящение из мастера", () => {
  it("попадает в книгу и обрезается по лимиту настроек", () => {
    const input = { userId: "u1", language: "ru" as const, authorName: "Зауре", authorGender: "f" as const, recipientName: "", recipientGender: "m" as const };
    const { book } = Book.start("b1", { ...input, dedication: "  Детям и внукам  " }, autobiographyTheme("ru"), now);
    expect(book.snapshot().dedication).toBe("Детям и внукам");
    expect(Book.start("b1", { ...input, dedication: "я".repeat(700) }, autobiographyTheme("ru"), now).book.snapshot().dedication).toHaveLength(600);
    expect(Book.start("b1", input, autobiographyTheme("ru"), now).book.snapshot().dedication).toBe("");
  });
});
