import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { BuildNotice, BuildPlaceholder, leafImage, type FlipbookPages } from "@/components/book3d/pages";
import { gutterShade } from "@/components/book3d/webgl/geometry";
import { MessagesContext } from "@/i18n/context";
import { kk } from "@/i18n/messages/kk";
import { ru } from "@/i18n/messages/ru";
import { buildImageBase, type BookBuild, type BookBuildState } from "@/lib/book/book-build";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {} }), usePathname: () => "/", useSearchParams: () => new URLSearchParams() }));

// 3D-книга листает картинки полос экранной сборки: пустые полосы добивки — чистые листы, пока новая сборка не готова —
// листаем прошлую со строкой состояния, а без сборки вместо книги — заглушка (с повтором, если сборка не удалась).

const html = (el: ReactElement, messages: typeof ru | typeof kk = ru) => renderToStaticMarkup(createElement(MessagesContext.Provider, { value: messages }, el));
const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const buttons = (markup: string) => markup.match(/<button/g)?.length ?? 0;

const build: BookBuild = {
  fp: "0123456789abcdef",
  pageCount: 24,
  contentPages: 21,
  trimMm: { w: 148, h: 210 },
  pages: Array.from({ length: 24 }, (_, i) => ({ n: i + 1, kind: i < 3 ? "front" : i < 20 ? "text" : i === 20 ? "end" : "pad" })),
  chapterPages: { intro: 4 },
  imageBase: buildImageBase("b1", "0123456789abcdef"),
};
const pages = (state: BookBuildState | null, error: string | null = null): FlipbookPages => ({
  state,
  error,
  build: state?.status === "ready" ? state.build : (state?.previous ?? null),
  retrying: false,
  retry: () => {},
});
const t = ru.books.preview;

describe("картинки полос на листах", () => {
  it("полоса — картинка сборки нужной ширины; пустая полоса добивки и полоса за концом книги — без картинки", () => {
    expect(leafImage(build, 4, 800)).toBe("/api/books/b1/pages/0123456789abcdef/4?w=800");
    expect(leafImage(build, 21, 1200)).toBe("/api/books/b1/pages/0123456789abcdef/21?w=1200");
    expect(leafImage(build, 22, 800)).toBeNull();
    expect(leafImage(build, 25, 800)).toBeNull();
  });

  it("тень у корешка: темнее всего у сгиба, к 18% ширины сходит на нет и дальше не темнит", () => {
    expect(gutterShade(0)).toBeCloseTo(Math.pow(0.78, 2.2), 6);
    expect(gutterShade(0.07)).toBeCloseTo(Math.pow(0.95, 2.2), 6);
    expect(gutterShade(0.18)).toBe(1);
    expect(gutterShade(0.6)).toBe(1);
    for (let u = 0; u < 0.3; u += 0.01) expect(gutterShade(u + 0.01)).toBeGreaterThanOrEqual(gutterShade(u));
  });
});

describe("заглушка вместо книги, пока сборки нет", () => {
  it("ответа ещё нет — «Готовим страницы…» без кнопок", () => {
    const markup = html(<BuildPlaceholder pages={pages(null)} />);
    expect(text(markup)).toBe(t.flip.loading);
    expect(buttons(markup)).toBe(0);
  });

  it("первая сборка идёт — подсказка, что страницы появятся сами", () => {
    expect(text(html(<BuildPlaceholder pages={pages({ status: "building", previous: null })} />))).toBe(`${t.flip.loading} ${t.reader.buildingHint}`);
  });

  it("сборка не удалась — сообщение и «Попробовать снова»; запрос не прошёл — его текст и тоже повтор", () => {
    const failed = html(<BuildPlaceholder pages={pages({ status: "failed", previous: null, error: "boom" })} />);
    expect(text(failed)).toBe(`${t.reader.failed} ${ru.common.actions.retry}`);
    expect(buttons(failed)).toBe(1);
    const offline = html(<BuildPlaceholder pages={pages(null, "Нет связи")} />);
    expect(text(offline)).toBe(`Нет связи ${ru.common.actions.retry}`);
  });

  it("по-казахски", () => {
    expect(text(html(<BuildPlaceholder pages={pages({ status: "failed", previous: null, error: "boom" })} />, kk))).toBe(`${kk.books.preview.reader.failed} ${kk.common.actions.retry}`);
  });
});

describe("строка над книгой, когда листаем прошлую сборку", () => {
  it("готовая сборка — строки нет; без сборки — тоже (всё сказано в заглушке)", () => {
    expect(text(html(<BuildNotice pages={pages({ status: "ready", build })} />))).toBe("");
    expect(text(html(<BuildNotice pages={pages({ status: "building", previous: null })} />))).toBe("");
  });

  it("новая собирается после правок — «Обновляем страницы…» без кнопки", () => {
    const markup = html(<BuildNotice pages={pages({ status: "building", previous: build })} />);
    expect(text(markup)).toBe(t.reader.updating);
    expect(buttons(markup)).toBe(0);
  });

  it("новая не собралась — показываем прошлую, с повтором", () => {
    const markup = html(<BuildNotice pages={pages({ status: "failed", previous: build, error: "boom" })} />);
    expect(text(markup)).toBe(`${t.reader.failedStale} ${ru.common.actions.retry}`);
    expect(buttons(markup)).toBe(1);
  });

  it("строка — поверх книги, в кадре (появляясь, не сдвигает книгу под пальцем); дольше обычного — подсказка", () => {
    const markup = html(<BuildNotice pages={{ ...pages({ status: "building", previous: build }), slow: true }} />);
    expect(markup).toMatch(/^<div class="pointer-events-none absolute inset-x-3 top-3 z-10/);
    expect(text(markup)).toBe(t.reader.slow);
  });

  it("картинки полос не грузятся и после повторов — строка с повтором; ошибка запроса важнее", () => {
    const markup = html(<BuildNotice pages={{ ...pages({ status: "ready", build }), pagesFailed: true }} />);
    expect(text(markup)).toBe(`${t.reader.pagesFailed} ${ru.common.actions.retry}`);
    expect(buttons(markup)).toBe(1);
    expect(text(html(<BuildNotice pages={{ ...pages({ status: "ready", build }, "Нет связи"), pagesFailed: true }} />))).toBe(`Нет связи ${ru.common.actions.retry}`);
  });

  it("запрос не прошёл: у готовой — с повтором; во время сборки — без (опрос повторится сам)", () => {
    expect(buttons(html(<BuildNotice pages={pages({ status: "ready", build }, "Нет связи")} />))).toBe(1);
    const busy = html(<BuildNotice pages={pages({ status: "building", previous: build }, "Нет связи")} />);
    expect(text(busy)).toBe(`${t.reader.updating} Нет связи`);
    expect(buttons(busy)).toBe(0);
  });
});
