import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Drawer } from "@/components/editor/questions/Drawer";
import { AnswerToolbar, EditorTopBar, QuestionTicks } from "@/components/editor/questions/Toolbars";
import { MessagesContext } from "@/i18n/context";
import { kk } from "@/i18n/messages/kk";
import { ru } from "@/i18n/messages/ru";

// Полоса редактора и панель инструментов под листом: подписи кнопок, состояние «сохранено», прогресс по главе.

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }), usePathname: () => "/books/b/questions", useSearchParams: () => new URLSearchParams() }));

const html = (el: ReactElement, messages: typeof ru | typeof kk = ru) => renderToStaticMarkup(createElement(MessagesContext.Provider, { value: messages }, el));
const noop = () => {};

function bar(over: Partial<Parameters<typeof EditorTopBar>[0]> = {}, messages: typeof ru | typeof kk = ru) {
  return html(
    <EditorTopBar
      chapterNumber={2}
      chapterTitle="Первое свидание"
      language="ru"
      pages={<span>≈ 24 стр.</span>}
      status="saved"
      progress={<QuestionTicks label="Вопрос 3 из 5" items={[true, true, false, false, false]} current={2} />}
      tocOpen
      previewOpen
      focus={false}
      hasPrev
      hasNext={false}
      onPrev={noop}
      onNext={noop}
      onToc={noop}
      onPreview={noop}
      onFocus={noop}
      {...over}
    />,
    messages,
  );
}

describe("верхняя полоса редактора", () => {
  it("глава, «сохранено», объём, прогресс по главе и шаг к соседним вопросам", () => {
    const out = bar();
    expect(out).toContain("data-editor-bar");
    expect(out).toContain("Глава 2");
    expect(out).toContain("Первое свидание");
    expect(out).toContain("Сохранено");
    expect(out).toContain("≈ 24 стр.");
    expect(out).toContain("Вопрос 3 из 5");
    expect(out).toContain('aria-label="Предыдущий"');
    expect(out).toContain('aria-label="Следующий"');
    // следующего вопроса нет — кнопка выключена, предыдущий есть
    expect(out.match(/<button[^>]*aria-label="Следующий"[^>]*>/)?.[0]).toContain("disabled");
    expect(out.match(/<button[^>]*aria-label="Предыдущий"[^>]*>/)?.[0]).not.toContain("disabled");
  });

  it("подписи кнопок меняются с состоянием столбцов: оглавление и страница книги слева и справа", () => {
    expect(bar({ tocOpen: true, previewOpen: true })).toContain('aria-label="Скрыть оглавление"');
    expect(bar({ tocOpen: true, previewOpen: true })).toContain('aria-label="Скрыть страницу книги"');
    expect(bar({ tocOpen: false, previewOpen: false })).toContain('aria-label="Показать оглавление"');
    expect(bar({ tocOpen: false, previewOpen: false })).toContain('aria-label="Показать страницу книги"');
  });

  it("на телефоне — кнопка «Главы» и «Как в книге»; режим фокуса оставляет «Главы», а «Как в книге» убирает", () => {
    const out = bar();
    expect(out).toContain('aria-label="Главы"');
    expect(out).toContain('aria-label="Как в книге"');
    const focus = bar({ focus: true });
    expect(focus).toContain('aria-label="Главы"');
    expect(focus).not.toContain("Как в книге");
    expect(focus).toContain('aria-label="Выйти из режима фокуса"');
  });

  it("глава без номера (пустая глава своей книги) подписана «не попадёт в книгу»; переименование — кнопкой", () => {
    const out = bar({ chapterNumber: null, chapterTitle: "Начало", onRename: noop });
    expect(out).not.toContain("Глава 2");
    expect(out).toContain("Пусто — не попадёт в книгу");
    expect(out).toContain('title="Переименовать"');
  });

  it("по-казахски: подписи из словаря", () => {
    const out = bar({}, kk);
    expect(out).toContain(`aria-label="${kk.editor.chrome.tocHide}"`);
    expect(out).toContain(`aria-label="${kk.editor.chrome.barAria}"`);
  });

  it("ошибка сохранения видна в полосе", () => {
    expect(bar({ status: "error", error: "Нет сети" })).toContain("Нет сети");
  });
});

describe("прогресс по главе", () => {
  it("подпись и по сегменту на вопрос; в длинной главе — только подпись", () => {
    const out = html(<QuestionTicks label="Вопрос 1 из 3" items={[false, false, false]} current={0} />);
    expect(out).toContain("Вопрос 1 из 3");
    expect(out.match(/rounded-\[2px\]/g)).toHaveLength(3);
    const long = html(<QuestionTicks label="Вопрос 1 из 40" items={Array.from({ length: 40 }, () => false)} current={0} />);
    expect(long).toContain("Вопрос 1 из 40");
    expect(long).not.toContain("rounded-[2px]");
  });
});

describe("панель инструментов под листом", () => {
  const tools = (over: Partial<Parameters<typeof AnswerToolbar>[0]> = {}) =>
    html(<AnswerToolbar dictation={null} editable blank={false} custom={false} words={22} answerPages={0.7} onPhoto={noop} onMedia={noop} onAdd={noop} onRemove={noop} {...over} />);

  it("с правом правки: фото, видео или музыка (data-testid), свой вопрос, слов и доля полосы", () => {
    const out = tools();
    expect(out).toContain('role="group"');
    expect(out).toContain('data-testid="add-media"');
    expect(out).toContain("Фото в ответ");
    expect(out).toContain("Свой вопрос");
    expect(out).toContain("22 слова");
    expect(out).toContain("≈ 0,7 стр.");
    expect(out).not.toContain("Удалить");
  });

  it("свой вопрос можно удалить; у своей книги вместо «Свой вопрос» — «Раздел»", () => {
    expect(tools({ custom: true })).toContain("Удалить");
    expect(tools({ blank: true })).toContain("Раздел");
  });

  it("только чтение: ни одной кнопки, только счётчик", () => {
    const out = tools({ editable: false });
    expect(out).not.toContain("<button");
    expect(out).toContain("22 слова");
  });
});

describe("шторка оглавления", () => {
  it("на телефоне — нижняя шторка с ручкой и названием, на компьютере — слева; закрыть — кнопкой", () => {
    const out = html(
      <Drawer variant="sheet" title="Главы и вопросы" onClose={noop}>
        <p>список</p>
      </Drawer>,
    );
    expect(out).toContain('role="dialog"');
    expect(out).toContain('aria-modal="true"');
    expect(out).toContain('aria-label="Главы и вопросы"');
    expect(out).toContain("rounded-t-[20px]");
    expect(out).toContain('aria-label="Закрыть"');
    expect(out).toContain("список");
  });
});
