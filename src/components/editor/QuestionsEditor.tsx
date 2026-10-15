"use client";

import { confirmDialog, toast, toastError } from "@/components/ui/overlays";
import { Link, useLocale, useMessages } from "@/i18n/client";
import { localeMeta, locales } from "@/i18n/config";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ChevronDown,
  Eye,
  EyeOff,
  ImagePlus,
  Lightbulb,
  ListTree,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  Plus,
  Trash2,
} from "lucide-react";
import { PagePreview } from "./preview/PagePreview";
import { PhotoInspector } from "./PhotoInspector";
import { AddQuestion } from "./questions/AddQuestion";
import { ChapterNav } from "./questions/ChapterNav";
import { Drawer } from "./questions/Drawer";
import { MobileBar } from "./questions/MobileBar";
import { PhotoPicker } from "./questions/PhotoPicker";
import { ProofBar, ProofTextarea, type ProofHandle } from "./proofread/ProofTextarea";
import { useProofread } from "./proofread/useProofread";
import { normalizeStyle } from "@/lib/book/inline-photo";
import type { InlinePhotoStyle } from "@/lib/book/inline-photo";
import { SaveIndicator } from "@/components/SaveIndicator";
import { useAutosave } from "@/hooks/useAutosave";
import { useDictation } from "@/hooks/useDictation";
import { apiFetch } from "@/lib/client-api";
import { getFormat } from "@/lib/book/formats";
import { cssFont } from "@/lib/book/fonts";
import { editorEstimate } from "@/lib/book/editor-estimate";
import { editorHeading, editorPhotoUrl, groupByChapter, previewChapters, type EditorBook, type EditorPhoto, type EditorQuestion } from "@/lib/book/editor-model";
import { getInteriorDesign } from "@/lib/book/interiors";
import { estimateAnswerPages, textMetrics } from "@/lib/book/estimate";
import { countWords, type LetterLike } from "@/lib/book/layout";
import { cn } from "@/lib/class-names";

type Patch = Partial<Pick<EditorQuestion, "answer" | "displayText" | "hideHeading">>;

export function QuestionsEditor({
  book,
  epigraphs = {},
  initialQuestions,
  initialIndex,
  initialPhotos,
  letters,
  editable,
  proofreadAi = false,
}: {
  book: EditorBook;
  /** Эпиграфы глав (по ключу главы) — для начальных полос в превью. */
  epigraphs?: Record<string, string>;
  initialQuestions: EditorQuestion[];
  initialIndex: number;
  initialPhotos: EditorPhoto[];
  /** Одобренные письма близких: идут в книгу последней главой и входят в оценку объёма. */
  letters: LetterLike[];
  editable: boolean;
  /** AI-корректор подключён в «Интеграциях» — показываем кнопку «Проверить грамотность». */
  proofreadAi?: boolean;
}) {
  const [questions, setQuestions] = useState(initialQuestions);
  const [photos, setPhotos] = useState(initialPhotos);
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const [index, setIndex] = useState(Math.min(Math.max(initialIndex, 0), initialQuestions.length - 1));
  const [drawer, setDrawer] = useState(false);
  const [adding, setAdding] = useState(false);
  const [showTips, setShowTips] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [focus, setFocus] = useState(false);
  const t = useMessages().editor;
  // Диктуют обычно на языке книги.
  const [lang, setLang] = useState<string>(localeMeta[book.language].speech);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const proof = useRef<ProofHandle>(null);
  const dirty = useRef(new Map<string, Patch>());
  const ui = useLocale();

  const format = getFormat(book.format);
  const design = getInteriorDesign(book.interior);
  const typography = design.type;
  const q = questions[index];
  const proofread = useProofread({ bookId: book.id, docId: q.id, text: q.answer, language: book.language, ui, names: book.names ?? [], enabled: editable });

  useEffect(() => {
    try {
      // Предпочтение режима фокуса хранится в браузере
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFocus(localStorage.getItem("mb-focus") === "1");
    } catch {}
  }, []);
  const toggleFocus = () =>
    setFocus((v) => {
      try {
        localStorage.setItem("mb-focus", v ? "0" : "1");
      } catch {}
      return !v;
    });

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

  /** Дописывает текст к актуальному значению ответа (без устаревших замыканий). */
  const appendText = useCallback(
    (id: string, text: string) => {
      if (!editable || !text) return;
      setQuestions((qs) =>
        qs.map((x) => {
          if (x.id !== id) return x;
          const sep = !x.answer || /\s$/.test(x.answer) ? "" : " ";
          const chunk = x.answer.trim() ? text : text.charAt(0).toUpperCase() + text.slice(1);
          const answer = x.answer + sep + chunk;
          dirty.current.set(id, { ...dirty.current.get(id), answer });
          return { ...x, answer };
        }),
      );
      schedule(null);
    },
    [editable, schedule],
  );

  const dictationTarget = useRef<string | null>(null);
  const dictation = useDictation((text) => {
    if (dictationTarget.current) appendText(dictationTarget.current, text);
  });
  const toggleDictation = () => {
    if (dictation.listening) {
      dictation.stop();
      return;
    }
    dictationTarget.current = q.id;
    dictation.start(lang);
  };

  const goTo = useCallback(
    (i: number) => {
      const next = Math.min(Math.max(i, 0), questions.length - 1);
      void flush();
      dictation.stop();
      setIndex(next);
      setAdding(false);
      setDrawer(false);
      setShowTips(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [flush, questions.length, dictation],
  );

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("q", String(index + 1));
    window.history.replaceState(null, "", url);
  }, [index]);

  useEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, 220)}px`;
  }, [q?.answer, index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === "Enter") {
        e.preventDefault();
        goTo(index + (e.shiftKey ? -1 : 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goTo, index]);

  const groups = useMemo(() => groupByChapter(questions), [questions]);

  const pages = useMemo(() => editorEstimate(book, questions, photos, letters), [book, questions, photos, letters]);

  const answeredCount = questions.filter((x) => x.answer.trim()).length;
  // Вехи: маленький праздник, когда книга растёт (не срабатывает при открытии редактора).
  const milestoneRef = useRef<number | null>(null);
  useEffect(() => {
    const prev = milestoneRef.current;
    milestoneRef.current = answeredCount;
    if (prev === null || answeredCount <= prev) return;
    const m = t.milestones.find(([n]) => prev < n && answeredCount >= n);
    if (m) toast(m[1], "info");
  }, [answeredCount, t]);
  const group = groups.find((g) => g.key === q.chapter)!;
  const posInChapter = group.items.findIndex((x) => x.q.id === q.id);
  const chapterNumber = groups.indexOf(group) + 1;
  const words = countWords(q.answer);
  const qPhotos = photos.filter((p) => p.questionId === q.id);
  const answerPages = q.answer.trim() || qPhotos.length ? estimateAnswerPages(editorHeading(q), q.answer, qPhotos, textMetrics(format, design)) : 0;
  const selectedPhoto = qPhotos.find((p) => p.id === selectedPhotoId) ?? null;

  const inlineTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const updateInline = (id: string, patch: Partial<InlinePhotoStyle>) => {
    if (!editable) return;
    const cur = photos.find((p) => p.id === id);
    if (!cur) return;
    const inline = normalizeStyle({ ...normalizeStyle(cur.inline), ...patch });
    setPhotos((ps) => ps.map((p) => (p.id === id ? { ...p, inline } : p)));
    clearTimeout(inlineTimers.current.get(id));
    inlineTimers.current.set(
      id,
      setTimeout(() => {
        apiFetch(`/api/books/${book.id}/photos/${id}`, { method: "PATCH", json: { inline } }).catch((e) => toastError(e));
      }, 350),
    );
  };
  const rotatePhoto = async (id: string) => {
    try {
      const res = await apiFetch<{ photo: EditorPhoto }>(`/api/books/${book.id}/photos/${id}/rotate`, { method: "POST" });
      setPhotos((ps) => ps.map((p) => (p.id === id ? { ...p, width: res.photo.width, height: res.photo.height, inline: res.photo.inline, rev: (p.rev ?? 0) + 1 } : p)));
    } catch (e) {
      toastError(e);
    }
  };
  const previewProps = {
    language: book.language,
    format,
    design,
    bookTitle: book.title,
    chapters: previewChapters(groups, photos, epigraphs, q.id),
    currentId: q.id,
    selectedId: selectedPhoto?.id ?? null,
    onSelect: setSelectedPhotoId,
    onChange: editable ? updateInline : undefined,
  };

  const patchPhoto = async (id: string, patch: Partial<Pick<EditorPhoto, "questionId" | "caption">>) => {
    const prev = photos;
    setPhotos((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    try {
      await apiFetch(`/api/books/${book.id}/photos/${id}`, { method: "PATCH", json: patch });
    } catch (e) {
      setPhotos(prev);
      toastError(e);
    }
  };
  const captionTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const editCaption = (id: string, caption: string) => {
    setPhotos((ps) => ps.map((p) => (p.id === id ? { ...p, caption } : p)));
    clearTimeout(captionTimers.current.get(id));
    captionTimers.current.set(
      id,
      setTimeout(() => void apiFetch(`/api/books/${book.id}/photos/${id}`, { method: "PATCH", json: { caption } }).catch(() => {}), 700),
    );
  };
  const prev = questions[index - 1];
  const next = questions[index + 1];

  const addQuestion = async (prompt: string) => {
    const res = await apiFetch<{ question: { id: string } }>(`/api/books/${book.id}/questions`, { method: "POST", json: { afterId: q.id, prompt } });
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
    if (!q.isCustom || !(await confirmDialog({ title: t.deleteTitle, text: t.deleteText, confirmLabel: t.delete, danger: true }))) return;
    await flush();
    await apiFetch(`/api/books/${book.id}/questions/${q.id}`, { method: "DELETE" });
    dirty.current.delete(q.id);
    setQuestions((qs) => qs.filter((x) => x.id !== q.id));
    setIndex((i) => Math.max(0, i - 1));
  };

  /** Диктовка: кнопка + язык. На компьютере — в панели под ответом, на телефоне — в нижней панели (compact). */
  const dictateControl = (className: string, compact: boolean) =>
    editable && dictation.supported ? (
      <div className={cn("flex items-center rounded-full border border-line bg-white", className)}>
        <button
          className={cn("flex h-11 items-center gap-1.5 rounded-full text-sm sm:h-9", compact ? "px-3" : "px-3.5", dictation.listening ? "bg-wine text-white" : "hover:bg-cream")}
          onClick={toggleDictation}
          title={dictation.listening ? t.stop : t.dictateTitle}
          aria-label={dictation.listening ? t.stop : t.dictateTitle}
        >
          {dictation.listening ? <MicOff className="size-5 sm:size-4" /> : <Mic className="size-5 sm:size-4" />}
          {compact ? (dictation.listening ? t.stop : null) : dictation.listening ? t.stop : t.dictate}
        </button>
        <select
          value={lang}
          onChange={(e) => {
            const l = e.target.value;
            setLang(l);
            if (dictation.listening) dictation.start(l);
          }}
          className="h-11 rounded-full bg-transparent pr-1.5 pl-0.5 text-xs text-muted outline-none sm:h-9 sm:pr-2 sm:pl-1"
          aria-label={t.dictationLang}
        >
          {locales.map((l) => (
            <option key={l} value={localeMeta[l].speech}>
              {localeMeta[l].short}
            </option>
          ))}
        </select>
      </div>
    ) : null;

  const sidebar = <ChapterNav groups={groups} current={index} onPick={goTo} />;

  return (
    <div className={cn("mx-auto px-4 pt-4 pb-28 sm:px-6 sm:py-6 lg:py-8", focus ? "max-w-3xl" : "max-w-7xl")}>
      <div className={cn("gap-8 xl:gap-10", !focus && "lg:grid lg:grid-cols-[250px_minmax(0,1fr)] xl:grid-cols-[250px_minmax(0,1fr)_280px]")}>
        {/* Навигация по главам */}
        {!focus ? (
          <aside className="hidden lg:block">
            <div className="sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto pr-1 pb-6">{sidebar}</div>
          </aside>
        ) : null}

        {/* Лист */}
        <section className="min-w-0">
          <div className="mb-3 flex items-center gap-2 sm:mb-4">
            <button className={cn("btn btn-outline btn-sm shrink-0", !focus && "lg:hidden")} onClick={() => setDrawer(true)}>
              <ListTree className="size-4" /> {t.chapters}
            </button>
            <div className="min-w-0 flex-1 truncate text-sm text-muted">
              <span className="text-ink">{t.chapter(chapterNumber)}</span> · <span lang={book.language}>{q.chapterTitle}</span>
            </div>
            <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-rose/70 px-3 py-1.5 text-xs font-medium text-wine" title={t.pagesEstimate}>
              <BookOpen className="size-3.5" /> {t.pagesShort(pages.printed || 0)}
            </span>
            {!focus ? (
              <button className="btn btn-ghost btn-sm size-9 px-0 xl:hidden" onClick={() => setShowPreview((v) => !v)} title={t.showPage}>
                <Eye className="size-4" />
              </button>
            ) : null}
            <button className="btn btn-ghost btn-sm size-9 px-0 max-lg:hidden" onClick={toggleFocus} title={focus ? t.focusOff : t.focusOn}>
              {focus ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            </button>
          </div>

          <article className="relative overflow-hidden rounded-[28px] border border-line/70 bg-white shadow-soft">
            {/* Прогресс по главе — тонкая линия сверху */}
            <div className="absolute inset-x-0 top-0 h-0.5 bg-cream" aria-hidden>
              <div className="h-full bg-wine/70 transition-[width] duration-500 ease-out" style={{ width: `${((posInChapter + 1) / group.items.length) * 100}%` }} />
            </div>
            <div className="flex items-center justify-between border-b border-line/60 px-4 py-2.5 text-xs text-muted sm:px-10 sm:py-3">
              <span>
                {t.questionOf(posInChapter + 1, group.items.length)}
              </span>
              <SaveIndicator status={status} error={error} className="text-xs" />
            </div>

            <div className="px-4 pt-5 pb-4 sm:px-10 sm:pt-10 sm:pb-6">
              {/* key — чтобы при переходе к другому вопросу формулировка мягко проявлялась */}
              <h1 key={q.id} lang={book.language} className="enter font-serif text-2xl leading-tight font-medium text-ink sm:text-[38px]">
                {q.prompt}
              </h1>
              {q.hint ? (
                <p key={`h-${q.id}`} lang={book.language} style={{ "--i": 1 } as React.CSSProperties} className="enter mt-3 text-[15px] leading-relaxed text-muted">
                  {q.hint}
                </p>
              ) : null}
              <button className="mt-4 inline-flex items-center gap-1.5 text-sm text-wine hover:underline" onClick={() => setShowTips((v) => !v)}>
                <Lightbulb className="size-4" /> {t.whereToStart}
                <ChevronDown className={cn("size-3.5 transition", showTips && "rotate-180")} />
              </button>
              {showTips ? (
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  {t.tips.map((tip, i) => (
                    <li key={tip} style={{ "--i": i } as React.CSSProperties} className="enter rounded-2xl bg-cream/70 px-4 py-3 text-sm leading-snug text-ink-soft">
                      {tip}
                    </li>
                  ))}
                </ul>
              ) : null}

              {/* Заголовок, как он будет в книге */}
              <div className="mt-5 flex items-start gap-3 rounded-2xl border border-dashed border-line px-4 py-3 sm:mt-8">
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] tracking-wider text-muted uppercase">{t.headingInBook}</div>
                  <input
                    value={q.hideHeading ? "" : (q.displayText ?? q.defaultTitle)}
                    placeholder={q.hideHeading ? t.headingHidden : q.defaultTitle}
                    lang={book.language}
                    onChange={(e) => patchQuestion(q.id, { displayText: e.target.value })}
                    onBlur={() => q.displayText !== null && !q.displayText.trim() && patchQuestion(q.id, { displayText: null })}
                    disabled={!editable || q.hideHeading}
                    maxLength={200}
                    className="fs-keep mt-0.5 w-full bg-transparent text-lg outline-none disabled:text-muted"
                    style={{ fontFamily: cssFont(typography.heading), fontStyle: typography.headingItalic ? "italic" : "normal" }}
                  />
                </div>
                {q.displayText !== null && q.displayText !== q.defaultTitle && !q.hideHeading ? (
                  <button className="mt-3.5 shrink-0 py-1 text-xs text-wine hover:underline" onClick={() => patchQuestion(q.id, { displayText: null })}>
                    {t.headingReset}
                  </button>
                ) : null}
                <button
                  className="-mt-1 shrink-0 rounded-lg p-3 text-muted hover:bg-cream hover:text-ink sm:mt-1.5 sm:p-1.5"
                  onClick={() => patchQuestion(q.id, { hideHeading: !q.hideHeading })}
                  disabled={!editable}
                  title={q.hideHeading ? t.headingShow : t.headingHide}
                >
                  {q.hideHeading ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>

              <ProofTextarea
                ref={textarea}
                handle={proof}
                id="answer"
                value={q.answer}
                onValue={(answer) => patchQuestion(q.id, { answer })}
                issues={proofread.issues}
                onApply={(issue, replacement) => patchQuestion(q.id, { answer: proofread.apply(issue, replacement) })}
                onSkip={proofread.ignore}
                onAddWord={proofread.addWord}
                readOnly={!editable}
                placeholder={editable ? t.answerPlaceholder : ""}
                aria-label={t.answerAria}
                lang={book.language}
                wrapperClassName="mt-5 sm:mt-6"
                textClassName="text-[17px] leading-[1.7] sm:text-[19px] sm:leading-[1.75]"
                className="fs-keep min-h-[220px] scroll-mb-40 resize-none outline-none placeholder:text-muted/60 sm:min-h-[280px]"
                style={{ fontFamily: cssFont(typography.body) }}
                maxLength={40000}
              />
              {editable ? (
                <ProofBar
                  issues={proofread.issues}
                  hasText={!!q.answer.trim()}
                  safeCount={proofread.safeCount}
                  onFixAll={() => {
                    const fixed = proofread.fixAll();
                    if (fixed !== q.answer) {
                      patchQuestion(q.id, { answer: fixed });
                      toast(t.proofread.fixed(proofread.safeCount), "info");
                    }
                  }}
                  onOpen={(issue) => proof.current?.open(issue)}
                  ai={proofreadAi}
                  aiState={proofread.aiState}
                  onAi={() => {
                    void proofread.runAi().catch((e) => toastError(e));
                  }}
                />
              ) : null}
              {dictation.listening ? (
                <div className="mt-2 rounded-2xl bg-rose/50 px-4 py-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-wine">
                    <span className="relative flex size-2.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-wine opacity-60" />
                      <span className="relative inline-flex size-2.5 rounded-full bg-wine" />
                    </span>
                    {t.listening}
                  </div>
                  {dictation.interim ? <p className="mt-1.5 text-lg text-ink-soft italic">{dictation.interim}…</p> : null}
                  {dictation.silent ? <p className="mt-1.5 text-xs text-muted">{t.silent}</p> : null}
                </div>
              ) : null}
            </div>

            {qPhotos.length ? (
              <div className="space-y-3 px-4 pb-5 sm:px-10 sm:pb-6">
                <div className="flex flex-wrap items-center gap-2">
                  {qPhotos.map((p) => {
                    const st = normalizeStyle(p.inline);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelectedPhotoId(selectedPhotoId === p.id ? null : p.id)}
                        className={cn(
                          "group relative size-16 overflow-hidden rounded-xl border-2 transition",
                          selectedPhotoId === p.id ? "border-wine shadow-md" : "border-transparent ring-1 ring-line hover:ring-ink/30",
                        )}
                        aria-pressed={selectedPhotoId === p.id}
                        aria-label={t.photoAria(p.caption)}
                        data-testid="inline-photo-thumb"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={editorPhotoUrl(p)} alt="" className="size-full object-cover" />
                        <span className="absolute inset-x-0 bottom-0 bg-ink/60 py-0.5 text-center text-[10px] text-white tabular-nums">{st.width}%</span>
                      </button>
                    );
                  })}
                  <span className="text-xs text-muted">{selectedPhoto ? "" : t.photoHint}</span>
                </div>
                {selectedPhoto ? (
                  <PhotoInspector
                    photo={{ ...selectedPhoto, url: editorPhotoUrl(selectedPhoto) }}
                    answer={q.answer}
                    editable={editable}
                    onChange={(patch) => updateInline(selectedPhoto.id, patch)}
                    onCaption={(c) => editCaption(selectedPhoto.id, c)}
                    onRotate={() => rotatePhoto(selectedPhoto.id)}
                    onRemove={() => {
                      setSelectedPhotoId(null);
                      void patchPhoto(selectedPhoto.id, { questionId: null });
                    }}
                    onClose={() => setSelectedPhotoId(null)}
                  />
                ) : null}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line/60 px-3 py-2 sm:px-8 sm:py-3">
              {dictateControl("max-lg:hidden", false)}
              {editable ? (
                <button className="btn btn-ghost btn-sm text-muted max-lg:hidden" onClick={() => setPicker(true)}>
                  <ImagePlus className="size-4" /> {t.photoInAnswer}
                </button>
              ) : null}
              {editable ? (
                <button className="btn btn-ghost btn-sm text-muted" onClick={() => setAdding((v) => !v)}>
                  <Plus className="size-4" /> {t.ownQuestion}
                </button>
              ) : null}
              {editable && q.isCustom ? (
                <button className="btn btn-ghost btn-sm text-red-700" onClick={removeQuestion}>
                  <Trash2 className="size-4" /> {t.delete}
                </button>
              ) : null}
              <span className="ml-auto text-xs text-muted tabular-nums">
                {t.words(words)}
                {answerPages > 0 ? t.answerPages((Math.round(Math.max(answerPages, 0.1) * 10) / 10).toLocaleString("ru-RU")) : ""}
              </span>
            </div>
            {dictation.error ? <p className="px-4 pb-3 text-sm text-red-700 sm:px-10">{dictation.error}</p> : null}
            {adding ? (
              <div className="border-t border-line/60 p-4 sm:px-8">
                <AddQuestion onAdd={addQuestion} onCancel={() => setAdding(false)} />
              </div>
            ) : null}
          </article>

          {/* Переход между вопросами */}
          <div className="mt-5 grid grid-cols-2 gap-3 max-lg:hidden">
            <button
              onClick={() => goTo(index - 1)}
              disabled={!prev}
              className="group flex min-w-0 items-center gap-3 rounded-2xl border border-line bg-white/60 p-4 text-left transition hover:border-ink/30 disabled:opacity-40"
              title="Ctrl + Shift + Enter"
            >
              <ArrowLeft className="size-5 shrink-0 text-muted transition group-hover:-translate-x-0.5" />
              <span className="min-w-0">
                <span className="block text-xs text-muted">{t.prev}</span>
                <span className="block truncate text-sm">{prev?.prompt ?? "—"}</span>
              </span>
            </button>
            {next ? (
              <button
                onClick={() => goTo(index + 1)}
                className="group flex min-w-0 items-center justify-end gap-3 rounded-2xl bg-ink p-4 text-right text-white transition hover:bg-ink-soft"
                title="Ctrl + Enter"
              >
                <span className="min-w-0">
                  <span className="block text-xs text-white/60">{q.answer.trim() ? t.next : t.skip}</span>
                  <span className="block truncate text-sm">{next.prompt}</span>
                </span>
                <ArrowRight className="size-5 shrink-0 transition group-hover:translate-x-0.5" />
              </button>
            ) : (
              <Link href={`/books/${book.id}/preview`} onClick={() => void flush()} className="flex items-center justify-end gap-3 rounded-2xl bg-wine p-4 text-white">
                <span className="text-sm font-medium">{t.toPreview}</span>
                <ArrowRight className="size-5" />
              </Link>
            )}
          </div>

          {showPreview && !focus ? (
            <div className="mt-6 xl:hidden">
              <PagePreview {...previewProps} className="max-h-[75dvh] overflow-y-auto rounded-3xl bg-cream/60 p-4" />
            </div>
          ) : null}
        </section>

        {/* Превью страницы */}
        {!focus ? (
          <aside className="hidden xl:block">
            <div className="sticky top-20 space-y-4">
              <div className="text-xs font-medium tracking-wider text-muted uppercase">{t.inBook}</div>
              <PagePreview {...previewProps} className="max-h-[calc(100dvh-16rem)] overflow-y-auto rounded-2xl bg-cream/60 p-3" />
              <div className="rounded-2xl border border-line p-4 text-xs leading-relaxed text-muted">
                <div className="mb-1 text-sm font-medium text-ink">
                  {t.answeredOf(answeredCount, questions.length)}
                </div>
                {t.notAll}
                <div className="mt-3 border-t border-line pt-3">
                  <kbd className="rounded border border-line bg-white px-1">Ctrl</kbd> + <kbd className="rounded border border-line bg-white px-1">Enter</kbd> {t.nextShortcut}
                </div>
              </div>
            </div>
          </aside>
        ) : null}
      </div>

      <MobileBar>
        <button
          onClick={() => goTo(index - 1)}
          disabled={!prev}
          className="flex size-11 shrink-0 items-center justify-center rounded-full border border-line bg-white disabled:opacity-35"
          aria-label={t.prev}
        >
          <ArrowLeft className="size-5" />
        </button>
        {dictateControl("shrink-0", true)}
        {editable ? (
          <button className="flex size-11 shrink-0 items-center justify-center rounded-full border border-line bg-white" onClick={() => setPicker(true)} aria-label={t.photoInAnswer}>
            <ImagePlus className="size-5" />
          </button>
        ) : null}
        {next ? (
          <button onClick={() => goTo(index + 1)} className="flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-ink px-4 text-[15px] font-medium text-white active:bg-ink-soft">
            <span className="truncate">{q.answer.trim() ? t.next : t.skip}</span>
            <ArrowRight className="size-4 shrink-0" />
          </button>
        ) : (
          <Link href={`/books/${book.id}/preview`} onClick={() => void flush()} className="flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-wine px-4 text-[15px] font-medium text-white">
            <span className="truncate">{t.toPreview}</span>
            <ArrowRight className="size-4 shrink-0" />
          </Link>
        )}
      </MobileBar>

      {picker ? (
        <PhotoPicker
          bookId={book.id}
          photos={photos}
          questionId={q.id}
          questionLabel={q.prompt}
          onAttach={(id) => {
            setSelectedPhotoId(id);
            void patchPhoto(id, { questionId: q.id });
          }}
          onDetach={(id) => patchPhoto(id, { questionId: null })}
          onUploaded={(list) => {
            setPhotos((ps) => [...ps, ...list]);
            if (list[0]?.questionId) setSelectedPhotoId(list[0].id);
          }}
          onClose={() => setPicker(false)}
          otherLabel={(qid) => questions.find((x) => x.id === qid)?.prompt ?? t.otherAnswer}
        />
      ) : null}

      {drawer ? (
        <Drawer onClose={() => setDrawer(false)}>
          <ChapterNav groups={groups} current={index} onPick={goTo} />
        </Drawer>
      ) : null}
    </div>
  );
}
