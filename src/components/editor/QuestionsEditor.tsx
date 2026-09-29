"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, ChevronLeft, ChevronRight, Eye, EyeOff, List, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { PagePreview } from "./PagePreview";
import { SaveIndicator } from "@/components/SaveIndicator";
import { useAutosave } from "@/hooks/useAutosave";
import { apiFetch } from "@/lib/client-api";
import { getFormat } from "@/lib/book/formats";
import { getTypography } from "@/lib/book/fonts";
import { countWords, estimateAnswerPages, estimatePages, pluralRu, type BookContent, type ContentChapter } from "@/lib/book/layout";
import { printablePageCount } from "@/lib/book/formats";
import { cn } from "@/lib/utils";

export interface EditorQuestion {
  id: string;
  chapter: string;
  chapterTitle: string;
  prompt: string;
  hint: string | null;
  defaultTitle: string;
  displayText: string | null;
  hideHeading: boolean;
  answer: string;
  isCustom: boolean;
}

type Patch = Partial<Pick<EditorQuestion, "answer" | "displayText" | "hideHeading">>;

export interface EditorBook {
  id: string;
  format: string;
  typography: string;
  dedication: string;
  showToc: boolean;
  photoPlacement: "chapters" | "end";
  title: string;
}

export function QuestionsEditor({
  book,
  initialQuestions,
  initialIndex,
  photoLayouts,
  editable,
}: {
  book: EditorBook;
  initialQuestions: EditorQuestion[];
  initialIndex: number;
  photoLayouts: ("full" | "bleed" | "half")[];
  editable: boolean;
}) {
  const [questions, setQuestions] = useState(initialQuestions);
  const [index, setIndex] = useState(Math.min(Math.max(initialIndex, 0), initialQuestions.length - 1));
  const [drawer, setDrawer] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [adding, setAdding] = useState(false);
  const [showPreviewMobile, setShowPreviewMobile] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const dirty = useRef(new Map<string, Patch>());

  const format = getFormat(book.format);
  const typography = getTypography(book.typography);
  const q = questions[index];

  const { status, error, schedule, flush } = useAutosave<null>(async () => {
    const batch = [...dirty.current.entries()];
    dirty.current.clear();
    for (const [id, patch] of batch) {
      try {
        await apiFetch(`/api/books/${book.id}/questions/${id}`, { method: "PATCH", json: patch });
      } catch (e) {
        dirty.current.set(id, { ...patch, ...dirty.current.get(id) });
        throw e;
      }
    }
  }, 800);

  const patchQuestion = useCallback(
    (id: string, patch: Patch) => {
      if (!editable) return;
      setQuestions((qs) => qs.map((x) => (x.id === id ? { ...x, ...patch } : x)));
      dirty.current.set(id, { ...dirty.current.get(id), ...patch });
      schedule(null);
    },
    [editable, schedule],
  );

  const goTo = useCallback(
    (i: number) => {
      const next = Math.min(Math.max(i, 0), questions.length - 1);
      void flush();
      setIndex(next);
      setEditingTitle(false);
      setAdding(false);
      setDrawer(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [flush, questions.length],
  );

  // URL ?q= синхронизируется без перезагрузки страницы
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("q", String(index + 1));
    window.history.replaceState(null, "", url);
  }, [index]);

  // автоматическая высота поля ответа
  useEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, 260)}px`;
  }, [q?.answer, index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        goTo(index + 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goTo, index]);

  const heading = (x: EditorQuestion) => (x.hideHeading ? null : x.displayText ?? x.defaultTitle);

  // оценка объёма книги по текущему состоянию
  const pages = useMemo(() => {
    const chapters: ContentChapter[] = [];
    for (const x of questions) {
      if (!x.answer.trim()) continue;
      let ch = chapters[chapters.length - 1];
      if (!ch || ch.key !== x.chapter) {
        ch = { key: x.chapter, number: chapters.length + 1, title: x.chapterTitle, items: [], photos: [] };
        chapters.push(ch);
      }
      ch.items.push({ id: x.id, heading: heading(x), answer: x.answer });
    }
    const photos = photoLayouts.map((layout, i) => ({ id: String(i), caption: "", layout, width: 1, height: 1, storageKey: "", thumbKey: "" }));
    const content: BookContent = {
      format,
      typography,
      title: book.title,
      subtitle: "",
      authorName: "",
      recipientName: "",
      dedication: book.dedication,
      showToc: book.showToc,
      chapters,
      galleryPhotos: book.photoPlacement === "end" || !chapters.length ? photos : [],
      year: 2000,
    };
    if (content.galleryPhotos.length === 0 && chapters.length)
      photos.forEach((p, i) => chapters[Math.min(chapters.length - 1, Math.floor((i * chapters.length) / photos.length))].photos.push(p));
    const raw = chapters.length ? estimatePages(content) : 0;
    return { raw, printed: raw ? printablePageCount(raw) : 0 };
  }, [questions, photoLayouts, format, typography, book]);

  const answeredCount = questions.filter((x) => x.answer.trim()).length;
  const chapterQuestions = questions.filter((x) => x.chapter === q.chapter);
  const chapterIndex = chapterQuestions.findIndex((x) => x.id === q.id);
  const chapterNumber = [...new Set(questions.map((x) => x.chapter))].indexOf(q.chapter) + 1;
  const answerPages = q.answer.trim() ? estimateAnswerPages(heading(q), q.answer, format, typography) : 0;

  const addQuestion = async (prompt: string) => {
    const res = await apiFetch<{ question: { id: string; chapter: string; prompt: string } }>(`/api/books/${book.id}/questions`, {
      method: "POST",
      json: { afterId: q.id, prompt },
    });
    const created: EditorQuestion = {
      id: res.question.id,
      chapter: q.chapter,
      chapterTitle: q.chapterTitle,
      prompt,
      hint: null,
      defaultTitle: prompt,
      displayText: null,
      hideHeading: false,
      answer: "",
      isCustom: true,
    };
    setQuestions((qs) => [...qs.slice(0, index + 1), created, ...qs.slice(index + 1)]);
    setIndex(index + 1);
    setAdding(false);
    setTimeout(() => textarea.current?.focus(), 50);
  };

  const removeQuestion = async () => {
    if (!q.isCustom || !confirm("Удалить этот вопрос вместе с ответом?")) return;
    await flush();
    await apiFetch(`/api/books/${book.id}/questions/${q.id}`, { method: "DELETE" });
    dirty.current.delete(q.id);
    setQuestions((qs) => qs.filter((x) => x.id !== q.id));
    setIndex((i) => Math.max(0, i - 1));
  };

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 sm:px-6">
      {/* Верхняя панель */}
      <div className="sticky top-16 z-30 -mx-4 flex flex-wrap items-center gap-2 border-b border-line/60 bg-paper/90 px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6">
        <Link href={`/books/${book.id}`} className="btn btn-outline btn-sm">
          <ChevronLeft className="size-4" /> <span className="hidden sm:inline">На главную</span>
        </Link>
        <button className="btn btn-outline btn-sm" onClick={() => setDrawer(true)}>
          <List className="size-4" /> Все вопросы
        </button>
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1.5 text-sm font-medium text-amber-900 sm:flex" title="Оценка объёма готовой книги">
            <BookOpen className="size-4" /> {pages.raw} {pluralRu(pages.raw, "стр.", "стр.", "стр.")} заполнено
          </span>
          <span className="text-sm text-muted tabular-nums">
            {index + 1} / {questions.length}
          </span>
        </div>
      </div>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)] xl:gap-16">
        {/* Редактор */}
        <section className="min-w-0">
          <div className="text-sm text-muted">
            Глава {chapterNumber} · {q.chapterTitle} · вопрос {chapterIndex + 1} из {chapterQuestions.length}
          </div>
          <h1 className="mt-3 font-serif text-3xl leading-tight font-medium sm:text-[40px]">{q.prompt}</h1>
          {q.hint ? <p className="mt-3 text-[15px] text-muted">{q.hint}</p> : null}

          {/* Заголовок в книге */}
          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line pb-4 text-sm">
            <span className="text-muted">Заголовок в книге:</span>
            {editingTitle ? (
              <input
                autoFocus
                className="min-w-0 flex-1 border-b border-wine/40 bg-transparent py-1 text-[15px] outline-none"
                value={q.displayText ?? q.defaultTitle}
                maxLength={200}
                onChange={(e) => patchQuestion(q.id, { displayText: e.target.value })}
                onBlur={() => setEditingTitle(false)}
                onKeyDown={(e) => e.key === "Enter" && setEditingTitle(false)}
              />
            ) : (
              <button
                className={cn("flex min-w-0 items-center gap-1.5 text-left text-[15px]", q.hideHeading && "text-muted line-through")}
                onClick={() => editable && !q.hideHeading && setEditingTitle(true)}
                disabled={!editable}
              >
                <span className="truncate">{q.displayText ?? q.defaultTitle}</span>
                {editable && !q.hideHeading ? <Pencil className="size-3.5 shrink-0 text-muted" /> : null}
              </button>
            )}
            {q.displayText !== null && q.displayText !== q.defaultTitle && !editingTitle ? (
              <button className="text-xs text-wine hover:underline" onClick={() => patchQuestion(q.id, { displayText: null })}>
                вернуть исходный
              </button>
            ) : null}
            <label className="ml-auto flex cursor-pointer items-center gap-2 text-muted">
              <input type="checkbox" className="size-4 accent-wine" checked={q.hideHeading} onChange={(e) => patchQuestion(q.id, { hideHeading: e.target.checked })} disabled={!editable} />
              {q.hideHeading ? <EyeOff className="size-4" /> : <Eye className="size-4" />} Скрыть
            </label>
          </div>

          {/* Ответ */}
          <label htmlFor="answer" className="mt-8 block text-sm text-muted">
            Ваш ответ
          </label>
          <textarea
            id="answer"
            ref={textarea}
            value={q.answer}
            onChange={(e) => patchQuestion(q.id, { answer: e.target.value })}
            readOnly={!editable}
            placeholder={editable ? "Пишите так, как рассказали бы вслух. Новый абзац — клавиша Enter." : ""}
            className="mt-3 block min-h-[260px] w-full resize-none bg-transparent text-lg leading-relaxed outline-none placeholder:text-muted/60 sm:text-xl"
            style={{ fontFamily: cssFontBody(typography.body) }}
            maxLength={40000}
          />

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-sm text-muted">
            <span>
              {countWords(q.answer)} {pluralRu(countWords(q.answer), "слово", "слова", "слов")}
              {answerPages > 0 ? ` · ≈ ${answerPages < 0.95 ? `${Math.max(0.1, Math.round(answerPages * 10) / 10)}`.replace(".", ",") : Math.round(answerPages * 10) / 10} стр.` : ""}
            </span>
            <SaveIndicator status={status} error={error} />
          </div>

          {/* Действия с вопросом */}
          {editable ? (
            <div className="mt-6 flex flex-wrap gap-2">
              {adding ? (
                <AddQuestion onAdd={addQuestion} onCancel={() => setAdding(false)} />
              ) : (
                <button className="btn btn-ghost btn-sm text-muted" onClick={() => setAdding(true)}>
                  <Plus className="size-4" /> Добавить свой вопрос
                </button>
              )}
              {q.isCustom && !adding ? (
                <button className="btn btn-ghost btn-sm text-red-700" onClick={removeQuestion}>
                  <Trash2 className="size-4" /> Удалить вопрос
                </button>
              ) : null}
            </div>
          ) : null}

          <div className="mt-10 flex items-center justify-between">
            <button className="btn btn-ghost" onClick={() => goTo(index - 1)} disabled={index === 0}>
              <ChevronLeft className="size-5" /> Назад
            </button>
            {index < questions.length - 1 ? (
              <button className="btn btn-dark" onClick={() => goTo(index + 1)} title="Ctrl + Enter">
                Далее <ChevronRight className="size-5" />
              </button>
            ) : (
              <Link href={`/books/${book.id}`} className="btn btn-primary" onClick={() => void flush()}>
                Готово
              </Link>
            )}
          </div>

          <button className="btn btn-outline mt-8 w-full lg:hidden" onClick={() => setShowPreviewMobile((v) => !v)}>
            <Eye className="size-4" /> {showPreviewMobile ? "Скрыть превью страницы" : "Как это будет выглядеть в книге"}
          </button>
        </section>

        {/* Превью */}
        <aside className={cn("lg:block", showPreviewMobile ? "block" : "hidden")}>
          <div className="sticky top-36">
            <div className="rounded-3xl border border-line/70 bg-cream/50 p-5 sm:p-8">
              <div className="mb-4 flex items-center justify-between text-sm">
                <span className="font-medium">Превью страницы</span>
                <span className="text-muted">{format.short} · {typography.name}</span>
              </div>
              <PagePreview format={format} typography={typography} heading={heading(q)} answer={q.answer} />
              <p className="mt-4 text-center text-xs text-muted">
                Книга: ≈ {pages.printed} стр. · {answeredCount} из {questions.length} ответов
              </p>
            </div>
          </div>
        </aside>
      </div>

      {drawer ? <QuestionsDrawer questions={questions} current={index} onPick={goTo} onClose={() => setDrawer(false)} /> : null}
    </div>
  );
}

function cssFontBody(key: string) {
  return `var(--font-${key}), Georgia, serif`;
}

function AddQuestion({ onAdd, onCancel }: { onAdd: (prompt: string) => Promise<void>; onCancel: () => void }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <form
      className="w-full rounded-2xl border border-line bg-white p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        try {
          await onAdd(value.trim());
        } catch (e) {
          setErr((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="label">Ваш вопрос (он же станет заголовком в книге)</label>
      <input autoFocus className="input" value={value} onChange={(e) => setValue(e.target.value)} maxLength={200} minLength={3} required placeholder="Например: Наша поездка в Бурабай" />
      {err ? <p className="mt-2 text-sm text-red-700">{err}</p> : null}
      <div className="mt-3 flex gap-2">
        <button className="btn btn-primary btn-sm" disabled={busy}>Добавить после текущего</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Отмена</button>
      </div>
    </form>
  );
}

function QuestionsDrawer({ questions, current, onPick, onClose }: { questions: EditorQuestion[]; current: number; onPick: (i: number) => void; onClose: () => void }) {
  const [filter, setFilter] = useState<"all" | "empty" | "done">("all");
  const [search, setSearch] = useState("");
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    list.current?.querySelector("[data-current=true]")?.scrollIntoView({ block: "center" });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const s = search.trim().toLowerCase();
  const groups: { chapter: string; title: string; items: { q: EditorQuestion; i: number }[] }[] = [];
  questions.forEach((q, i) => {
    const done = !!q.answer.trim();
    if (filter === "empty" && done) return;
    if (filter === "done" && !done) return;
    if (s && !q.prompt.toLowerCase().includes(s) && !q.answer.toLowerCase().includes(s)) return;
    let g = groups[groups.length - 1];
    if (!g || g.chapter !== q.chapter) groups.push((g = { chapter: q.chapter, title: q.chapterTitle, items: [] }));
    g.items.push({ q, i });
  });

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative ml-auto flex h-full w-full max-w-md flex-col bg-paper shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-lg font-semibold">Все вопросы</h2>
          <button className="btn btn-ghost btn-sm size-9 px-0" onClick={onClose} aria-label="Закрыть">
            <X className="size-5" />
          </button>
        </div>
        <div className="space-y-3 border-b border-line px-5 py-4">
          <div className="relative">
            <Search className="absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" />
            <input className="input h-10 pl-10" placeholder="Поиск по вопросам и ответам" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="flex gap-1.5">
            {(
              [
                ["all", "Все"],
                ["empty", "Без ответа"],
                ["done", "С ответом"],
              ] as const
            ).map(([k, label]) => (
              <button key={k} onClick={() => setFilter(k)} className={cn("rounded-full px-3 py-1.5 text-sm", filter === k ? "bg-ink text-white" : "bg-cream text-ink-soft hover:bg-line")}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div ref={list} className="flex-1 overflow-y-auto px-3 py-3">
          {groups.length === 0 ? <p className="px-2 py-10 text-center text-sm text-muted">Ничего не найдено</p> : null}
          {groups.map((g, gi) => (
            <div key={`${g.chapter}-${gi}`} className="mb-4">
              <div className="px-2 py-2 text-xs font-semibold tracking-wide text-muted uppercase">{g.title}</div>
              {g.items.map(({ q, i }) => (
                <button
                  key={q.id}
                  data-current={i === current}
                  onClick={() => onPick(i)}
                  className={cn("flex w-full items-start gap-3 rounded-xl px-2 py-2.5 text-left text-sm transition", i === current ? "bg-wine/8 text-wine" : "hover:bg-ink/5")}
                >
                  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", q.answer.trim() ? "bg-emerald-500" : "bg-line")} />
                  <span className="flex-1 leading-snug">{q.prompt}</span>
                  <span className="text-xs text-muted tabular-nums">{i + 1}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
