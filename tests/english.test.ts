import { describe, expect, it } from "vitest";
import { localizePath, splitLocale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { ru } from "@/i18n/messages/ru";
import { applyGender } from "@/lib/content/gender";
import { getTheme, themeChaptersByLocale, themeIds } from "@/lib/content/themes";

function strings(node: unknown, path: string, out: [string, string][], depth = 0): void {
  if (depth > 12) return;
  if (typeof node === "string") out.push([path, node]);
  else if (typeof node === "function") {
    try {
      const v = (node as (...a: unknown[]) => unknown)(3, "Test", "Test", "Test", "Test", "Test");
      if (typeof v === "string") out.push([path, v]);
      else strings(v, path, out, depth + 1);
    } catch {
      /* функция требует иных аргументов */
    }
  } else if (Array.isArray(node)) node.forEach((v, i) => strings(v, `${path}[${i}]`, out, depth + 1));
  else if (node && typeof node === "object") for (const [k, v] of Object.entries(node)) strings(v, `${path}.${k}`, out, depth + 1);
}

const CYRILLIC = /[Ѐ-ӿ]/;

describe("английский: адреса", () => {
  it("префикс /en у всех страниц, служебные пути — без него", () => {
    expect(localizePath("/books/abc?x=1", "en")).toBe("/en/books/abc?x=1");
    expect(localizePath("/", "en")).toBe("/en");
    expect(localizePath("/kniga/podarok-mame", "en")).toBe("/en/kniga/podarok-mame");
    expect(localizePath("/en/books", "en")).toBe("/en/books");
    for (const p of ["/api/x", "/admin", "/print/1", "/file.pdf"]) expect(localizePath(p, "en"), p).toBe(p);
    expect(splitLocale("/en/books/1")).toEqual({ locale: "en", path: "/books/1" });
    expect(splitLocale("/english")).toEqual({ locale: "ru", path: "/english" });
  });
});

describe("английский: банки вопросов", () => {
  it("те же главы, число вопросов и длина кортежей, что в русском", () => {
    for (const id of themeIds) {
      const { ru: r, en } = themeChaptersByLocale(id);
      expect(en.map((c) => c.key), id).toEqual(r.map((c) => c.key));
      expect(en.map((c) => [c.questions.length, !!c.epigraph]), id).toEqual(r.map((c) => [c.questions.length, !!c.epigraph]));
      for (const [i, ch] of en.entries()) expect(ch.questions.map((q) => q.length), `${id}.${ch.key}`).toEqual(r[i].questions.map((q) => q.length));
    }
  });

  it("без кириллицы, подписи тем переведены, маркеры рода из двух частей, у постоянного рода адресата их нет", () => {
    for (const id of themeIds) {
      const t = getTheme(id, "en");
      for (const s of [t.name, t.short, t.description, t.recipientLabel ?? "", t.recipientPlaceholder ?? "", ...t.titleSuggestions, t.firstChapterTitle ?? ""]) expect(s, `${id}: ${s}`).not.toMatch(CYRILLIC);
      expect(t.titleSuggestions.length, id).toBe(getTheme(id, "ru").titleSuggestions.length);
      for (const ch of t.chapters)
        for (const s of [ch.title, ch.epigraph ?? "", ...ch.questions.flat()] as string[]) {
          expect(s, `${id}.${ch.key}: ${s}`).not.toMatch(CYRILLIC);
          for (const m of s.match(/\[[^\]]*\]/g) ?? []) expect(m.split("|").length, `${id}.${ch.key}: ${m}`).toBe(2);
          if (["grandma", "grandpa", "daughterinlaw", "parents", "family"].includes(id)) expect(s, `${id}.${ch.key}`).not.toMatch(/\[[^\]]*\|[^\]]*\]/);
        }
    }
  });

  it("маркеры в «маме/папе» дают разные слова для мужского и женского адресата", () => {
    const marked = getTheme("mom", "en").chapters.flatMap((c) => c.questions.flat()).filter((s): s is string => typeof s === "string" && /\[[^\]]*\|[^\]]*\]/.test(s));
    expect(marked.length).toBeGreaterThan(0);
    for (const s of marked) {
      const m = applyGender(s, "m", "m");
      const f = applyGender(s, "m", "f");
      expect(m, s).not.toBe(f);
      expect(`${m}${f}`, s).not.toMatch(/[\[\]|]/);
    }
  });
});

describe("английский: словарь интерфейса", () => {
  it("полный и без кириллицы (кроме названия русского языка)", () => {
    const en = messagesFor("en") as unknown as Record<string, unknown>;
    expect(Object.keys(en).sort()).toEqual(Object.keys(ru).sort());
    const bad: string[] = [];
    for (const [ns, node] of Object.entries(en)) {
      const found: [string, string][] = [];
      strings(node, ns, found);
      for (const [path, s] of found) if (CYRILLIC.test(s) && path !== "common.lang.switchTo") bad.push(`${path}: ${s.slice(0, 90)}`);
    }
    expect(bad.slice(0, 40)).toEqual([]);
  });
});

describe("английский: переносы в PDF", () => {
  it("английские шаблоны делят длинные слова, склейка возвращает слово", async () => {
    const hyphen = (await import("hyphen/en-us/index.js")).default;
    const parts = hyphen.hyphenateSync("remembering", { minWordLength: 6 }).split("­");
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.join("")).toBe("remembering");
  });
});
