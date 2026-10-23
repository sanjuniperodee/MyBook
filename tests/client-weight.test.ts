import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { importGraph, type ImportEdge } from "../scripts/refactor/import-graph.mjs";

/**
 * Тяжёлые серверные модули не попадают в браузер редактора: каталог тем со всеми вопросами (lib/content/themes)
 * и сборка книги с текстами темы и словаря (book-content) стоили редактору ~22 KiB gz (регрессия V4: оценка
 * объёма собирала книгу buildBookContent, а editor-model тянул темы ради серверного editorModel).
 */
const { edges } = importGraph(".");
const runtime = new Map<string, string[]>();
for (const e of edges as ImportEdge[]) if (!e.typeOnly && !e.dynamic) runtime.set(e.from, [...(runtime.get(e.from) ?? []), e.to]);

/** Модуль серверных действий: браузер получает только ссылки на них, его импорты в клиентский бандл не идут. */
const serverActions = (f: string) => /^\s*["']use server["']/.test(readFileSync(f, "utf8"));

/** Модули, которые попадут в браузер вместе с entry (статические импорты, без «use server»). */
function reach(entry: string) {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length) {
    const f = queue.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    if (f !== entry && serverActions(f)) continue;
    queue.push(...(runtime.get(f) ?? []));
  }
  return seen;
}

describe("вес клиентских модулей редактора", () => {
  it.each(["src/components/editor/QuestionsEditor.tsx", "src/components/editor/preview/PagePreview.tsx"])("%s не тянет каталог тем и серверную сборку книги", (entry) => {
    const heavy = [...reach(entry)].filter((f) => f.startsWith("src/lib/content/themes") || f === "src/lib/book/book-content.ts" || f === "src/lib/book/editor-data.ts");
    expect(heavy).toEqual([]);
  });
});

describe("вес клиентских модулей: виды книг", () => {
  it("lib/content/kinds (вид книги, прогресс, лимиты) не тянет банки вопросов и каталог тем — его импортирует редактор", () => {
    const heavy = [...reach("src/lib/content/kinds.ts")].filter((f) => f !== "src/lib/content/kinds.ts");
    expect(heavy).toEqual([]);
  });

  it("имена на обложке (cover-names) — без каталога обложек и тем", () => {
    expect([...reach("src/lib/book/cover-names.ts")].sort()).toEqual(["src/lib/book/cover-names.ts", "src/lib/content/kinds.ts"]);
  });
});

describe("вес клиентских модулей: банки вопросов", () => {
  /** Банки вопросов всех тем (ru и kk) и каталог тем — сотни строк текста, браузеру они не нужны. */
  const bank = (f: string) => /^src\/lib\/content\/(themes|love|parent|friend|teacher|autobiography|kk\/)/.test(f);

  it.each(["src/components/editor/QuestionsEditor.tsx", "src/components/editor/preview/PagePreview.tsx", "src/components/editor/questions/ChapterNav.tsx", "src/components/editor/questions/SectionFields.tsx", "src/components/editor/questions/EmptyEditor.tsx", "src/app/(app)/books/new/NewBookWizard.tsx"])("%s не тянет банки вопросов (вид книги — только из kinds.ts)", (entry) => {
    const seen = [...reach(entry)];
    expect(seen.filter(bank)).toEqual([]);
    // Сам граф живой: если клиентский модуль перестанет импортировать kinds.ts, проверка выше не значит ничего.
    if (entry === "src/components/editor/QuestionsEditor.tsx") expect(seen).toContain("src/lib/content/kinds.ts");
  });
});

describe("вес клиентских модулей: обложки (F3)", () => {
  it("мастер новой книги рисует обложки тем по метаданным — каталог шаблонов с рисунками в браузер не идёт", () => {
    const catalog = [...reach("src/app/(app)/books/new/NewBookWizard.tsx")].filter((f) => f === "src/lib/book/covers/index.ts" || f.startsWith("src/lib/book/covers/client-photo/"));
    expect(catalog).toEqual([]);
  });
});

describe("вес клиентских модулей: словари (F2)", () => {
  // Клиентские модули — «use client» и всё, что они статически импортируют. Словарь страницы грузится
  // лениво (i18n/dictionary/* через next/dynamic), поэтому в статическом графе его быть не должно вовсе.
  const clientEntries = (edges as ImportEdge[]).map((e) => e.from).filter((f, i, all) => all.indexOf(f) === i && /^\s*["']use client["']/.test(readFileSync(f, "utf8")));
  const lazyDictionary = (f: string) => f.startsWith("src/i18n/dictionary/");
  const heavy = (f: string) => f === "src/i18n/messages/index.ts" || /^src\/i18n\/messages\/(ru|kk)\/(index|client|mail|legal|api)\.ts$/.test(f);

  it("ни один клиентский модуль статически не тянет словари целиком, письма, юридические тексты и ошибки API", () => {
    const leaks = clientEntries.filter((f) => !lazyDictionary(f)).flatMap((entry) => [...reach(entry)].filter(heavy).map((f) => `${entry} → ${f}`));
    expect(leaks).toEqual([]);
  });

  it("словарь страницы — только своего языка: i18n/dictionary/ru не тянет kk и наоборот", () => {
    expect([...reach("src/i18n/dictionary/ru.tsx")].filter((f) => f.startsWith("src/i18n/messages/kk/"))).toEqual([]);
    expect([...reach("src/i18n/dictionary/kk.tsx")].filter((f) => f.startsWith("src/i18n/messages/ru/"))).toEqual([]);
  });
});
