import { describe, expect, it } from "vitest";
import { editorModel } from "@/lib/book/editor-data";
import { editorHeading, editorPhotoUrl, groupByChapter, previewChapters, type EditorQuestion } from "@/lib/book/editor-model";
import { fixtureBook, fixtureVariants } from "./fixtures/books";

/** Модель редактора вопросов: то, что страница books/[id]/questions отдаёт QuestionsEditor, и главы превью. */

const classic = fixtureBook("classic", "a5", "ru").bundle;
const model = editorModel(classic.book, classic.questions, classic.chapters, classic.photos);
const groups = groupByChapter(model.questions);

describe("editorModel", () => {
  it("вопросы книги по порядку, подряд идущие главы — группами", () => {
    expect(model.questions).toHaveLength(classic.questions.length);
    expect(groups.map((g) => `${g.key}:${g.items.length}`)).toEqual(["intro:3", "meet:3", "travel:3", "dreams:3"]);
    expect(groups.flatMap((g) => g.items.map((x) => x.i))).toEqual(model.questions.map((_, i) => i));
  });

  it("все фото книги, снимок обложки тоже (R9): печатается ли он внутри, решает сборка; «на обложке» — только видные на ней", () => {
    expect(model.photos.map((p) => p.id)).toEqual(classic.photos.map((p) => p.id));
    // «Лён» — обложка без фото, оборот «цитата» — тоже: выбранные снимки на них не видны.
    expect(model.photos.every((p) => p.onCover === null)).toBe(true);
    const photobook = fixtureBook("photobook", "a5", "ru").bundle;
    const m = editorModel(photobook.book, photobook.questions, photobook.chapters, photobook.photos);
    const onCover = (name: string) => m.photos.find((p) => photobook.photos.find((x) => x.id === p.id)!.storageKey.endsWith(`/${name}.jpg`))!.onCover;
    // «Мозаика» — четыре места (cover, p5, p7, p13), оборот «полароиды» — три снимка; p14 и p16 выбраны, но не видны.
    expect([onCover("cover"), onCover("p13"), onCover("p14"), onCover("p1"), onCover("p10"), onCover("a")]).toEqual(["cover", "cover", null, "back", "back", null]);
  });

  it("эпиграфы — по ключу главы темы, только у глав, где они есть", () => {
    expect(model.epigraphs.intro).toBe("Эта книга — о нас. О том, что было, что есть и что будет.");
    expect(Object.values(model.epigraphs).every(Boolean)).toBe(true);
  });

  it("заголовки главы и вопроса — в роде автора и адресата", () => {
    const gender = fixtureVariants().find((v) => v.key === "gender")!.bundle;
    const m = editorModel(gender.book, gender.questions, gender.chapters, gender.photos);
    expect(m.questions.some((q) => /[{}[\]|]/.test(q.chapterTitle + q.prompt + q.defaultTitle))).toBe(false);
  });

  it("свой заголовок автора важнее заголовка вопроса, скрытый заголовок — null", () => {
    const base = { hideHeading: false, displayText: null, defaultTitle: "Вопрос" };
    expect(editorHeading(base)).toBe("Вопрос");
    expect(editorHeading({ ...base, displayText: "Свой" })).toBe("Свой");
    expect(editorHeading({ ...base, displayText: "Свой", hideHeading: true })).toBeNull();
  });

  it("адрес фото: с номером поворота, если он есть", () => {
    expect(editorPhotoUrl({ id: "p" })).toBe("/api/photos/p?size=thumb");
    expect(editorPhotoUrl({ id: "p", rev: 2 })).toBe("/api/photos/p?size=thumb&v=2");
  });
});

describe("previewChapters", () => {
  const empty = (q: EditorQuestion) => ({ ...q, answer: "" });

  it("в превью — ответы и вопросы с фото, пустой вопрос без фото не попадает", () => {
    const chapters = previewChapters(groups, model.photos, model.epigraphs, model.questions[0].id);
    const ids = chapters.flatMap((c) => c.entries.map((e) => e.id));
    // q7 — только фото, q10 — без ответа и фото
    expect(ids).toContain(classic.questions[7].id);
    expect(ids).not.toContain(classic.questions[10].id);
    expect(chapters.map((c) => c.number)).toEqual([1, 2, 3, 4]);
  });

  it("текущий вопрос в превью даже пустой, а глава из одних пустых вопросов — нет", () => {
    const blank = groupByChapter(model.questions.map(empty));
    const noPhotos = previewChapters(blank, [], model.epigraphs, model.questions[4].id);
    expect(noPhotos.map((c) => [c.key, c.entries.map((e) => e.id)])).toEqual([["meet", [model.questions[4].id]]]);
    expect(noPhotos[0].number).toBe(1);
  });

  it("фото ответа — с адресом и стилем, эпиграф — по ключу главы", () => {
    const chapters = previewChapters(groups, model.photos, model.epigraphs, model.questions[0].id);
    const entry = chapters[0].entries.find((e) => e.photos.length)!;
    expect(entry.photos[0]).toMatchObject({ url: expect.stringMatching(/^\/api\/photos\/.+\?size=thumb$/), inline: expect.anything() });
    for (const c of chapters) expect(c.epigraph).toBe(model.epigraphs[c.key]);
  });

  it("скрытый заголовок вопроса в превью — null", () => {
    const chapters = previewChapters(groups, model.photos, model.epigraphs, model.questions[0].id);
    expect(chapters[1].entries[0].heading).toBeNull();
    expect(chapters[0].entries[0].heading).toBe(model.questions[0].defaultTitle);
  });
});
