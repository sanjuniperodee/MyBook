import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MessagesContext } from "@/i18n/context";
import { ruClient } from "@/i18n/messages/ru/client";
import { kkClient } from "@/i18n/messages/kk/client";
import { getCoverTemplate } from "@/lib/book/covers";
import { coverMeta } from "@/lib/book/covers/meta";
import { getTheme, getThemes } from "@/lib/content/themes";
import { createBookSchema } from "@/app/(app)/books/create-book-schema";
import { NewBookWizard, type WizardTheme } from "@/app/(app)/books/new/NewBookWizard";
import { hubChapters, sectionHref } from "@/lib/book/hub-model";
import { share as ruShare } from "@/i18n/messages/ru/letter-share";
import { share as kkShare } from "@/i18n/messages/kk/letter-share";
import { locales } from "@/i18n/config";
import { Book } from "@/modules/authoring/domain";
import { autobiographyTheme, now } from "./doubles/authoring";
import { messagesFor } from "@/i18n/messages";

// Мастер новой книги по видам: правила действия (zod), разметка шагов и модель хаба. Серверное действие подменено.
vi.mock("@/app/(app)/books/actions", () => ({ createBookAction: vi.fn() }));

const errors = messagesFor("ru").books.wizard.errors;
const parse = (over: Record<string, string>) => createBookSchema(errors).safeParse({ language: "ru", authorName: "Аружан", authorGender: "f", ...over });

describe("мастер: правила действия по видам книги", () => {
  it("подарок: получатель обязателен, его род принимается", () => {
    const empty = parse({ theme: "mom", recipientName: "" });
    expect(empty.success).toBe(false);
    if (!empty.success) expect(empty.error.issues[0].message).toBe(errors.recipientName);
    const ok = parse({ theme: "love", recipientName: " Алия ", recipientGender: "f", recordedBy: "внучка", dedication: "мне", firstChapterTitle: "Глава" });
    expect(ok.success && ok.data).toMatchObject({ recipientName: "Алия", recipientGender: "f", recordedBy: "", dedication: "", firstChapterTitle: "" });
  });

  it("автобиография: получателя нет, род получателя не принимается, есть recordedBy и посвящение", () => {
    const r = parse({ theme: "autobiography", recipientName: "Кто-то", recipientGender: "f", recordedBy: " внучка Аружан ", dedication: " Детям и внукам ", firstChapterTitle: "Начало" });
    expect(r.success && r.data).toMatchObject({ recipientName: "", recipientGender: "m", recordedBy: "внучка Аружан", dedication: "Детям и внукам", firstChapterTitle: "" });
    // Название необязательно: без него книга получит первый вариант темы.
    expect(parse({ theme: "autobiography", title: "" }).success).toBe(true);
  });

  it("своя книга: получатель необязателен, название обязательно, первая глава — только у неё", () => {
    const noTitle = parse({ theme: "blank", title: "   " });
    expect(noTitle.success).toBe(false);
    if (!noTitle.success) expect(noTitle.error.issues[0].message).toBe(errors.title);
    const ok = parse({ theme: "blank", title: "Записки", recipientName: "", recipientGender: "f", recordedBy: "x", dedication: "y", firstChapterTitle: " Детство " });
    expect(ok.success && ok.data).toMatchObject({ title: "Записки", recipientName: "", recipientGender: "m", recordedBy: "", dedication: "", firstChapterTitle: "Детство" });
    expect(parse({ theme: "blank", title: "Записки", recipientName: "детям" }).success).toBe(true);
  });

  it("пределы длины и неизвестная тема", () => {
    expect(parse({ theme: "blank", title: "x".repeat(81) }).success).toBe(false);
    expect(parse({ theme: "blank", title: "ok", firstChapterTitle: "x".repeat(121) }).success).toBe(false);
    expect(parse({ theme: "autobiography", recordedBy: "x".repeat(81) }).success).toBe(false);
    expect(parse({ theme: "autobiography", dedication: "x".repeat(601) }).success).toBe(false);
    expect(parse({ theme: "poetry" }).success).toBe(false);
  });
});

const wizardThemes = (locale: "ru" | "kk"): WizardTheme[] =>
  getThemes(locale).map((t) => ({
    id: t.id,
    kind: t.kind,
    recipient: t.recipient,
    name: t.name,
    description: t.description,
    questions: t.chapters.reduce((s, c) => s + c.questions.length, 0),
    recipientLabel: t.recipientLabel,
    recipientPlaceholder: t.recipientPlaceholder,
    recipientGender: t.recipientGender,
    defaultRecipientGender: t.defaultRecipientGender,
    titleSuggestions: Object.fromEntries(locales.map((l) => [l, getTheme(t.id, l).titleSuggestions])) as WizardTheme["titleSuggestions"],
    firstChapterTitle: Object.fromEntries(locales.map((l) => [l, getTheme(t.id, l).firstChapterTitle ?? ""])) as WizardTheme["firstChapterTitle"],
    defaultCover: coverMeta(getCoverTemplate(t.defaultCover)),
  }));

const render = (locale: "ru" | "kk", defaultTheme?: WizardTheme["id"]) =>
  renderToStaticMarkup(
    <MessagesContext.Provider value={locale === "ru" ? ruClient : kkClient}>
      <NewBookWizard themes={wizardThemes(locale)} defaultTheme={defaultTheme} defaultAuthor="Аружан" defaultLanguage={locale} />
    </MessagesContext.Provider>,
  );

describe("мастер: разметка", () => {
  it("первый шаг: четыре подарка и отдельный ряд «о себе» и «вручную»", () => {
    const html = render("ru");
    expect(html).toContain("Какую книгу пишете?");
    for (const id of ["love", "mom", "dad", "friend", "autobiography", "blank"]) expect(html).toContain(`data-theme="${id}"`);
    expect(html.indexOf('data-theme="friend"')).toBeLessThan(html.indexOf("Книга о себе или своя"));
    expect(html.indexOf("Книга о себе или своя")).toBeLessThan(html.indexOf('data-theme="autobiography"'));
    expect(html).toContain("Вручную — своя книга с чистого листа");
    expect(html).toContain("Без готовых вопросов");
  });

  it("подарок: имя получателя обязательно и есть род получателя", () => {
    const html = render("ru", "love");
    expect(html).toContain('id="recipientName"');
    expect(html).toMatch(/id="recipientName"[^>]*required/);
    expect(html).toContain('name="recipientGender"');
    expect(html).not.toContain('id="firstChapterTitle"');
    expect(html).not.toContain('id="dedication"');
  });

  it("автобиография: «Чья это история?», посвящение, без получателя и без его рода", () => {
    const html = render("ru", "autobiography");
    expect(html).toContain("Чья это история?");
    expect(html).toContain("Близкого человека — записываю с его слов");
    expect(html).toContain('id="dedication"');
    expect(html).not.toContain('id="recipientName"');
    expect(html).not.toContain('name="recipientGender"');
    // Своя история: поля «кто записывает» ещё нет — оно появляется при выборе «Близкого человека».
    expect(html).not.toContain('id="recordedBy"');
    expect(html).toContain('name="authorGender"');
  });

  it("своя книга: необязательный получатель без рода, название обязательно, первая глава", () => {
    const html = render("ru", "blank");
    expect(html).toMatch(/id="recipientName"(?![^>]*required)/);
    expect(html).toContain("Для кого — необязательно");
    expect(html).not.toContain('name="recipientGender"');
    expect(html).toMatch(/id="title"[^>]*required/);
    expect(html).toContain("Как назовёте первую главу?");
    expect(html).toContain('placeholder="Начало"');
    expect(html).toContain("Моя книга");
  });

  it("на казахском те же шаги и первая глава «Бастау»", () => {
    expect(render("kk")).toContain("Қандай кітап жазасыз?");
    const blank = render("kk", "blank");
    expect(blank).toContain("Бірінші тарауды қалай атайсыз?");
    expect(blank).toContain('placeholder="Бастау"');
    expect(render("kk", "autobiography")).toContain("Бұл кімнің тарихы?");
  });
});

describe("хаб книги: главы и ссылки на разделы", () => {
  const titleOf = (key: string) => (key === "a" ? "Начало" : key === "b" ? "Детство" : "Без названия");
  const q = (id: string, chapter: string, answer = "") => ({ id, chapter, answer });

  it("у своей книги пустая глава остаётся в списке, порядок — по таблице глав", () => {
    const chapters = hubChapters("blank", [{ key: "a" }, { key: "b" }], [q("s1", "a", "текст"), q("s2", "a")], titleOf);
    expect(chapters.map((c) => [c.key, c.total, c.answered, c.firstOpenId])).toEqual([
      ["a", 2, 1, "s2"],
      ["b", 0, 0, null],
    ]);
  });

  it("раздел потерянной главы идёт в конце под «Без названия»", () => {
    const chapters = hubChapters("blank", [{ key: "a" }], [q("s1", "lost", "x"), q("s2", "a")], titleOf);
    expect(chapters.map((c) => c.title)).toEqual(["Начало", "Без названия"]);
  });

  it("у книг с банком главы — по вопросам, таблица глав не нужна", () => {
    const chapters = hubChapters("love", [], [q("1", "intro", "да"), q("2", "intro"), q("3", "story")], (k) => k);
    expect(chapters.map((c) => [c.key, c.answered, c.total])).toEqual([
      ["intro", 1, 2],
      ["story", 0, 1],
    ]);
  });

  it("ссылка на раздел — по id", () => {
    expect(sectionHref("b1", "s1")).toBe("/books/b1/questions?s=s1");
    expect(sectionHref("b1", null)).toBe("/books/b1/questions");
  });
});

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
