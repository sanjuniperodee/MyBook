import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ChaptersEditor, withChapterLine } from "@/app/(app)/books/[id]/pages/ChaptersEditor";
import { MessagesContext } from "@/i18n/context";
import { kk } from "@/i18n/messages/kk";
import { ru } from "@/i18n/messages/ru";
import { sampleToc, type SampleTocCandidate, type TocLines } from "@/lib/book/toc";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {} }), usePathname: () => "/", useSearchParams: () => new URLSearchParams() }));

// Блок «Главы книги» на вкладке «Страницы»: что видит автор, когда убирает или переименовывает главу.

const html = (el: ReactElement, messages: typeof ru | typeof kk = ru) => renderToStaticMarkup(createElement(MessagesContext.Provider, { value: messages }, el));
const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

const chapter = (key: string, label: string, first = false): SampleTocCandidate => ({ key: `c:${key}`, pageKey: key, kind: "chapter", number: 1, label, page: 5, ...(first ? { first: true } : {}) });
const story = (id: string, parent: string, label: string): SampleTocCandidate => ({ key: `q:${id}`, pageKey: `q:${id}`, kind: "section", number: null, label, parent: `c:${parent}`, page: 6 });
const candidates: SampleTocCandidate[] = [
  chapter("intro", "Алғысөздің орнына", true),
  story("a", "intro", "Алғашқы бет"),
  chapter("meet", "Бәрі қалай басталды"),
  story("b", "meet", "Кездейсоқтық па?"),
  chapter("date", "Алғашқы кездесу"),
  story("c", "date", "Екеумізге ғана тиесілі сәт"),
  chapter("love", "Ғашықтық"),
  story("d", "love", "Сол бір тосынсый"),
  story("e", "love", "Сенің құшағың"),
];
const render = (lines: TocLines, messages: typeof ru | typeof kk = ru) => text(html(createElement(ChaptersEditor, { bookId: "b1", stories: {}, candidates, lines, editable: true, onChange: () => {} }), messages));

describe("Главы книги: убрать и переименовать", () => {
  it("по умолчанию — главы по порядку с числом историй; у первой нет кнопки «Убрать»", () => {
    const t = render({});
    expect(t).toContain("1. ");
    expect(t).toContain("4. ");
    expect(t).toContain("2 истории");
    expect(t).toContain("первую главу убрать нельзя");
    expect(t.match(/Убрать главу/g)).toHaveLength(3);
    // Истории главы раскрываются кнопкой: правка заголовков и перенос — внутри.
    expect(t).toContain("Истории (2)");
  });

  it("убранная глава — без номера, с подсказкой, куда уйдут истории, и кнопкой «Вернуть»; номера дальше подряд", () => {
    const t = render({ "c:date": { hidden: true } });
    expect(t).toContain("1 история перейдёт в главу «Бәрі қалай басталды»");
    expect(t).toContain("Вернуть");
    expect(t).toContain("Убрано глав: 1");
    expect(t).toContain("3. ");
    expect(t).not.toContain("4. ");
  });

  it("истории идут в предыдущую оставшуюся главу — под её новым названием", () => {
    const t = render({ "c:meet": { title: "Біз қалай таныстық" }, "c:date": { hidden: true } });
    expect(t).toContain("перейдёт в главу «Біз қалай таныстық»");
  });

  it("по-казахски", () => {
    expect(render({ "c:date": { hidden: true } }, kk)).toContain("1 әңгіме «Бәрі қалай басталды» тарауына ауысады");
  });

  it("превью оглавления сразу без убранной главы и с номерами подряд", () => {
    const toc = sampleToc(candidates, "chapters", { "c:date": { hidden: true } });
    expect(toc.map((l) => `${l.number}. ${l.title}`)).toEqual(["1. Алғысөздің орнына", "2. Бәрі қалай басталды", "3. Ғашықтық"]);
  });
});

describe("Главы книги: правка строки главы", () => {
  it("переименование, «убрать», эпиграф и их сброс не теряют «без фото главы»", () => {
    const lines: TocLines = { "c:meet": { noOpenerPhoto: true }, "c:love": { title: "Любовь" } };
    expect(withChapterLine(lines, "c:meet", { title: "Знакомство" })).toEqual({ "c:meet": { title: "Знакомство", noOpenerPhoto: true }, "c:love": { title: "Любовь" } });
    expect(withChapterLine({ "c:meet": { title: "Знакомство", noOpenerPhoto: true } }, "c:meet", { title: "" })).toEqual({ "c:meet": { noOpenerPhoto: true } });
    expect(withChapterLine(lines, "c:meet", { hidden: true })["c:meet"]).toEqual({ hidden: true, noOpenerPhoto: true });
    expect(withChapterLine(lines, "c:meet", { epigraph: "Строка" })["c:meet"]).toEqual({ epigraph: "Строка", noOpenerPhoto: true });
  });

  it("строка без настроек убирается; длинное название обрезается", () => {
    expect(withChapterLine({ "c:love": { title: "Любовь" } }, "c:love", { title: "" })).toEqual({});
    expect(withChapterLine({}, "c:love", { title: "x".repeat(500) })["c:love"].title!.length).toBeLessThan(500);
  });
});
