import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { InteriorSpread, sampleOpener, type SpreadSample } from "@/book-view/interior/InteriorSpread";
import { MessagesContext } from "@/i18n/context";
import { kk } from "@/i18n/messages/kk";
import { ru } from "@/i18n/messages/ru";
import { formats } from "@/lib/book/formats";
import { getInteriorDesign, interiorDesigns } from "@/lib/book/interiors";
import { checkReadiness } from "@/modules/authoring/domain/readiness";
import { bookSpreadSample } from "@/server/spreadSample";
import { buildLayout, layoutBundle, layoutPhoto as photo } from "./fixtures/layout-books";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {} }), usePathname: () => "/", useSearchParams: () => new URLSearchParams() }));

// Пример разворота по правилам 2 (сборщик сервера + вид разворота src/book-view) и проверка готовности к заказу.
// Экраны «Страницы» и «Обложка» — в тестах mybook-web.

const html = (el: ReactElement, messages: typeof ru | typeof kk = ru) => renderToStaticMarkup(createElement(MessagesContext.Provider, { value: messages }, el));

describe("пример разворота: начало главы по правилам 2 — как в книге", () => {
  const sample = (rev: number, photos = [photo("p1", 0), photo("p2", 1, { chapter: "a", opener: true, crop: { x: 0.2, y: 0.4, zoom: 1.5 } })]) => {
    const b = layoutBundle({ chapters: ["a", "b"], photos, book: { layoutRev: rev, interior: "luna" } });
    return bookSpreadSample(b.book, b.questions, b.chapters, "", b.photos);
  };

  it("правила 2: выбранное фото главы с его кадром, а не первое фото книги", () => {
    const s = sample(2);
    expect(s.opener).toEqual({ url: "/api/photos/p2?size=view", crop: { x: 0.2, y: 0.4, zoom: 1.5 } });
  });

  it("правила 2 без выбранного фото главы — страница с названием; в миниатюре выбора оформления — пейзаж", () => {
    const s = sample(2, [photo("p1", 0), photo("p2", 1)]);
    expect(s.opener).toBeNull();
    expect(sampleOpener(s)).toBeUndefined();
    expect(sampleOpener(s, true)).toEqual({});
    const shown = (placeholder: boolean) => html(createElement(InteriorSpread, { design: getInteriorDesign("luna"), format: formats.a5, sample: s as SpreadSample, openerPlaceholder: placeholder }));
    expect(shown(false)).not.toContain("/api/photos/p1");
    expect(shown(false)).not.toContain("/api/photos/p2");
  });

  it("отмеченное фото в оформлении без фото главы — всё равно фото главы примера (миниатюры других оформлений)", () => {
    const b = layoutBundle({ chapters: ["a"], photos: [photo("p1", 0), photo("p2", 1, { chapter: "a", opener: true })], book: { layoutRev: 2, interior: interiorDesigns.find((d) => !d.opener.photo)!.id } });
    expect(bookSpreadSample(b.book, b.questions, b.chapters, "", b.photos).opener).toEqual({ url: "/api/photos/p2?size=view" });
  });

  it("прежние правила — как раньше: первое фото книги", () => {
    const s = sample(1);
    expect(s.opener).toBeUndefined();
    expect(sampleOpener(s)?.url).toBe("/api/photos/p1?size=full");
  });
});

describe("готовность к заказу: главы без фото и сильная обрезка — предупреждения", () => {
  const stats = { answered: 20, total: 20, photos: 3, words: 5000, estimatedPages: 60, printedPages: 60, emptyChapters: 0 };
  const readiness = (rev: number, photos: Parameters<typeof layoutBundle>[0]["photos"], book: Parameters<typeof layoutBundle>[0]["book"] = {}) => {
    const b = layoutBundle({ chapters: ["a", "b", "c"], photos, book: { layoutRev: rev, interior: "luna", ...book } });
    const row = { ...b.book, coverTemplate: "classic", coverPhotoExtra: [] };
    return checkReadiness(row, stats, b.photos, "ru", buildLayout(b));
  };

  it("оформление с фото главы: главы без фото (кроме решивших «без фото») — ссылка на первый ответ первой такой главы", () => {
    const issues = readiness(2, [photo("p1", 0, { chapter: "a", opener: true })], { tocLines: { "c:c": { noOpenerPhoto: true } } });
    const missing = issues.find((i) => i.text.includes("без фото в начале"));
    expect(missing).toMatchObject({ level: "warning", href: "/books/b1/questions?s=q-b" });
    expect(missing!.text).toContain("Одна глава");
    expect(missing!.text).toContain(`«${ru.catalog.interiors.luna.name}»`);
    expect(issues.every((i) => i.level !== "error" || !i.text.includes("фото в начале"))).toBe(true);
  });

  it("все главы с фото или в оформлении без фото главы — молчим", () => {
    const all = [photo("p1", 0, { chapter: "a", opener: true }), photo("p2", 1, { chapter: "b", opener: true }), photo("p3", 2, { chapter: "c", opener: true })];
    expect(readiness(2, all).some((i) => i.text.includes("без фото в начале"))).toBe(false);
    const plain = interiorDesigns.find((d) => !d.opener.photo)!.id;
    expect(readiness(2, [], { interior: plain }).some((i) => i.text.includes("без фото в начале"))).toBe(false);
  });

  it("фото «до краёв» с обрезкой ≥ 0,3 — счёт и ссылка на фильтр «С обрезкой»", () => {
    const issues = readiness(2, [photo("wide", 0, { layout: "bleed", width: 3000, height: 1000 }), photo("ok", 1, { layout: "bleed", width: 1480, height: 2100 })], { interior: interiorDesigns.find((d) => !d.opener.photo)!.id });
    expect(issues.find((i) => i.href?.endsWith("/photos?filter=crop"))).toMatchObject({ level: "warning", text: ru.books.readiness.heavyCrop(1) });
  });

  it("без собранной книги — прежние проверки", () => {
    const b = layoutBundle({ chapters: ["a"], photos: [], book: { interior: "luna" } });
    expect(checkReadiness({ ...b.book, coverTemplate: "classic", coverPhotoExtra: [] }, stats, []).some((i) => i.text.includes("без фото в начале"))).toBe(false);
  });
});
