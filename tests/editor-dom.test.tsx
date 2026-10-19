import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ChapterNav, type NavActions } from "@/components/editor/questions/ChapterNav";
import { EmptyEditor } from "@/components/editor/questions/EmptyEditor";
import { SectionFields } from "@/components/editor/questions/SectionFields";
import { QuestionsEditor } from "@/components/editor/QuestionsEditor";
import { MessagesContext } from "@/i18n/context";
import { kk } from "@/i18n/messages/kk";
import { ru } from "@/i18n/messages/ru";
import { getInteriorDesign } from "@/lib/book/interiors";
import { groupByChapter, type EditorBook, type EditorChapter, type EditorQuestion } from "@/lib/book/editor-model";
import type { BookKind } from "@/lib/content/kinds";

// DOM редактора своей книги: пустые состояния и оглавление с действиями (renderToStaticMarkup, как в остальных DOM-тестах).

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }), usePathname: () => "/books/b/questions", useSearchParams: () => new URLSearchParams() }));

const html = (el: ReactElement, messages: typeof ru | typeof kk = ru) => renderToStaticMarkup(createElement(MessagesContext.Provider, { value: messages }, el));

const chapter = (key: string, title = key): EditorChapter => ({ key, title, epigraph: "", own: true });
const section = (id: string, ch: string, answer = "", title = id): EditorQuestion => ({
  id,
  chapter: ch,
  chapterTitle: ch,
  prompt: "",
  hint: null,
  defaultTitle: title,
  displayText: null,
  hideHeading: false,
  answer,
  media: [],
  isCustom: true,
});

const noop = () => {};
const actions: NavActions = { rename: noop, addChapter: noop, deleteChapter: noop, moveChapter: noop, addSection: noop, deleteSection: noop, moveSection: noop, moveSectionToChapter: noop };

function nav(over: { actions?: NavActions | null; current?: string | null; kind?: BookKind } = {}) {
  const chapters = [chapter("a", "Детство"), chapter("b", "Юность"), chapter("c", "")];
  const questions = [section("a1", "a", "Родился в селе.", "Где я родился"), section("a2", "a", "", "Первый класс"), section("b1", "b", "Текст", "")];
  return html(
    <ChapterNav
      groups={groupByChapter(questions, chapters)}
      kind={over.kind ?? "blank"}
      current={over.current === undefined ? "a1" : over.current}
      onPick={noop}
      photos={[]}
      actions={over.actions === undefined ? actions : over.actions}
      busy={false}
      renaming={null}
      onRenaming={noop}
    />,
  );
}

describe("оглавление своей книги", () => {
  it("с правом правки: «Новая глава», действия главы, у текущего раздела — выше, ниже, перенос и удаление", () => {
    const out = nav();
    expect(out).toContain("Новая глава");
    expect(out).toContain("Действия с главой «Детство»");
    expect(out).toContain('aria-label="Выше"');
    expect(out).toContain('aria-label="Ниже"');
    expect(out).toContain("Переместить в главу…");
    expect(out).toContain('aria-label="Удалить раздел"');
    expect(out).toContain("Раздел");
  });

  it("пустая глава: «Пока нет разделов · Добавить раздел» и пометка, что в книгу она не попадёт; она не нумеруется", () => {
    const out = nav({ current: "c1" });
    expect(out).toContain("Пока нет разделов");
    expect(out).toContain("Добавить раздел");
    expect(out).toContain("Пусто — не попадёт в книгу");
    // у главы без названия подпись из словаря, а не пустая строка
    expect(out).toContain("Без названия");
  });

  it("раздел без заголовка и подсказки в оглавлении подписан словами, а не пустой строкой", () => {
    expect(nav({ current: "b1" })).toContain("Раздел без заголовка");
  });

  it("без права правки (сотрудник только смотрит) нет ни одной кнопки оглавления", () => {
    const out = nav({ actions: null });
    for (const label of ["Новая глава", "Действия с главой", 'aria-label="Выше"', 'aria-label="Ниже"', "Переместить в главу", "Удалить раздел", "Удалить главу", "Добавить раздел", "Переименовать"]) expect(out).not.toContain(label);
    // сами главы и разделы видны
    expect(out).toContain("Детство");
    expect(out).toContain("Где я родился");
  });

  it("книга с банком: оглавление без действий над главами, даже если действия переданы", () => {
    const out = nav({ kind: "gift" });
    expect(out).not.toContain("Действия с главой");
    expect(out).not.toContain("Новая глава");
  });

  it("на казахском те же элементы, текст — из словаря", () => {
    const out = html(
      <ChapterNav groups={groupByChapter([section("a1", "a", "x")], [chapter("a", "Балалық шақ"), chapter("b", "Бос")])} kind="blank" current="a1" onPick={noop} photos={[]} actions={actions} busy={false} renaming={null} onRenaming={noop} />,
      kk,
    );
    expect(out).toContain("Жаңа тарау");
    expect(out).toContain("Бос — кітапқа енбейді");
    expect(out).toContain("Әзірге бөлімдер жоқ");
  });
});

describe("пустые состояния", () => {
  const empty = (mode: "noChapters" | "noSections" | "noQuestions", editable = true) => html(<EmptyEditor mode={mode} bookId="b" editable={editable} busy={false} onCreateChapter={noop} onAddSection={noop} />);

  it("нет глав: «Создайте первую главу» с полем названия", () => {
    const out = empty("noChapters");
    expect(out).toContain("Создайте первую главу");
    expect(out).toContain('name="title"');
    expect(out).toContain("Создать главу");
  });

  it("есть главы, нет разделов: «Добавьте первый раздел» с кнопкой", () => {
    const out = empty("noSections");
    expect(out).toContain("Добавьте первый раздел");
    expect(out).toContain("Добавить раздел");
  });

  it("только просмотр: сообщение есть, кнопок создания нет", () => {
    for (const mode of ["noChapters", "noSections"] as const) {
      const out = empty(mode, false);
      expect(out).not.toContain("<button");
      expect(out).not.toContain("<form");
    }
  });

  it("книга без вопросов (не своя): сообщение и ссылка к книге", () => {
    const out = empty("noQuestions");
    expect(out).toContain("В книге пока нет вопросов");
    expect(out).toContain('href="/books/b"');
  });
});

describe("поля раздела своей книги", () => {
  const fields = (q: EditorQuestion, editable = true) => html(<SectionFields question={q} language="ru" typography={getInteriorDesign("classic").type} editable={editable} onPatch={noop} />);

  it("крупный заголовок и свёрнутая «Подсказка для себя»", () => {
    const out = fields(section("s", "a", "", "Детство"));
    expect(out).toContain('value="Детство"');
    expect(out).toContain("Подсказка для себя");
    expect(out).toContain('aria-expanded="false"');
    expect(out).not.toContain("<textarea");
    expect(out).toContain("Без заголовка");
  });

  it("подсказка есть — она раскрыта", () => {
    const out = fields({ ...section("s", "a", "", "Детство"), prompt: "Что помню о доме?" });
    expect(out).toContain('aria-expanded="true"');
    expect(out).toContain("Что помню о доме?");
  });

  it("пустой заголовок: сказано, что в книге будет разделитель, кнопки «Без заголовка» нет", () => {
    const out = fields(section("s", "a", "", ""));
    expect(out).toContain("в книге на этом месте будет разделитель");
    expect(out).not.toContain(">Без заголовка<");
  });

  it("только просмотр: поля нельзя править и кнопки «Без заголовка» нет", () => {
    const out = fields(section("s", "a", "", "Детство"), false);
    expect(out).toContain("readOnly");
    expect(out).not.toContain(">Без заголовка<");
  });
});

describe("редактор целиком не падает на пустых книгах", () => {
  const book = (kind: BookKind): EditorBook => ({
    id: "b",
    format: "a5",
    interior: "classic",
    dedication: "",
    showToc: true,
    photoPlacement: "chapters",
    title: kind === "blank" ? "Моя книга" : "История моей жизни",
    language: "ru",
    names: [],
    theme: kind === "gift" ? "love" : kind === "blank" ? "blank" : "autobiography",
    kind,
    authorGender: "f",
    recipientGender: "m",
  });
  const editor = (kind: BookKind, over: { questions?: EditorQuestion[]; chapters?: EditorChapter[]; editable?: boolean } = {}) =>
    html(<QuestionsEditor book={book(kind)} initialQuestions={over.questions ?? []} chapters={over.chapters ?? []} initialIndex={0} initialPhotos={[]} letters={[]} editable={over.editable ?? true} />);

  it("своя книга без глав: «Создайте первую главу», лист не рисуется", () => {
    const out = editor("blank");
    expect(out).toContain("Создайте первую главу");
    expect(out).not.toContain("<article class=\"relative");
    // мобильная панель — одна кнопка «Новая глава»
    expect(out).toContain("Новая глава");
  });

  it("своя книга: глава есть, разделов нет", () => {
    const out = editor("blank", { chapters: [chapter("a", "Начало")] });
    expect(out).toContain("Добавьте первый раздел");
    expect(out).toContain("Начало");
    expect(out).toContain("Пока нет разделов");
  });

  it("своя книга без разделов, но только просмотр: пустое состояние без кнопок создания", () => {
    const out = editor("blank", { editable: false });
    expect(out).toContain("Создайте первую главу");
    expect(out).not.toContain("Создать главу");
  });

  it("автобиография и подарок без вопросов не падают", () => {
    for (const kind of ["autobiography", "gift"] as const) expect(editor(kind)).toContain("В книге пока нет вопросов");
  });

  it("своя книга с разделом: заголовок раздела — поле, подсказка свёрнута, есть «Раздел», нет «Свой вопрос»", () => {
    const out = editor("blank", { chapters: [chapter("a", "Начало")], questions: [section("s1", "a", "Текст раздела", "Первый")] });
    expect(out).toContain('aria-label="Заголовок раздела в книге"');
    expect(out).toContain("Подсказка для себя");
    expect(out).toContain("Раздел 1 из 1 в главе");
    expect(out).not.toContain("Свой вопрос");
    expect(out).not.toContain("Заголовок в книге</div>");
    expect(out).toContain("1 раздел");
  });

  it("автобиография с вопросом: обычный лист с «Свой вопрос», ответ от первого лица в подсказке поля", () => {
    const q = { ...section("q1", "roots", "", "Где я родился"), prompt: "Где вы родились?", isCustom: false };
    const out = editor("autobiography", { questions: [q] });
    expect(out).toContain("Где вы родились?");
    expect(out).toContain("Свой вопрос");
    expect(out).toContain("Пишите от первого лица");
  });
});
