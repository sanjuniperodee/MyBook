import { describe, expect, it } from "vitest";
import { share as shareRu } from "@/i18n/messages/ru/letter-share";
import { share as shareKk } from "@/i18n/messages/kk/letter-share";
import { INVITE_TEXT_MAX, inviteRecipient } from "@/lib/content/letter-invite";
import { startBook } from "./doubles/authoring";

// 02.11.2026: клиент пишет книгу про бабушку, которой давно нет, а приглашение близких говорило «Её получит бабушка».
// Владелец: этот текст нужно разрешить менять — автор пишет своё приглашение на вкладке «Письма близких».

const book = { kind: "gift" as const, author: "Алия", title: "Бабушкины истории", recipient: "бабушка Роза" };
const link = "https://mybooks.kz/letters/abc";

describe("свой текст приглашения близких", () => {
  it("сообщение со ссылкой: свой текст как есть, на обоих языках; без него — по умолчанию с получателем", () => {
    const own = "Собираем воспоминания о бабушке Розе. Напишите, какой вы её помните.";
    expect(shareRu({ ...book, inviteText: `  ${own} ` }, link)).toBe(`${own}\n${link}`);
    expect(shareKk({ ...book, inviteText: own }, link)).toBe(`${own}\n${link}`);
    expect(shareRu({ ...book, inviteText: "  " }, link)).toContain("её получит бабушка Роза");
    expect(shareRu(book, link)).toContain("её получит бабушка Роза");
  });

  it("со своим текстом имя получателя близким не показываем (и в «прочитает его на страницах книги»)", () => {
    expect(inviteRecipient("gift", " бабушка Роза ", "")).toBe("бабушка Роза");
    expect(inviteRecipient("gift", "бабушка Роза", "Помним бабушку")).toBe("");
    expect(inviteRecipient("autobiography", "кто-то", "")).toBe("");
  });

  it("текст сохраняется в настройках книги, обрезается по краям и по длине", () => {
    const b = startBook();
    expect(b.snapshot().inviteText).toBe("");
    b.applySettings({ inviteText: `  ${"а".repeat(INVITE_TEXT_MAX + 50)}  ` });
    expect(b.snapshot().inviteText).toBe("а".repeat(INVITE_TEXT_MAX));
    b.applySettings({ inviteText: "" });
    expect(b.snapshot().inviteText).toBe("");
  });
});
