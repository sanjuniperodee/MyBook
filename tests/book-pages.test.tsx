import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { bookSpreads, PageReaderView, READER_WIDTHS } from "@/components/book-pages/PageReader";
import { MessagesContext } from "@/i18n/context";
import { kk } from "@/i18n/messages/kk";
import { ru } from "@/i18n/messages/ru";
import { buildImageBase, type BookBuild, type BookBuildState, type BuildProgress } from "@/lib/book/book-build";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {} }), usePathname: () => "/", useSearchParams: () => new URLSearchParams() }));

// Вкладка PDF предпросмотра: страницы — картинки полос экранной сборки, разворотами как в книге; HTML-вёрстки нет.

const html = (el: ReactElement, messages: typeof ru | typeof kk = ru) => renderToStaticMarkup(createElement(MessagesContext.Provider, { value: messages }, el));
const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

const build = (fp: string, pageCount: number): BookBuild => ({
  fp,
  pageCount,
  contentPages: pageCount - 1,
  trimMm: { w: 148, h: 210 },
  pages: Array.from({ length: pageCount }, (_, i) => ({ n: i + 1, kind: i === 0 ? "front" : i === pageCount - 1 ? "pad" : "text" })),
  chapterPages: { intro: 3 },
  imageBase: buildImageBase("b1", fp),
});
const FP = "0123456789abcdef";
const OLD = "fedcba9876543210";
const render = (state: BookBuildState | null, error: string | null = null, messages: typeof ru | typeof kk = ru, extra: { slow?: boolean; retryAt?: number | null; progress?: BuildProgress | null } = {}) =>
  html(createElement(PageReaderView, { bookId: "b1", state, error, onRetry: () => {}, ...extra }), messages);
const spreads = (markup: string) => [...markup.matchAll(/data-spread="([^"]*)"/g)].map((m) => m[1]);
const images = (markup: string) => [...markup.matchAll(/<img [^>]*>/g)].map((m) => m[0]);
const attr = (tag: string, name: string) => tag.match(new RegExp(`${name}="([^"]*)"`))?.[1];

describe("развороты", () => {
  it("первая полоса — одна справа, дальше 2–3, 4–5…; последняя чётная — одна слева", () => {
    expect(bookSpreads(0)).toEqual([]);
    expect(bookSpreads(1)).toEqual([[null, 1]]);
    expect(bookSpreads(5)).toEqual([[null, 1], [2, 3], [4, 5]]);
    expect(bookSpreads(8)).toEqual([[null, 1], [2, 3], [4, 5], [6, 7], [8, null]]);
  });

  it("каждая полоса книги — ровно в одном развороте, по порядку", () => {
    for (const count of [1, 2, 23, 24, 196]) expect(bookSpreads(count).flat().filter((n) => n !== null)).toEqual(Array.from({ length: count }, (_, i) => i + 1));
  });
});

describe("страницы готовой сборки", () => {
  const markup = render({ status: "ready", build: build(FP, 24) });

  it("разметка разворотами: 1, 2–3 … 22–23, 24", () => {
    expect(spreads(markup)).toEqual(["1", ...Array.from({ length: 11 }, (_, i) => `${2 * i + 2}-${2 * i + 3}`), "24"]);
  });

  it("картинки полос — адреса сборки, srcset до 1200 (1600 — только для увеличения), ленивая загрузка и пропорция формата", () => {
    const imgs = images(markup);
    expect(imgs).toHaveLength(24);
    const third = imgs[2];
    expect(attr(third, "src")).toBe(`/api/books/b1/pages/${FP}/3?w=800`);
    expect(READER_WIDTHS).toEqual([480, 800, 1200]);
    expect(attr(third, "srcSet")).toBe(READER_WIDTHS.map((w) => `/api/books/b1/pages/${FP}/3?w=${w} ${w}w`).join(", "));
    // телефон: колонка не шире 448px за вычетом полей — не «100vw», иначе DPR 3 берёт самую большую картинку
    expect(attr(third, "sizes")).toBe("(min-width: 1024px) 400px, (min-width: 768px) calc(50vw - 50px), min(448px, calc(100vw - 66px))");
    expect(attr(third, "loading")).toBe("lazy");
    // 148×210 мм → 800×1135: место под полосу известно до загрузки картинки.
    expect([attr(third, "width"), attr(third, "height")]).toEqual(["800", "1135"]);
    expect(attr(third, "alt")).toBe("Страница 3");
    expect(imgs.map((tag) => attr(tag, "src"))).toEqual(Array.from({ length: 24 }, (_, i) => `/api/books/b1/pages/${FP}/${i + 1}?w=800`));
  });

  it("номер под страницей — n (скрыт от чтения с экрана: он уже в подписи картинки); ссылка на PDF и число страниц", () => {
    expect([...markup.matchAll(/<figcaption[^>]*>(\d+)<\/figcaption>/g)].map((m) => Number(m[1]))).toEqual(Array.from({ length: 24 }, (_, i) => i + 1));
    expect([...markup.matchAll(/<figcaption([^>]*)>/g)].every((m) => m[1].includes('aria-hidden="true"'))).toBe(true);
    expect(markup).toContain('href="/api/books/b1/preview"');
    expect(markup).toMatch(/<a [^>]*href="\/api\/books\/b1\/preview"[^>]*download=""[^>]*target="_blank"/);
    expect(text(markup)).toContain("Скачать PDF");
    expect(text(markup)).toContain("24 страницы");
  });

  it("готовая сборка не приглушена и без строки состояния", () => {
    expect(markup).toContain('aria-busy="false"');
    expect(markup).not.toContain("opacity-50");
    expect(markup).not.toContain('role="status"');
  });

  it("квадратный формат — квадратная рамка", () => {
    const square = render({ status: "ready", build: { ...build(FP, 4), trimMm: { w: 200, h: 200 } } });
    expect([attr(images(square)[0], "width"), attr(images(square)[0], "height")]).toEqual(["800", "800"]);
  });
});

describe("пока сборка обновляется", () => {
  it("показываем прошлую сборку приглушённой со строкой состояния — её картинки, не новой", () => {
    const markup = render({ status: "building", previous: build(OLD, 6) });
    expect(text(markup)).toContain("Обновляем страницы после последних правок…");
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain("opacity-50");
    expect(spreads(markup)).toEqual(["1", "2-3", "4-5", "6"]);
    expect(images(markup).every((tag) => attr(tag, "src")?.startsWith(`/api/books/b1/pages/${OLD}/`))).toBe(true);
  });

  it("первой сборки ещё нет — ожидание без страниц; скачивание неактивно (ждало бы сборку без отклика)", () => {
    const markup = render({ status: "building", previous: null });
    expect(text(markup)).toContain("Собираем страницы книги…");
    expect(images(markup)).toEqual([]);
    expect(markup).not.toContain('href="/api/books/b1/preview"');
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*title="PDF можно будет скачать, когда страницы соберутся"/);
    expect(text(markup)).toContain("Скачать PDF");
  });

  it("строка состояния — поверх страниц (не сдвигает их): в липком слое нулевой высоты", () => {
    const markup = render({ status: "building", previous: build(OLD, 6) });
    expect(markup).toMatch(/sticky[^"]*h-0[^"]*"><div[^>]*><div role="status"/);
  });

  it("сборка идёт дольше обычного — подсказка вместо «обновляем»", () => {
    expect(text(render({ status: "building", previous: build(OLD, 2) }, null, ru, { slow: true }))).toContain(ru.books.preview.reader.slow);
    expect(text(render({ status: "building", previous: null }, null, ru, { slow: true }))).toContain(ru.books.preview.reader.slow);
  });

  describe("ход сборки", () => {
    const running: BuildProgress = { state: "running", stage: "flow", percent: 45, etaMs: 21_000, overrun: false, ahead: 0 };

    it("первая сборка: этап, проценты и сколько осталось; кнопка скачивания заполняется и показывает проценты", () => {
      const markup = render({ status: "building", previous: null }, null, ru, { progress: running });
      expect(text(markup)).toContain("Верстаем страницы");
      expect(text(markup)).toContain("45%");
      expect(text(markup)).toContain("осталось ≈ 20 с");
      expect(markup).toContain('role="progressbar"');
      expect(markup).toContain('aria-valuenow="45"');
      expect(markup).toContain("width:45%");
      expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>.*· 45%/);
    });

    it("обновление после правок: проценты и остаток — в строке состояния поверх страниц", () => {
      const markup = render({ status: "building", previous: build(OLD, 4) }, null, ru, { progress: running });
      expect(text(markup)).toContain("Обновляем страницы после последних правок… · 45% · осталось ≈ 20 с");
    });

    it("в очереди рендера: сколько стоит впереди, без процентов", () => {
      const queued: BuildProgress = { state: "queued", stage: null, percent: 0, etaMs: null, overrun: false, ahead: 2 };
      const markup = render({ status: "building", previous: null }, null, ru, { progress: queued });
      expect(text(markup)).toContain("Ждём очереди — перед вашей книгой ещё 2");
      expect(markup).not.toContain("aria-valuenow");
      expect(text(markup)).not.toContain("%");
    });

    it("хода ещё нет (первый опрос не пришёл) — прежний экран без полосы; на казахском — казахские подписи", () => {
      expect(render({ status: "building", previous: null })).not.toContain("progressbar");
      expect(text(render({ status: "building", previous: null }, null, kk, { progress: running }))).toContain(kk.orders.order.progress.stages.flow);
    });
  });

  it("сбой опроса во время сборки — текст ошибки без кнопки: опрос повторится сам", () => {
    const markup = render({ status: "building", previous: build(OLD, 2) }, "Нет связи");
    expect(text(markup)).toContain("Нет связи");
    expect(text(markup)).not.toContain(ru.common.actions.retry);
  });
});

describe("сборка не удалась", () => {
  it("без прошлой — сообщение и кнопка «Попробовать снова»", () => {
    const markup = render({ status: "failed", previous: null, error: "renderFailed" });
    expect(text(markup)).toContain("Не удалось собрать страницы книги.");
    expect(text(markup)).toContain(ru.common.actions.retry);
    expect(images(markup)).toEqual([]);
  });

  it("с прошлой — её страницы в полную силу (не «занято»: ошибка может висеть долго), кнопка одна, даже если и запрос не прошёл", () => {
    const markup = render({ status: "failed", previous: build(OLD, 4), error: "renderFailed" }, "Нет связи");
    expect(text(markup)).toContain("Не удалось обновить страницы — показываем прошлую версию.");
    expect(markup).toContain('aria-busy="false"');
    expect(markup).not.toContain("opacity-50");
    expect(text(markup).split(ru.common.actions.retry)).toHaveLength(2);
  });

  it("повтор пока не сработает — кнопка неактивна, рядом время, когда можно", () => {
    const at = new Date(2026, 9, 22, 14, 5).getTime();
    const markup = render({ status: "failed", previous: null, error: "renderFailed", retryInMs: 60_000 }, null, ru, { retryAt: at });
    expect(text(markup)).toContain("Повторить можно в 14:05");
    expect(markup).toMatch(/<button type="button" class="btn btn-outline btn-sm" disabled="">/);
    expect(render({ status: "failed", previous: null, error: "renderFailed", retryInMs: 0 })).not.toContain('disabled=""><svg');
  });

  it("первый запрос не прошёл — ошибка и кнопка, без вечной загрузки", () => {
    const markup = render(null, "Нет связи");
    expect(text(markup)).toContain("Нет связи");
    expect(text(markup)).toContain(ru.common.actions.retry);
    expect(text(markup)).not.toContain(ru.common.actions.loading);
  });
});

describe("по-казахски", () => {
  it("подписи страниц и состояния — из словаря kk", () => {
    const markup = render({ status: "building", previous: build(FP, 4) }, null, kk);
    expect(attr(images(markup)[2], "alt")).toBe("3-бет");
    expect(text(markup)).toContain("Соңғы түзетулерден кейін беттерді жаңартып жатырмыз…");
    expect(text(markup)).toContain("PDF жүктеп алу");
    expect(text(markup)).toContain("4 бет");
  });
});
