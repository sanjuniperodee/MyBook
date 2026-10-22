import { createElement, createRef, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChapterStart, ChapterStartCard, type ChapterStartCardProps } from "@/components/editor/questions/ChapterStartCard";
import { ChapterPages, chapterContentKey } from "@/components/editor/preview/ChapterPages";
import { pageKit } from "@/components/interior/kit";
import { pxUnits } from "@/components/interior/units";
import { MessagesContext } from "@/i18n/context";
import { kk } from "@/i18n/messages/kk";
import { ru } from "@/i18n/messages/ru";
import { editorContent } from "@/lib/book/editor-estimate";
import { previewFromContent, type EditorBook, type EditorChapter, type EditorPhoto, type EditorQuestion } from "@/lib/book/editor-model";
import { formats } from "@/lib/book/formats";
import { getInteriorDesign } from "@/lib/book/interiors";
import { photoPlaceOf } from "@/lib/book/photo-place";

// Карточка «Начало главы» над первым вопросом главы (S0) и превью «Так будет в книге» по сборке книги (S4).

const html = (el: ReactElement, messages: typeof ru | typeof kk = ru) => renderToStaticMarkup(createElement(MessagesContext.Provider, { value: messages }, el));
const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

const card = (p: Partial<ChapterStartCardProps> = {}) =>
  createElement(ChapterStartCard, {
    book: { interior: "luna", format: "a5", language: "ru" },
    title: "Как мы познакомились",
    number: 2,
    opener: null,
    dismissed: false,
    after: 0,
    editable: true,
    onAction: () => {},
    ...p,
  });

describe("карточка «Начало главы»: фото главы в оформлении с фото", () => {
  it("(a) фото не выбрано — янтарная подсказка с формой рамки, [Выбрать фото] [Без фото]; мини-страница без фото", () => {
    const m = html(card());
    const t = text(m);
    expect(m).toContain('data-chapter-start="prompt"');
    expect(t).toContain("Начало главы «Как мы познакомились»");
    expect(t).toContain("глава начинается с фото в круге. Выберите снимок — или оставьте без фото.");
    expect(t).toContain("Выбрать фото");
    expect(t).toContain("Без фото");
    expect(t).not.toContain("Кадр");
    expect(m).not.toContain("<img");
  });

  it("(b) фото выбрано — мини-страница с ним, [Изменить] [Кадр]", () => {
    const m = html(card({ opener: { url: "/api/photos/p1?size=thumb", crop: { x: 0.4, y: 0.2, zoom: 1.3 } } }));
    const t = text(m);
    expect(m).toContain('data-chapter-start="chosen"');
    expect(m).toContain("/api/photos/p1?size=thumb");
    expect(t).toContain("Изменить");
    expect(t).toContain("Кадр");
    expect(t).not.toContain("Выбрать фото");
    expect(t).not.toContain("Без фото");
  });

  it("(c) «Без фото» — тихая строка и [Изменить], без подсказки", () => {
    const t = text(html(card({ dismissed: true })));
    expect(t).toContain("Глава начнётся без фото — страницей с названием");
    expect(t).toContain("Изменить");
    expect(t).not.toContain("Выберите снимок");
    expect(t).not.toContain("Кадр");
  });

  it("фото после главы: число и [Изменить]; нет — «Добавить фото после главы»", () => {
    expect(text(html(card({ after: 3 })))).toContain("После главы: 3 фото");
    expect(text(html(card({ after: 0 })))).toContain("Добавить фото после главы");
  });

  it("только чтение — без кнопок", () => {
    const m = html(card({ editable: false, after: 2 }));
    expect(m).not.toContain("<button");
    expect(text(m)).toContain("После главы: 2 фото");
  });
});

describe("карточка «Начало главы»: оформление без фото главы", () => {
  it("только вторая строка — фото после главы; ни мини-страницы, ни подсказки, ни «Кадр»", () => {
    const m = html(card({ book: { interior: "classic", format: "a5", language: "ru" }, after: 2 }));
    const t = text(m);
    expect(m).toContain('data-chapter-start="plain"');
    expect(t).toContain("Начало главы «Как мы познакомились»");
    expect(t).toContain("После главы: 2 фото");
    expect(t).not.toContain("Выбрать фото");
    expect(t).not.toContain("Без фото");
    expect(t).not.toContain("Кадр");
  });
});

describe("карточка «Начало главы» по-казахски", () => {
  it("подсказка, кнопки и фото после главы — на казахском", () => {
    const t = text(html(card({ after: 2 }), kk));
    expect(t).toContain("«Как мы познакомились» тарауының басы");
    expect(t).toContain("безендіруінде тарау фотодан басталады (дөңгелек ішінде)");
    expect(t).toContain("Фото таңдау");
    expect(t).toContain("Фотосыз");
    expect(t).toContain("Тараудан кейін: 2 фото");
  });

  it("«без фото» и пустая вторая строка", () => {
    const t = text(html(card({ dismissed: true }), kk));
    expect(t).toContain("Тарау фотосыз, атауы бар беттен басталады");
    expect(t).toContain("Тараудан кейін фото қосу");
  });
});

// ─── по сборке книги ────────────────────────────────────────────────────────

const q = (id: string, chapter: string, answer: string, p: Partial<EditorQuestion> = {}): EditorQuestion => ({
  id,
  chapter,
  chapterTitle: "",
  prompt: "",
  hint: null,
  defaultTitle: `Раздел ${id}`,
  displayText: null,
  hideHeading: false,
  answer,
  media: [],
  isCustom: true,
  ...p,
});
const photo = (id: string, p: Partial<EditorPhoto> = {}): EditorPhoto => ({ id, width: 1200, height: 1600, caption: "", layout: "full", questionId: null, inline: null, crop: null, chapter: null, opener: false, onCover: null, ...p });
const book = (p: Partial<EditorBook> = {}): EditorBook => ({ id: "b1", format: "a5", interior: "luna", dedication: "", showToc: true, photoPlacement: "chapters", title: "", language: "ru", theme: "blank", kind: "blank", authorGender: "m", recipientGender: "f", layoutRev: 2, ...p });

describe("карточка своей книги по сборке", () => {
  const chapters: EditorChapter[] = [
    { key: "a", title: "Детство", epigraph: "", own: true },
    { key: "e", title: "", epigraph: "", own: true },
  ];
  const questions = [q("s1", "a", "Текст про детство."), q("s2", "e", "")];
  const start = (b: EditorBook, photos: EditorPhoto[], chapterKey: string, fallbackTitle: string, messages: typeof ru | typeof kk = ru) =>
    text(html(createElement(ChapterStart, { book: b, questions, photos, letters: [], chapters, chapterKey, fallbackTitle, editable: true, onAction: () => {} }), messages));

  it("глава с текстом: название как в печати, фото после главы, выбранное автором", () => {
    const t = start(book(), [photo("p1", { chapter: "a" }), photo("p2", { chapter: "a" })], "a", "Детство");
    expect(t).toContain("Начало главы «Детство»");
    expect(t).toContain("После главы: 2 фото");
    expect(t).toContain("Выбрать фото");
  });

  it("выбранное фото главы — состояние «выбрано», и оно не считается фото после главы", () => {
    const t = start(book(), [photo("p1", { chapter: "a", opener: true }), photo("p2", { chapter: "a" })], "a", "Детство");
    expect(t).toContain("Кадр");
    expect(t).toContain("После главы: 1 фото");
  });

  it("пустая глава без названия — «Без названия» из редактора; фото, ждущее текста главы, — тоже её", () => {
    const t = start(book(), [photo("p1", { chapter: "e" })], "e", ru.book.untitledChapter);
    expect(t).toContain(`Начало главы «${ru.book.untitledChapter}»`);
    expect(t).toContain("После главы: 1 фото");
  });

  it("«без фото» у главы из строки оглавления (noOpenerPhoto); своё название главы", () => {
    const t = start(book({ tocLines: { "c:a": { noOpenerPhoto: true, title: "Самое начало" } } }), [], "a", "Детство");
    expect(t).toContain("Начало главы «Самое начало»");
    expect(t).toContain("Глава начнётся без фото");
  });

  it("убранная автором глава (влита в предыдущую) своего начала не имеет — карточки нет", () => {
    const qs = [q("s1", "a", "Текст."), q("s3", "b", "Ещё текст.")];
    const chs: EditorChapter[] = [chapters[0], { key: "b", title: "Школа", epigraph: "", own: true }];
    const m = html(createElement(ChapterStart, { book: book({ tocLines: { "c:b": { hidden: true } } }), questions: qs, photos: [], letters: [], chapters: chs, chapterKey: "b", fallbackTitle: "Школа", editable: true, onAction: () => {} }));
    expect(m).toBe("");
  });

  it("по-казахски", () => {
    expect(start(book({ interior: "classic" }), [], "a", "Детство", kk)).toContain("Тараудан кейін фото қосу");
  });
});

describe("превью по сборке книги", () => {
  const giftQ = (id: string, chapter: string, answer: string) => q(id, chapter, answer, { isCustom: false, chapterTitle: chapter === "c1" ? "Знакомство" : "Свадьба" });
  const questions = [giftQ("q1", "c1", "Мы встретились летом."), giftQ("q2", "c1", ""), giftQ("q3", "c2", "")];
  const gift = (p: Partial<EditorBook> = {}) => book({ theme: "love", kind: "gift", ...p });
  const preview = (b: EditorBook, photos: EditorPhoto[], currentId: string | null = "q1") => {
    const content = editorContent(b, questions, photos, []);
    return previewFromContent(content, questions, photos, { currentId, tocLines: b.tocLines, places: photoPlaceOf(content, photos, b) });
  };

  it("прежние правила: снимок обложки в ответе в превью не виден (как в печати); правила 2 — виден", () => {
    const photos = [photo("cover", { questionId: "q1" }), photo("p1", { questionId: "q1" })];
    const rev1 = preview(gift({ layoutRev: 1, coverPhotoId: "cover" }), photos);
    expect(rev1.chapters[0].entries[0].photos.map((p) => p.id)).toEqual(["p1"]);
    const rev2 = preview(gift({ layoutRev: 2, coverPhotoId: "cover" }), photos);
    expect(rev2.chapters[0].entries[0].photos.map((p) => p.id)).toEqual(["cover", "p1"]);
  });

  it("фото главы с кадром — на начальной полосе; фото после главы — страницами, как в PDF; «само» у вставших по правилу", () => {
    const crop = { x: 0.3, y: 0.6, zoom: 1.5 };
    const photos = [photo("o1", { chapter: "c1", opener: true, crop }), photo("a1", { chapter: "c1" }), photo("a2"), photo("h1", { layout: "half" }), photo("h2", { layout: "half" })];
    const { chapters, gallery } = preview(gift(), photos);
    expect(chapters[0].openerPhoto).toMatchObject({ id: "o1", crop });
    expect(chapters[0].openerPhoto?.url).toContain("size=view");
    expect(chapters[0].photoPages?.map((g) => g.map((p) => `${p.id}${p.auto ? "*" : ""}`))).toEqual([["a1"], ["a2*"], ["h1*", "h2*"]]);
    expect(gallery).toBeNull();
  });

  it("фото главы в оформлении без него печатается после главы — и в превью так же", () => {
    const { chapters } = preview(gift({ interior: "classic" }), [photo("o1", { chapter: "c1", opener: true })]);
    expect(chapters[0].openerPhoto).toBeUndefined();
    expect(chapters[0].photoPages?.flat().map((p) => p.id)).toEqual(["o1"]);
  });

  it("альбом в конце — со своим названием из оглавления, страницами фото", () => {
    const { gallery } = preview(gift({ photoPlacement: "end", tocLines: { "c:__gallery": { title: "Наши дни" } } }), [photo("g1"), photo("g2", { layout: "grid" })]);
    expect(gallery).toMatchObject({ title: "Наши дни", photos: 2 });
    expect(gallery?.pages.flat().map((p) => p.id)).toEqual(["g1", "g2"]);
  });

  it("пустой текущий вопрос — в своей главе, даже если в главе нечего печатать; номера глав по порядку", () => {
    const inChapter = preview(gift(), [], "q2");
    expect(inChapter.chapters[0].entries.map((e) => e.id)).toEqual(["q1", "q2"]);
    const own = preview(gift(), [], "q3");
    expect(own.chapters.map((c) => `${c.number}:${c.key}:${c.title}`)).toEqual(["1:c1:Знакомство", "2:c2:Свадьба"]);
    expect(own.chapters[1].entries.map((e) => e.id)).toEqual(["q3"]);
  });
});

describe("начальная полоса главы в превью", () => {
  const format = formats.a5;
  const px = 480 / format.widthMm;
  const render = (interior: string, openerPhoto?: { id: string; url: string }) => {
    const chapter = {
      key: "c1",
      number: 1,
      title: "Знакомство",
      entries: [{ id: "q1", heading: "Как это было", answer: "Текст.", photos: [], media: [] }],
      ...(openerPhoto ? { openerPhoto: { ...openerPhoto, width: 1200, height: 1600, caption: "", layout: "full" as const } } : {}),
      photoPages: [],
    };
    return renderToStaticMarkup(
      createElement(ChapterPages, {
        chapter,
        contentKey: chapterContentKey(chapter),
        kit: pageKit(getInteriorDesign(interior), format, pxUnits(px), "ru"),
        pageW: 480,
        px,
        bookTitle: "Книга",
        language: "ru",
        t: ru.editor.preview,
        tp: ru.editor.previewPhotos,
        onTarget: () => {},
        pages: 1,
        photoPages: {},
        currentId: "q1",
        selectedId: null,
        interactive: true,
        drag: null,
        scroll: createRef<HTMLDivElement>(),
        setMeasureRef: () => {},
        measure: () => {},
        onPageClick: () => {},
      }),
    );
  };

  it("фото главы не выбрано — пунктирное место по рамке и кнопка «изменить»", () => {
    const m = render("luna");
    expect(m).toContain("data-placeholder");
    expect(m).toContain("+ Фото главы");
    expect(m).toContain("Фото главы «Знакомство» — изменить");
  });

  it("фото главы выбрано — снимок на полосе, места-заглушки нет", () => {
    const m = render("luna", { id: "o1", url: "/api/photos/o1?size=view" });
    expect(m).toContain("/api/photos/o1?size=view");
    expect(m).not.toContain("data-placeholder");
  });

  it("оформление без фото главы — ни места, ни кнопки на начальной полосе", () => {
    const m = render("classic");
    expect(m).not.toContain("data-placeholder");
    expect(m).not.toContain("Фото главы «Знакомство»");
  });
});
