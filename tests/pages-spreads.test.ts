import { describe, expect, it } from "vitest";
import {
  pagesSample,
  spreadPages,
} from "@/modules/production/infrastructure/pagesPreview";
import type { BookBundle } from "@/modules/production/infrastructure/pdf/render";
import type { BookBuildPage } from "@/lib/book/book-build";

/**
 * Развороты «Страниц» для приложения: какие полосы вёрстки встают на развороты — те же, что на сцене сайта
 * (InteriorSpread): «Титул» — титул и посвящение, «Глава» — начальная полоса и первая полоса текста, «Оглавление» —
 * оглавление и последняя страница, «Фото» — первые фотостраницы.
 */
const pages = (kinds: [BookBuildPage["kind"], string?][]): BookBuildPage[] =>
  kinds.map(([kind, chapterKey], i) =>
    chapterKey ? { n: i + 1, kind, chapterKey } : { n: i + 1, kind },
  );

describe("spreadPages", () => {
  const book = pages([
    ["front"],
    ["front"],
    ["front"],
    ["toc"],
    ["opener", "a"],
    ["text", "a"],
    ["text", "a"],
    ["photo", "a"],
    ["photo", "a"],
    ["opener", "b"],
    ["text", "b"],
    ["end"],
  ]);

  it("титул и посвящение, начало главы, оглавление и последняя страница, фото", () => {
    expect(spreadPages(book, "page")).toEqual({
      front: [1, 3],
      chapter: [5, 6],
      toc: [4, 12],
      photos: [8, 9],
    });
  });

  it("глава без начальной полосы — две полосы текста, как TextPage(0) и TextPage(1) сайта", () => {
    expect(spreadPages(book, "inline").chapter).toEqual([6, 7]);
  });

  it("нет фото — нет разворота «Фото»; начальная полоса альбома — не глава", () => {
    const noPhotos = pages([
      ["front"],
      ["front"],
      ["front"],
      ["toc"],
      ["opener", "__gallery"],
      ["opener", "a"],
      ["text", "a"],
      ["end"],
    ]);
    const plan = spreadPages(noPhotos, "page");
    expect(plan.photos).toBeNull();
    expect(plan.chapter).toEqual([6, 7]);
  });
});

describe("pagesSample", () => {
  const q = (id: string, chapter: string, position: number, answer: string) =>
    ({
      id,
      chapter,
      position,
      answer,
      media: [],
    }) as unknown as BookBundle["questions"][number];
  const bundle = {
    book: {
      dedication: "",
      titlePage: false,
      showToc: false,
      photoPlacement: "chapters",
      language: "ru",
    },
    questions: [
      q("q1", "a", 1, "Первый ответ"),
      q("q2", "a", 2, ""),
      q("q3", "b", 3, "Второй глава ".repeat(40)),
      q("q4", "b", 4, "ещё"),
      q("q5", "c", 5, ""),
    ],
    chapters: [],
    photos: [],
  } as unknown as BookBundle;

  it("первая глава — её ответы, остальные главы — по одному короткому ответу для оглавления; пустые главы не печатаются", () => {
    const s = pagesSample(bundle, "Здесь будет посвящение");
    expect(s.bundle.questions.map((x) => x.id)).toEqual(["q1", "q2", "q3"]);
    expect(s.bundle.questions[2].answer.length).toBeLessThanOrEqual(160);
  });

  it("титул и оглавление печатаются всегда, а выключенные — бледные; пустое посвящение — подсказка бледным", () => {
    const s = pagesSample(bundle, "Здесь будет посвящение");
    expect(s.bundle.book).toMatchObject({
      titlePage: true,
      showToc: true,
      dedication: "Здесь будет посвящение",
    });
    expect(s.muted).toEqual({ title: true, toc: true, dedication: true });
  });
});
