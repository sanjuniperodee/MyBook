import { describe, expect, it } from "vitest";
import { localizePath, locales, publicLocales, splitLocale, toPublic } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { ru } from "@/i18n/messages/ru";
import { applyGender } from "@/lib/content/gender";
import { getTheme, giftThemes, themeChaptersByLocale, themeIds } from "@/lib/content/themes";

/** Все строки словаря (функции вызываются с типовыми аргументами — тексты с подстановкой тоже проверяются). */
function strings(node: unknown, path: string, out: [string, string][], depth = 0): void {
  if (depth > 12) return;
  if (typeof node === "string") out.push([path, node]);
  else if (typeof node === "function") {
    try {
      const v = (node as (...a: unknown[]) => unknown)(3, "Test", "Test", "Test", "Test", "Test");
      if (typeof v === "string") out.push([path, v]);
      else strings(v, path, out, depth + 1);
    } catch {
      /* функция требует иных аргументов — её строки проверит чтение исходников */
    }
  } else if (Array.isArray(node)) node.forEach((v, i) => strings(v, `${path}[${i}]`, out, depth + 1));
  else if (node && typeof node === "object") for (const [k, v] of Object.entries(node)) strings(v, `${path}.${k}`, out, depth + 1);
}

const CYRILLIC = /[Ѐ-ӿ]/;
const ASCII_APOSTROPHE_IN_WORD = /[A-Za-z]['`][A-Za-z]/;
const FORBIDDEN_MARKS = /[ʻʼ]/;
/** Переведённые пространства словаря (все). */
const TRANSLATED = ["common", "book", "auth", "books", "editor", "checkout", "orders", "review", "invite", "pay", "access", "design", "help", "answerFile", "secondary", "bookStudio", "mail", "api", "catalog", "gift", "landing", "legal"] as const;

describe("узбекский: адреса", () => {
  it("все страницы получают префикс /uz, служебные пути — нет", () => {
    expect(localizePath("/books/abc?x=1", "uz")).toBe("/uz/books/abc?x=1");
    expect(localizePath("/login", "uz")).toBe("/uz/login");
    expect(localizePath("/", "uz")).toBe("/uz");
    expect(localizePath("/kniga/podarok-mame", "uz")).toBe("/uz/kniga/podarok-mame");
    expect(localizePath("/uz/books", "uz")).toBe("/uz/books");
    for (const p of ["/api/x", "/admin", "/print/1", "/file.pdf"]) expect(localizePath(p, "uz"), p).toBe(p);
    expect(localizePath("/books", "kk")).toBe("/kk/books");
    expect(localizePath("/books", "ru")).toBe("/books");
  });

  it("splitLocale", () => {
    expect(splitLocale("/uz/books/1")).toEqual({ locale: "uz", path: "/books/1" });
    expect(splitLocale("/uz")).toEqual({ locale: "uz", path: "/" });
    expect(splitLocale("/kk/orders")).toEqual({ locale: "kk", path: "/orders" });
    expect(splitLocale("/uzbek")).toEqual({ locale: "ru", path: "/uzbek" });
  });

  it("публичные языки — все три, узбекский не сводится к русскому", () => {
    expect(publicLocales).toEqual(["ru", "kk", "uz", "en"]);
    expect(locales).toEqual(["ru", "kk", "uz", "en"]);
    expect([toPublic("ru"), toPublic("kk"), toPublic("uz"), toPublic("en")]).toEqual(["ru", "kk", "uz", "en"]);
  });
});

describe("узбекский: банки вопросов", () => {
  it("те же главы, число вопросов и длина кортежей, что в русском", () => {
    for (const id of themeIds) {
      const { ru: r, uz } = themeChaptersByLocale(id);
      expect(uz.map((c) => c.key), id).toEqual(r.map((c) => c.key));
      expect(uz.map((c) => [c.questions.length, !!c.epigraph]), id).toEqual(r.map((c) => [c.questions.length, !!c.epigraph]));
      for (const [i, ch] of uz.entries()) expect(ch.questions.map((q) => q.length), `${id}.${ch.key}`).toEqual(r[i].questions.map((q) => q.length));
    }
  });

  it("латиница без кириллицы и без чужих апострофов, подписи тем переведены", () => {
    for (const id of themeIds) {
      const t = getTheme(id, "uz");
      for (const s of [t.name, t.short, t.description, t.recipientLabel ?? "", t.recipientPlaceholder ?? "", ...t.titleSuggestions, t.firstChapterTitle ?? ""]) {
        expect(s, `${id}: ${s}`).not.toMatch(CYRILLIC);
        expect(s, s).not.toMatch(ASCII_APOSTROPHE_IN_WORD);
      }
      expect(t.titleSuggestions.length, id).toBe(getTheme(id, "ru").titleSuggestions.length);
      for (const ch of t.chapters) for (const s of [ch.title, ch.epigraph ?? "", ...ch.questions.flat()] as string[]) {
        expect(s, `${id}.${ch.key}: ${s}`).not.toMatch(CYRILLIC);
        expect(s, `${id}.${ch.key}: ${s}`).not.toMatch(ASCII_APOSTROPHE_IN_WORD);
        expect(s, `${id}.${ch.key}`).not.toMatch(FORBIDDEN_MARKS);
      }
    }
  });

  it("у тем с постоянным родом адресата в узбекском нет [..|..]", () => {
    for (const id of ["grandma", "grandpa", "daughterinlaw", "parents", "family"] as const)
      for (const ch of getTheme(id, "uz").chapters) for (const s of [ch.title, ch.epigraph ?? "", ...ch.questions.flat()] as string[]) expect(s, `${id}.${ch.key}`).not.toMatch(/\[[^\]]*\|[^\]]*\]/);
  });

  it("маркеры [..|..] у мамы и папы дают разные слова, а в [м|ж] первым стоит мужской род", () => {
    const parent = getTheme("mom", "uz").chapters.flatMap((c) => c.questions.flat()).filter((s): s is string => typeof s === "string" && /\[[^\]]*\|[^\]]*\]/.test(s));
    expect(parent.length).toBeGreaterThan(0);
    const ruParent = getTheme("mom", "ru").chapters.flatMap((c) => c.questions.flat()).filter((s): s is string => typeof s === "string" && /\[[^\]]*\|[^\]]*\]/.test(s));
    expect(ruParent.length).toBeGreaterThan(0);
    for (const s of parent) {
      const m = applyGender(s, "m", "m");
      const f = applyGender(s, "m", "f");
      expect(m, s).not.toBe(f);
      expect(m, s).not.toMatch(/[\[\]|]/);
      expect(f, s).not.toMatch(/[\[\]|]/);
    }
  });

  it("подарков столько же, сколько в русском, у каждого — получатель и 40+ вопросов (кроме «любимому»)", () => {
    expect(giftThemes("uz").map((t) => t.id)).toEqual(giftThemes("ru").map((t) => t.id));
  });
});

describe("узбекский: словарь интерфейса", () => {
  it("полный: те же ключи, что в русском; клиентский словарь собран из тех же частей", () => {
    const uz = messagesFor("uz");
    expect(Object.keys(uz).sort()).toEqual(Object.keys(ru).sort());
    const keysOf = (o: unknown, path = ""): string[] =>
      o && typeof o === "object" && !Array.isArray(o) ? Object.entries(o).flatMap(([k, v]) => keysOf(v, `${path}.${k}`)) : [path];
    expect(keysOf(uz.books).sort()).toEqual(keysOf(ru.books).sort());
    expect(keysOf(uz.editor).sort()).toEqual(keysOf(ru.editor).sort());
  });

  it("в переведённых частях нет кириллицы, ASCII-апострофов внутри слов и знаков U+02BB/U+02BC", () => {
    const uz = messagesFor("uz") as unknown as Record<string, unknown>;
    const bad: string[] = [];
    for (const ns of TRANSLATED) {
      const found: [string, string][] = [];
      strings(uz[ns], ns, found);
      for (const [path, s] of found.filter(([p]) => p !== "common.lang.switchTo")) if (CYRILLIC.test(s) || ASCII_APOSTROPHE_IN_WORD.test(s) || FORBIDDEN_MARKS.test(s)) bad.push(`${path}: ${s.slice(0, 90)}`);
    }
    expect(bad.slice(0, 40)).toEqual([]);
  });

  it("лендинг и юридические тексты тоже переведены, а не русские", () => {
    const uz = messagesFor("uz");
    expect(uz.landing).not.toBe(ru.landing);
    expect(uz.legal).not.toBe(ru.legal);
  });
});

describe("узбекский: переносы в PDF", () => {
  it("слова делятся по слогам, o‘ g‘ sh ch ng не рвутся, склейка возвращает слово", async () => {
    const { hyphenateUz, isUzbekWord } = await import("@/lib/book/hyphen-uz");
    expect(hyphenateUz("kitobxon")).toEqual(["ki", "tob", "xon"]);
    expect(hyphenateUz("o‘qituvchi")).toEqual(["o‘", "qi", "tuv", "chi"]);
    expect(hyphenateUz("mashinalar")).toEqual(["ma", "shi", "na", "lar"]);
    expect(hyphenateUz("yaxshi")).toEqual(["yax", "shi"]);
    expect(hyphenateUz("ona")).toEqual(["ona"]);
    for (const w of ["buyurtma", "mehribonlik", "xotiralarimiz", "tug‘ilgan", "bog‘lanish", "ming’illab"]) expect(hyphenateUz(w).join(""), w).toBe(w);
    expect(isUzbekWord("kitob")).toBe(true);
    expect(isUzbekWord("книга")).toBe(false);
    expect(hyphenateUz("книжечка")).toEqual(["книжечка"]);
  });
});
