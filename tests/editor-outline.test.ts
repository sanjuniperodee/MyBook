import { describe, expect, it } from "vitest";
import { closesOnKey } from "@/components/editor/questions/Drawer";
import { DraftQueue, isGone, localPatch, sendDraft, type ChapterPatch, type Patch } from "@/components/editor/questions/draft";
import {
  applyOutline,
  chapterKeys,
  chapterNumbers,
  chapterStats,
  moveChapter,
  moveSection,
  moveSectionToChapter,
  MutationQueue,
  removeChapter,
  removeSection,
  restoreStructure,
  sectionsPayload,
  selectionAfterRemoval,
  shifted,
  sortByChapters,
  type OutlineState,
  type OutlineView,
} from "@/components/editor/questions/outline";
import { computeStats } from "@/modules/authoring/domain/stats";
import { fixtureBook, fixtureVariants } from "./fixtures/books";
import { groupByChapter, sectionIndex, sectionLabel, type EditorChapter, type EditorQuestion } from "@/lib/book/editor-model";

/** Оглавление своей книги в редакторе: чистая модель операций, откат, очереди и черновик (без React и сети). */

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

const state = (): OutlineState => ({
  chapters: [chapter("a"), chapter("b"), chapter("c")],
  questions: [section("a1", "a", "текст"), section("a2", "a"), section("b1", "b", "ещё текст"), section("c1", "c")],
});
const ids = (s: OutlineState) => s.questions.map((q) => q.id);

describe("оглавление: перестановки", () => {
  it("shifted двигает на место и не выходит за края", () => {
    expect(shifted([1, 2, 3], 0, 1)).toEqual([2, 1, 3]);
    expect(shifted([1, 2, 3], 2, -1)).toEqual([1, 3, 2]);
    expect(shifted([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
    expect(shifted([1, 2, 3], 2, 1)).toEqual([1, 2, 3]);
  });

  it("глава вниз уносит свои разделы, разделы остаются подряд по главам", () => {
    const s = moveChapter(state(), "a", 1);
    expect(s.chapters.map((c) => c.key)).toEqual(["b", "a", "c"]);
    expect(ids(s)).toEqual(["b1", "a1", "a2", "c1"]);
    expect(chapterKeys(s)).toEqual(["b", "a", "c"]);
  });

  it("раздел выше и ниже — только внутри своей главы", () => {
    expect(ids(moveSection(state(), "a2", -1))).toEqual(["a2", "a1", "b1", "c1"]);
    expect(ids(moveSection(state(), "a1", 1))).toEqual(["a2", "a1", "b1", "c1"]);
    expect(ids(moveSection(state(), "b1", -1))).toEqual(["a1", "a2", "b1", "c1"]);
  });

  it("раздел в другую главу встаёт в её конец, в пустую главу — единственным", () => {
    const s = moveSectionToChapter(state(), "a1", "b");
    expect(sectionsPayload(s)).toEqual([
      { id: "a2", chapter: "a" },
      { id: "b1", chapter: "b" },
      { id: "a1", chapter: "b" },
      { id: "c1", chapter: "c" },
    ]);
    expect(s.questions.find((q) => q.id === "a1")?.chapterTitle).toBe("b");
    const empty = moveSectionToChapter({ ...state(), chapters: [...state().chapters, chapter("d")] }, "c1", "d");
    expect(empty.questions.at(-1)).toMatchObject({ id: "c1", chapter: "d" });
    // та же глава и чужая глава — без изменений
    expect(moveSectionToChapter(state(), "a1", "a")).toEqual(state());
    expect(moveSectionToChapter(state(), "a1", "zzz")).toEqual(state());
  });

  it("удаление главы убирает её разделы, удаление раздела — только его", () => {
    expect(ids(removeChapter(state(), "a"))).toEqual(["b1", "c1"]);
    expect(removeChapter(state(), "a").chapters.map((c) => c.key)).toEqual(["b", "c"]);
    expect(ids(removeSection(state(), "a1"))).toEqual(["a2", "b1", "c1"]);
  });

  it("разделы потерянной главы идут в конце и остаются в своём порядке", () => {
    const s = sortByChapters([chapter("a")], [section("x", "lost"), section("a1", "a"), section("y", "lost")]);
    expect(s.map((q) => q.id)).toEqual(["a1", "x", "y"]);
  });
});

describe("оглавление: ответ сервера — истина", () => {
  const server: OutlineView = {
    chapters: [
      { key: "b", title: "Новое название", epigraph: "эпиграф", position: 0 },
      { key: "a", title: "a", epigraph: "", position: 1 },
    ],
    sections: [
      { id: "b1", chapter: "b", position: 0 },
      { id: "a2", chapter: "a", position: 1 },
      { id: "a1", chapter: "a", position: 2 },
    ],
  };

  it("порядок, главы и названия — с сервера, тексты разделов — клиентские (несохранённое не теряется)", () => {
    const local = state();
    local.questions[0] = { ...local.questions[0], answer: "набрано только что" };
    const { state: next, unknown } = applyOutline(local, server);
    expect(unknown).toBe(0);
    expect(next.chapters.map((c) => [c.key, c.title, c.epigraph])).toEqual([
      ["b", "Новое название", "эпиграф"],
      ["a", "a", ""],
    ]);
    expect(ids(next)).toEqual(["b1", "a2", "a1"]);
    expect(next.questions.find((q) => q.id === "a1")?.answer).toBe("набрано только что");
    expect(next.questions.find((q) => q.id === "b1")?.chapterTitle).toBe("Новое название");
    // глава c и раздел c1 удалены на сервере
    expect(next.chapters.some((c) => c.key === "c")).toBe(false);
  });

  it("раздел, которого клиент не знает, считается и просит перечитать страницу; свежесозданный подставляется", () => {
    const withNew: OutlineView = { ...server, sections: [...server.sections, { id: "n1", chapter: "a", position: 3 }] };
    expect(applyOutline(state(), withNew).unknown).toBe(1);
    const r = applyOutline(state(), withNew, [section("n1", "a")]);
    expect(r.unknown).toBe(0);
    expect(ids(r.state)).toEqual(["b1", "a2", "a1", "n1"]);
  });

  it("откат возвращает порядок и состав, но не стирает то, что набрано за время запроса", () => {
    const before = state();
    const optimistic = moveChapter(before, "a", 1);
    const typed: OutlineState = { ...optimistic, questions: optimistic.questions.map((q) => (q.id === "a1" ? { ...q, answer: "новое" } : q)) };
    const restored = restoreStructure(typed, before);
    expect(ids(restored)).toEqual(ids(before));
    expect(restored.chapters.map((c) => c.key)).toEqual(["a", "b", "c"]);
    expect(restored.questions.find((q) => q.id === "a1")?.answer).toBe("новое");
    // откат удаления возвращает разделы
    const removed = removeChapter(before, "b");
    expect(ids(restoreStructure(removed, before))).toEqual(ids(before));
  });
});

describe("оглавление: выбор раздела и сведения для диалога", () => {
  const list = state().questions;

  it("после удаления открытого раздела — следующий, иначе предыдущий, иначе ничего", () => {
    expect(selectionAfterRemoval(list, new Set(["a1"]), "a1")).toBe("a2");
    expect(selectionAfterRemoval(list, new Set(["c1"]), "c1")).toBe("b1");
    expect(selectionAfterRemoval(list, new Set(["a1", "a2"]), "a1")).toBe("b1");
    expect(selectionAfterRemoval(list, new Set(list.map((q) => q.id)), "a1")).toBeNull();
    // удалён не открытый раздел — открытый остаётся
    expect(selectionAfterRemoval(list, new Set(["c1"]), "a2")).toBe("a2");
  });

  it("сведения о главе: разделов, слов и фото (фото останутся в общей галерее)", () => {
    const qs = [section("a1", "a", "раз два три"), section("a2", "a", "четыре"), section("b1", "b", "пять")];
    const photos = [{ questionId: "a1" }, { questionId: "b1" }, { questionId: null }];
    expect(chapterStats(qs, photos, "a")).toEqual({ sections: 2, words: 4, photos: 1 });
    expect(chapterStats(qs, photos, "zzz")).toEqual({ sections: 0, words: 0, photos: 0 });
  });

  it("номера глав своей книги — как в печати: пустые главы не нумеруются, фото считается содержимым", () => {
    const s = state();
    const groups = groupByChapter(s.questions, s.chapters);
    expect([...chapterNumbers(groups, [], true)]).toEqual([
      ["a", 1],
      ["b", 2],
      ["c", null],
    ]);
    expect(chapterNumbers(groups, [{ questionId: "c1" }], true).get("c")).toBe(3);
    // у книг с банком — просто по порядку
    expect([...chapterNumbers(groups, [], false).values()]).toEqual([1, 2, 3]);
  });

  it("подпись раздела никогда не пустая: заголовок, затем подсказка, затем «без заголовка»", () => {
    const q = { hideHeading: false, displayText: null, defaultTitle: "", prompt: "" };
    expect(sectionLabel(q, "blank", "Раздел без заголовка")).toBe("Раздел без заголовка");
    expect(sectionLabel({ ...q, prompt: "Подсказка" }, "blank", "?")).toBe("Подсказка");
    expect(sectionLabel({ ...q, defaultTitle: "Детство", prompt: "Подсказка" }, "blank", "?")).toBe("Детство");
  });

  it("раздел по адресу: ?s=id важнее ?q=N, мусор и пустая книга не падают", () => {
    const all = ["x", "y", "z"];
    expect(sectionIndex(all, "z", "1")).toBe(2);
    expect(sectionIndex(all, "нет такого", "2")).toBe(1);
    expect(sectionIndex(all, undefined, "99")).toBe(2);
    expect(sectionIndex(all, ["z"], ["2"])).toBe(0);
    expect(sectionIndex(all, undefined, "abc")).toBe(0);
    expect(sectionIndex(all, undefined, "-3")).toBe(0);
    expect(sectionIndex([], "z", "5")).toBe(0);
  });
});

describe("очередь мутаций оглавления", () => {
  const tick = () => new Promise((r) => setTimeout(r, 0));

  it("задачи идут по одной в порядке вызова, даже если первая медленная", async () => {
    const q = new MutationQueue();
    const log: string[] = [];
    const slow = q.run(async () => {
      await tick();
      await tick();
      log.push("1");
    });
    const fast = q.run(async () => void log.push("2"));
    await Promise.all([slow, fast]);
    expect(log).toEqual(["1", "2"]);
    await tick();
    expect(q.size).toBe(0);
  });

  it("сбой одной задачи не останавливает остальные и доходит до вызвавшего", async () => {
    const q = new MutationQueue();
    const failed = q.run(async () => Promise.reject(new Error("409")));
    const ok = q.run(async () => "дальше");
    await expect(failed).rejects.toThrow("409");
    await expect(ok).resolves.toBe("дальше");
    await tick();
    expect(q.size).toBe(0);
  });
});

describe("черновик: заголовок и подсказка раздела, главы, 404", () => {
  it("title раздела ложится в defaultTitle, остальное — как есть", () => {
    expect(localPatch({ title: "Детство", prompt: "О чём?", answer: "Текст" })).toEqual({ defaultTitle: "Детство", prompt: "О чём?", answer: "Текст" });
    expect(localPatch({ answer: "Текст" })).toEqual({ answer: "Текст" });
    // пустой заголовок — это «без заголовка», а не «не менялся»
    expect(localPatch({ title: "" })).toEqual({ defaultTitle: "" });
  });

  it("правки заголовка и ответа одного раздела сливаются в один PATCH", async () => {
    const q = new DraftQueue();
    q.set("s", { title: "А" });
    q.set("s", { answer: "текст" });
    q.set("s", { title: "Аб" });
    const sent: [string, Patch][] = [];
    await sendDraft(q, async (id, p) => void sent.push([id, p]));
    expect(sent).toEqual([["s", { title: "Аб", answer: "текст" }]]);
  });

  const gone = (code: string) => Object.assign(new Error("404"), { code, status: 404 });

  it("раздел удалён в другом окне: правка выбрасывается, остальные уходят, повторно не возвращается", async () => {
    const q = new DraftQueue();
    q.set("a", { answer: "1" });
    q.set("dead", { answer: "2" });
    q.set("c", { answer: "3" });
    const sent: string[] = [];
    const lost: string[] = [];
    await sendDraft(
      q,
      async (id) => {
        if (id === "dead") throw gone("questionNotFound");
        sent.push(id);
      },
      lost,
    );
    expect(sent).toEqual(["a", "c"]);
    expect(lost).toEqual(["dead"]);
    expect(q.size).toBe(0);
  });

  it("глава удалена в другом окне: переименование выбрасывается так же", async () => {
    const q = new DraftQueue<ChapterPatch>();
    q.set("k", { title: "Новое" });
    const lost: string[] = [];
    await sendDraft(q, async () => Promise.reject(gone("chapterNotFound")), lost);
    expect(lost).toEqual(["k"]);
    expect(q.size).toBe(0);
  });

  it("обычная ошибка (сеть, 500) по-прежнему возвращает упавшую правку и неотправленные в очередь", async () => {
    const q = new DraftQueue();
    q.set("a", { answer: "1" });
    q.set("b", { answer: "2" });
    q.set("c", { answer: "3" });
    const lost: string[] = [];
    await expect(sendDraft(q, async (id) => (id === "b" ? Promise.reject(new Error("сеть")) : undefined), lost)).rejects.toThrow("сеть");
    expect(lost).toEqual([]);
    expect(q.take().map(([id]) => id)).toEqual(["b", "c"]);
  });

  it("404 посередине пачки не блокирует правки после него, а обычная ошибка после него возвращает только свои", async () => {
    const q = new DraftQueue();
    for (const id of ["a", "dead", "c", "d"]) q.set(id, { answer: id });
    const lost: string[] = [];
    await expect(
      sendDraft(
        q,
        async (id) => {
          if (id === "dead") throw gone("questionNotFound");
          if (id === "c") throw new Error("сеть");
        },
        lost,
      ),
    ).rejects.toThrow("сеть");
    expect(lost).toEqual(["dead"]);
    expect(q.take().map(([id]) => id)).toEqual(["c", "d"]);
  });

  it("isGone узнаёт только коды «нет раздела» и «нет главы»", () => {
    expect(isGone(gone("questionNotFound"))).toBe(true);
    expect(isGone(gone("chapterNotFound"))).toBe(true);
    expect(isGone(gone("bookNotFound"))).toBe(false);
    expect(isGone(gone("outlineOutdated"))).toBe(false);
    expect(isGone(new Error("x"))).toBe(false);
    expect(isGone(null)).toBe(false);
  });
});

describe("панель оглавления: Escape", () => {
  const ev = (over: Partial<Pick<KeyboardEvent, "key" | "defaultPrevented" | "target">>) => ({ key: "Escape", defaultPrevented: false, target: null, ...over });

  it("Escape закрывает панель, если его никто не обработал", () => {
    expect(closesOnKey(ev({}))).toBe(true);
    expect(closesOnKey(ev({ key: "Enter" }))).toBe(false);
  });

  it("Escape из поля переименования (оно гасит событие) и из любого поля ввода панель не закрывает", () => {
    expect(closesOnKey(ev({ defaultPrevented: true }))).toBe(false);
    const target = (tagName: string) => ({ tagName }) as unknown as EventTarget;
    expect(closesOnKey(ev({ target: target("INPUT") }))).toBe(false);
    expect(closesOnKey(ev({ target: target("TEXTAREA") }))).toBe(false);
    expect(closesOnKey(ev({ target: target("DIV") }))).toBe(true);
  });
});

describe("статистика книги: пустые главы", () => {
  it("своя книга: главы без текста и фото считаются — о них предупредит проверка перед заказом", () => {
    const b = fixtureVariants().find((v) => v.key === "blank")!.bundle;
    const stats = computeStats(b.book, b.questions, b.chapters, b.photos, b.letters ?? []);
    const empty = b.chapters.filter((c) => !b.questions.some((q) => q.chapter === c.key && q.answer.trim()) && !b.photos.some((p) => b.questions.some((q) => q.chapter === c.key && q.id === p.questionId)));
    expect(empty.length).toBeGreaterThan(0);
    expect(stats.emptyChapters).toBe(empty.length);
  });

  it("книга с банком: пустых глав нет по определению", () => {
    const b = fixtureBook("classic", "a5", "ru").bundle;
    expect(computeStats(b.book, b.questions, b.chapters, b.photos, b.letters ?? []).emptyChapters).toBe(0);
  });
});
