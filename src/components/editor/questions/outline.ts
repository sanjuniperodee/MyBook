import { countWords } from "@/lib/book/layout";
import type { ChapterGroup, EditorChapter, EditorPhoto, EditorQuestion } from "@/lib/book/editor-model";

/**
 * Оглавление своей книги в редакторе: главы и разделы как чистые функции (без React и сети).
 * Состояние — главы в их порядке и разделы подряд по главам; сервер присылает актуальное оглавление после
 * каждой операции, и клиент принимает его как истину (applyOutline).
 */

/** Оглавление, как его отдаёт сервер (authoring: Outline). */
export interface OutlineView {
  chapters: { key: string; title: string; epigraph: string; position: number }[];
  sections: { id: string; chapter: string; position: number }[];
}

export interface OutlineState {
  chapters: EditorChapter[];
  questions: EditorQuestion[];
}

/** Сколько ждать до следующей операции: мутации оглавления идут по одной, в порядке вызова. */
export class MutationQueue {
  private tail: Promise<unknown> = Promise.resolve();
  private active = 0;

  /** Выполнить задачу после всех предыдущих; сбой одной не останавливает очередь. */
  run<T>(job: () => Promise<T>): Promise<T> {
    this.active++;
    const result = this.tail.then(job, job);
    this.tail = result.then(
      () => void this.active--,
      () => void this.active--,
    );
    return result;
  }

  /** Сколько задач ещё не завершено (в том числе выполняемая). */
  get size() {
    return this.active;
  }
}

/** Разделы в порядке глав (внутри главы порядок сохраняется); разделы потерянной главы — в конце. */
export function sortByChapters(chapters: readonly Pick<EditorChapter, "key">[], questions: EditorQuestion[]): EditorQuestion[] {
  const rank = new Map(chapters.map((c, i) => [c.key, i]));
  return questions
    .map((q, i) => ({ q, i, r: rank.get(q.chapter) ?? Number.MAX_SAFE_INTEGER }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.q);
}

const withTitles = (chapters: EditorChapter[], questions: EditorQuestion[]) => {
  const title = new Map(chapters.map((c) => [c.key, c.title]));
  return questions.map((q) => (title.has(q.chapter) && title.get(q.chapter) !== q.chapterTitle ? { ...q, chapterTitle: title.get(q.chapter)! } : q));
};

/**
 * Принять оглавление сервера. Тексты разделов остаются клиентскими (там могут быть несохранённые правки), меняются
 * порядок, главы и названия глав. fresh — разделы, созданные этой операцией. unknown — сколько разделов оглавления
 * клиенту неизвестно (их создали в другом окне): тогда нужно перечитать страницу.
 */
export function applyOutline(state: OutlineState, outline: OutlineView, fresh: EditorQuestion[] = []): { state: OutlineState; unknown: number } {
  const known = new Map(state.chapters.map((c) => [c.key, c]));
  const chapters = [...outline.chapters]
    .sort((a, b) => a.position - b.position)
    .map((c): EditorChapter => ({ ...known.get(c.key), key: c.key, title: c.title, epigraph: c.epigraph, own: true }));
  const byId = new Map([...state.questions, ...fresh].map((q) => [q.id, q]));
  let unknown = 0;
  const questions: EditorQuestion[] = [];
  for (const s of [...outline.sections].sort((a, b) => a.position - b.position)) {
    const q = byId.get(s.id);
    if (!q) unknown++;
    else questions.push({ ...q, chapter: s.chapter });
  }
  return { state: { chapters, questions: withTitles(chapters, questions) }, unknown };
}

/**
 * Вернуть порядок и состав, как они были до неудавшейся операции, не трогая то, что пользователь набрал за это время:
 * разделы и главы берутся из текущего состояния, если они там ещё есть.
 */
export function restoreStructure(current: OutlineState, before: OutlineState): OutlineState {
  const now = new Map(current.questions.map((q) => [q.id, q]));
  const nowChapters = new Map(current.chapters.map((c) => [c.key, c]));
  const chapters = before.chapters.map((c) => nowChapters.get(c.key) ?? c);
  const questions = before.questions.map((q) => ({ ...(now.get(q.id) ?? q), chapter: q.chapter }));
  return { chapters, questions: withTitles(chapters, questions) };
}

/** Сдвинуть элемент на delta мест; за пределами списка — без изменений. */
export function shifted<T>(list: readonly T[], from: number, delta: number): T[] {
  const to = from + delta;
  if (from < 0 || to < 0 || to >= list.length || delta === 0) return [...list];
  const out = [...list];
  out.splice(to, 0, ...out.splice(from, 1));
  return out;
}

export function moveChapter(state: OutlineState, key: string, delta: -1 | 1): OutlineState {
  const at = state.chapters.findIndex((c) => c.key === key);
  const chapters = shifted(state.chapters, at, delta);
  return { chapters, questions: sortByChapters(chapters, state.questions) };
}

export function removeChapter(state: OutlineState, key: string): OutlineState {
  return { chapters: state.chapters.filter((c) => c.key !== key), questions: state.questions.filter((q) => q.chapter !== key) };
}

export function removeSection(state: OutlineState, id: string): OutlineState {
  return { ...state, questions: state.questions.filter((q) => q.id !== id) };
}

/** Раздел выше или ниже в своей главе. */
export function moveSection(state: OutlineState, id: string, delta: -1 | 1): OutlineState {
  const q = state.questions.find((x) => x.id === id);
  if (!q) return state;
  const sibling = state.questions.filter((x) => x.chapter === q.chapter);
  const order = shifted(sibling, sibling.indexOf(q), delta);
  let k = 0;
  return { ...state, questions: state.questions.map((x) => (x.chapter === q.chapter ? order[k++] : x)) };
}

/** Раздел в конец другой главы. */
export function moveSectionToChapter(state: OutlineState, id: string, chapterKey: string): OutlineState {
  const q = state.questions.find((x) => x.id === id);
  const chapter = state.chapters.find((c) => c.key === chapterKey);
  if (!q || !chapter || q.chapter === chapterKey) return state;
  const moved: EditorQuestion = { ...q, chapter: chapterKey, chapterTitle: chapter.title };
  return { ...state, questions: sortByChapters(state.chapters, [...state.questions.filter((x) => x.id !== id), moved]) };
}

/** Тело PUT /questions/order: разделы в их порядке с главами. */
export function sectionsPayload(state: OutlineState) {
  return state.questions.map((q) => ({ id: q.id, chapter: q.chapter }));
}

/** Тело PUT /chapters/order. */
export function chapterKeys(state: OutlineState) {
  return state.chapters.map((c) => c.key);
}

/** Раздел, на который перейти после удаления разделов removed: следующий, иначе предыдущий, иначе никакой. */
export function selectionAfterRemoval(questions: readonly Pick<EditorQuestion, "id">[], removed: ReadonlySet<string>, currentId: string | null): string | null {
  if (currentId !== null && !removed.has(currentId)) return currentId;
  const at = currentId === null ? 0 : questions.findIndex((q) => q.id === currentId);
  const after = questions.slice(Math.max(at, 0)).find((q) => !removed.has(q.id));
  const before = [...questions.slice(0, Math.max(at, 0))].reverse().find((q) => !removed.has(q.id));
  return (after ?? before)?.id ?? null;
}

/** Что пропадёт вместе с главой: разделов, слов текста и фото (фото останутся в общей галерее). */
export function chapterStats(questions: readonly EditorQuestion[], photos: readonly Pick<EditorPhoto, "questionId">[], key: string) {
  const own = questions.filter((q) => q.chapter === key);
  const ids = new Set(own.map((q) => q.id));
  return { sections: own.length, words: own.reduce((n, q) => n + countWords(q.answer), 0), photos: photos.filter((p) => p.questionId && ids.has(p.questionId)).length };
}

/**
 * Номера глав в оглавлении и вверху листа. Как в печати (layout: number = место среди печатаемых глав): у своей книги
 * главы без текста и фото не нумеруются (null — «пусто, в книгу не попадёт»), у остальных — по порядку.
 */
export function chapterNumbers(groups: readonly ChapterGroup[], photos: readonly Pick<EditorPhoto, "questionId">[], outline: boolean): Map<string, number | null> {
  const withPhotos = new Set(photos.flatMap((p) => (p.questionId ? [p.questionId] : [])));
  const out = new Map<string, number | null>();
  let n = 0;
  groups.forEach((g, i) => {
    if (!outline) out.set(g.key, i + 1);
    else out.set(g.key, g.items.some(({ q }) => q.answer.trim() || withPhotos.has(q.id)) ? ++n : null);
  });
  return out;
}

/** Раздел своей книги из ответа сервера (свежесозданный: текста ещё нет). */
export function newSection(row: { id: string; chapter: string; prompt?: string; title?: string }, chapterTitle: string): EditorQuestion {
  return { id: row.id, chapter: row.chapter, chapterTitle, prompt: row.prompt ?? "", hint: null, defaultTitle: row.title ?? "", displayText: null, hideHeading: false, answer: "", isCustom: true };
}
