"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  ImagePlus,
  Lightbulb,
  LoaderCircle,
  ListTree,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { PagePreview, type PreviewPhoto } from "./PagePreview";
import { PhotoInspector } from "./PhotoInspector";
import { normalizeStyle } from "@/lib/book/inline-photo";
import type { InlinePhotoStyle } from "@/lib/db/schema";
import { photoUrl } from "@/lib/urls";
import { SaveIndicator } from "@/components/SaveIndicator";
import { useAutosave } from "@/hooks/useAutosave";
import { useDictation } from "@/hooks/useDictation";
import { apiFetch } from "@/lib/client-api";
import { getFormat, printablePageCount } from "@/lib/book/formats";
import { cssFont, getTypography } from "@/lib/book/fonts";
import { countWords, estimateAnswerPages, estimatePages, pluralRu, type BookContent, type ContentChapter } from "@/lib/book/layout";
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

export interface EditorPhoto {
  id: string;
  width: number;
  height: number;
  caption: string;
  layout: "full" | "bleed" | "half";
  questionId: string | null;
  inline?: InlinePhotoStyle | null;
  /** Счётчик поворотов — сбрасывает кэш картинки в браузере. */
  rev?: number;
}

export interface EditorBook {
  id: string;
  format: string;
  typography: string;
  dedication: string;
  showToc: boolean;
  photoPlacement: "chapters" | "end";
  title: string;
}

const writingTips = [
  "Начните с конкретного момента: где вы были, что видели, какая была погода.",
  "Вспомните точную фразу — прямую речь приятно перечитывать.",
  "Опишите, что вы чувствовали внутри в тот момент.",
  "Добавьте деталь, которую знаете только вы двое.",
  "Пишите так, будто рассказываете это вслух за чашкой чая.",
  "Пара искренних предложений лучше страницы общих слов.",
];

interface ChapterGroup {
  key: string;
  title: string;
  items: { q: EditorQuestion; i: number }[];
}

function groupByChapter(questions: EditorQuestion[]): ChapterGroup[] {
  const groups: ChapterGroup[] = [];
  questions.forEach((q, i) => {
    let g = groups[groups.length - 1];
    if (!g || g.key !== q.chapter) groups.push((g = { key: q.chapter, title: q.chapterTitle, items: [] }));
    g.items.push({ q, i });
  });
  return groups;
}

export function QuestionsEditor({
  book,
  initialQuestions,
  initialIndex,
  initialPhotos,
  editable,
}: {
  book: EditorBook;
  initialQuestions: EditorQuestion[];
  initialIndex: number;
  initialPhotos: EditorPhoto[];
  editable: boolean;
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
  const [lang, setLang] = useState<"ru-RU" | "kk-KZ">("ru-RU");
  const textarea = useRef<HTMLTextAreaElement>(null);
  const dirty = useRef(new Map<string, Patch>());

  const format = getFormat(book.format);
  const typography = getTypography(book.typography);
  const q = questions[index];

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
    el.style.height = `${Math.max(el.scrollHeight, 280)}px`;
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

  const heading = (x: EditorQuestion) => (x.hideHeading ? null : (x.displayText ?? x.defaultTitle));
  const groups = useMemo(() => groupByChapter(questions), [questions]);

  const pages = useMemo(() => {
    const chapters: ContentChapter[] = [];
    for (const x of questions) {
      if (!x.answer.trim()) continue;
      let ch = chapters[chapters.length - 1];
      if (!ch || ch.key !== x.chapter) {
        ch = { key: x.chapter, number: chapters.length + 1, title: x.chapterTitle, items: [], photos: [] };
        chapters.push(ch);
      }
      const inline = photos.filter((p) => p.questionId === x.id).map((p) => ({ ...p, storageKey: "", thumbKey: "" }));
      ch.items.push({ id: x.id, heading: x.hideHeading ? null : (x.displayText ?? x.defaultTitle), answer: x.answer, photos: inline });
    }
    const loose = photos.filter((p) => !p.questionId).map((p) => ({ ...p, storageKey: "", thumbKey: "" }));
    const toGallery = book.photoPlacement === "end" || !chapters.length;
    if (!toGallery) loose.forEach((p, i) => chapters[Math.min(chapters.length - 1, Math.floor((i * chapters.length) / loose.length))].photos.push(p));
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
      galleryPhotos: toGallery ? loose : [],
      year: 2000,
    };
    const raw = chapters.length ? estimatePages(content) : 0;
    return { raw, printed: raw ? printablePageCount(raw) : 0 };
  }, [questions, photos, format, typography, book]);

  const answeredCount = questions.filter((x) => x.answer.trim()).length;
  const group = groups.find((g) => g.key === q.chapter)!;
  const posInChapter = group.items.findIndex((x) => x.q.id === q.id);
  const chapterNumber = groups.indexOf(group) + 1;
  const words = countWords(q.answer);
  const qPhotos = photos.filter((p) => p.questionId === q.id);
  const imgUrl = (p: EditorPhoto) => photoUrl(p.id) + (p.rev ? `&v=${p.rev}` : "");
  const previewPhotos: PreviewPhoto[] = qPhotos.map((p) => ({ id: p.id, url: imgUrl(p), width: p.width, height: p.height, caption: p.caption, inline: p.inline }));
  const answerPages = q.answer.trim() || qPhotos.length ? estimateAnswerPages(heading(q), q.answer, format, typography, qPhotos) : 0;
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
        apiFetch(`/api/books/${book.id}/photos/${id}`, { method: "PATCH", json: { inline } }).catch((e) => alert((e as Error).message));
      }, 350),
    );
  };
  const rotatePhoto = async (id: string) => {
    try {
      const res = await apiFetch<{ photo: EditorPhoto }>(`/api/books/${book.id}/photos/${id}/rotate`, { method: "POST" });
      setPhotos((ps) => ps.map((p) => (p.id === id ? { ...p, width: res.photo.width, height: res.photo.height, inline: res.photo.inline, rev: (p.rev ?? 0) + 1 } : p)));
    } catch (e) {
      alert((e as Error).message);
    }
  };  const previewProps = {
    format,
    typography,
    heading: heading(q),
    answer: q.answer,
    photos: previewPhotos,
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
      alert((e as Error).message);
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
    if (!q.isCustom || !confirm("Удалить этот вопрос вместе с ответом?")) return;
    await flush();
    await apiFetch(`/api/books/${book.id}/questions/${q.id}`, { method: "DELETE" });
    dirty.current.delete(q.id);
    setQuestions((qs) => qs.filter((x) => x.id !== q.id));
    setIndex((i) => Math.max(0, i - 1));
  };

  const sidebar = <ChapterNav groups={groups} current={index} onPick={goTo} />;

  return (
    <div className={cn("mx-auto px-4 py-6 sm:px-6 lg:py-8", focus ? "max-w-3xl" : "max-w-7xl")}>
      <div className={cn("gap-8 xl:gap-10", !focus && "lg:grid lg:grid-cols-[250px_minmax(0,1fr)] xl:grid-cols-[250px_minmax(0,1fr)_280px]")}>
        {/* Навигация по главам */}
        {!focus ? (
          <aside className="hidden lg:block">
            <div className="sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto pr-1 pb-6">{sidebar}</div>
          </aside>
        ) : null}

        {/* Лист */}
        <section className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <button className={cn("btn btn-outline btn-sm", !focus && "lg:hidden")} onClick={() => setDrawer(true)}>
              <ListTree className="size-4" /> Главы
            </button>
            <div className="min-w-0 flex-1 truncate text-sm text-muted">
              <span className="text-ink">Глава {chapterNumber}</span> · {q.chapterTitle}
            </div>
            <span className="flex items-center gap-1.5 rounded-full bg-rose/70 px-3 py-1.5 text-xs font-medium text-wine" title="Оценка объёма готовой книги">
              <BookOpen className="size-3.5" /> ≈ {pages.printed || 0} стр.
            </span>
            {!focus ? (
              <button className="btn btn-ghost btn-sm size-9 px-0 xl:hidden" onClick={() => setShowPreview((v) => !v)} title="Как будет выглядеть страница">
                <Eye className="size-4" />
              </button>
            ) : null}
            <button className="btn btn-ghost btn-sm size-9 px-0" onClick={toggleFocus} title={focus ? "Выйти из режима фокуса" : "Режим фокуса"}>
              {focus ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            </button>
          </div>

          <article className="relative rounded-[28px] border border-line/70 bg-white shadow-soft">
            <div className="flex items-center justify-between border-b border-line/60 px-6 py-3 text-xs text-muted sm:px-10">
              <span>
                Вопрос {posInChapter + 1} из {group.items.length}
              </span>
              <SaveIndicator status={status} error={error} className="text-xs" />
            </div>

            <div className="px-6 pt-8 pb-6 sm:px-10 sm:pt-10">
              <h1 className="font-serif text-[28px] leading-tight font-medium text-ink sm:text-[38px]">{q.prompt}</h1>
              {q.hint ? <p className="mt-3 text-[15px] leading-relaxed text-muted">{q.hint}</p> : null}
              <button className="mt-4 inline-flex items-center gap-1.5 text-sm text-wine hover:underline" onClick={() => setShowTips((v) => !v)}>
                <Lightbulb className="size-4" /> С чего начать?
                <ChevronDown className={cn("size-3.5 transition", showTips && "rotate-180")} />
              </button>
              {showTips ? (
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  {writingTips.map((t) => (
                    <li key={t} className="rounded-2xl bg-cream/70 px-4 py-3 text-sm leading-snug text-ink-soft">
                      {t}
                    </li>
                  ))}
                </ul>
              ) : null}

              {/* Заголовок, как он будет в книге */}
              <div className="mt-8 flex items-start gap-3 rounded-2xl border border-dashed border-line px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] tracking-wider text-muted uppercase">Заголовок в книге</div>
                  <input
                    value={q.hideHeading ? "" : (q.displayText ?? q.defaultTitle)}
                    placeholder={q.hideHeading ? "Заголовок скрыт — ответ пойдёт сплошным текстом" : q.defaultTitle}
                    onChange={(e) => patchQuestion(q.id, { displayText: e.target.value })}
                    onBlur={() => q.displayText !== null && !q.displayText.trim() && patchQuestion(q.id, { displayText: null })}
                    disabled={!editable || q.hideHeading}
                    maxLength={200}
                    className="mt-0.5 w-full bg-transparent text-lg outline-none disabled:text-muted"
                    style={{ fontFamily: cssFont(typography.heading), fontStyle: typography.headingItalic ? "italic" : "normal" }}
                  />
                </div>
                {q.displayText !== null && q.displayText !== q.defaultTitle && !q.hideHeading ? (
                  <button className="mt-4 shrink-0 text-xs text-wine hover:underline" onClick={() => patchQuestion(q.id, { displayText: null })}>
                    исходный
                  </button>
                ) : null}
                <button
                  className="mt-3 shrink-0 rounded-lg p-1.5 text-muted hover:bg-cream hover:text-ink"
                  onClick={() => patchQuestion(q.id, { hideHeading: !q.hideHeading })}
                  disabled={!editable}
                  title={q.hideHeading ? "Показать заголовок" : "Скрыть заголовок"}
                >
                  {q.hideHeading ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>

              <textarea
                id="answer"
                ref={textarea}
                value={q.answer}
                onChange={(e) => patchQuestion(q.id, { answer: e.target.value })}
                readOnly={!editable}
                placeholder={editable ? "Ваш ответ… Пишите так, как рассказали бы вслух. Новый абзац — Enter." : ""}
                aria-label="Ваш ответ"
                className="mt-6 block min-h-[280px] w-full resize-none bg-transparent text-lg leading-[1.75] outline-none placeholder:text-muted/60 sm:text-[19px]"
                style={{ fontFamily: cssFont(typography.body) }}
                maxLength={40000}
              />
              {dictation.listening ? (
                <div className="mt-2 rounded-2xl bg-rose/50 px-4 py-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-wine">
                    <span className="relative flex size-2.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-wine opacity-60" />
                      <span className="relative inline-flex size-2.5 rounded-full bg-wine" />
                    </span>
                    Слушаю — говорите. Текст появится в ответе после паузы.
                  </div>
                  {dictation.interim ? <p className="mt-1.5 text-lg text-ink-soft italic">{dictation.interim}…</p> : null}
                  {dictation.silent ? <p className="mt-1.5 text-xs text-muted">Не слышу речи. Проверьте, что выбран нужный микрофон и он не выключен в системе.</p> : null}
                </div>
              ) : null}
            </div>

            {qPhotos.length ? (
              <div className="space-y-3 px-6 pb-6 sm:px-10">
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
                        aria-label={`Настроить фото${p.caption ? ` «${p.caption}»` : ""}`}
                        data-testid="inline-photo-thumb"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={imgUrl(p)} alt="" className="size-full object-cover" />
                        <span className="absolute inset-x-0 bottom-0 bg-ink/60 py-0.5 text-center text-[10px] text-white tabular-nums">{st.width}%</span>
                      </button>
                    );
                  })}
                  <span className="text-xs text-muted">{selectedPhoto ? "" : "Нажмите на фото, чтобы изменить размер, место и рамку"}</span>
                </div>
                {selectedPhoto ? (
                  <PhotoInspector
                    photo={{ ...selectedPhoto, url: imgUrl(selectedPhoto) }}
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

            <div className="flex flex-wrap items-center gap-2 border-t border-line/60 px-4 py-3 sm:px-8">
              {editable && dictation.supported ? (
                <div className="flex items-center rounded-full border border-line">
                  <button
                    className={cn("flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm", dictation.listening ? "bg-wine text-white" : "hover:bg-cream")}
                    onClick={toggleDictation}
                    title="Надиктовать ответ голосом"
                  >
                    {dictation.listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
                    {dictation.listening ? "Стоп" : "Надиктовать"}
                  </button>
                  <select
                    value={lang}
                    onChange={(e) => {
                      const l = e.target.value as typeof lang;
                      setLang(l);
                      if (dictation.listening) dictation.start(l);
                    }}
                    className="h-9 rounded-full bg-transparent pr-2 pl-1 text-xs text-muted outline-none"
                    aria-label="Язык диктовки"
                  >
                    <option value="ru-RU">RU</option>
                    <option value="kk-KZ">KZ</option>
                  </select>
                </div>
              ) : null}
              {editable ? (
                <button className="btn btn-ghost btn-sm text-muted" onClick={() => setPicker(true)}>
                  <ImagePlus className="size-4" /> Фото в ответ
                </button>
              ) : null}
              {editable ? (
                <button className="btn btn-ghost btn-sm text-muted" onClick={() => setAdding((v) => !v)}>
                  <Plus className="size-4" /> Свой вопрос
                </button>
              ) : null}
              {editable && q.isCustom ? (
                <button className="btn btn-ghost btn-sm text-red-700" onClick={removeQuestion}>
                  <Trash2 className="size-4" /> Удалить
                </button>
              ) : null}
              <span className="ml-auto text-xs text-muted tabular-nums">
                {words} {pluralRu(words, "слово", "слова", "слов")}
                {answerPages > 0 ? ` · ≈ ${(Math.round(Math.max(answerPages, 0.1) * 10) / 10).toString().replace(".", ",")} стр.` : ""}
              </span>
            </div>
            {dictation.error ? <p className="px-6 pb-3 text-sm text-red-700 sm:px-10">{dictation.error}</p> : null}
            {adding ? (
              <div className="border-t border-line/60 p-4 sm:px-8">
                <AddQuestion onAdd={addQuestion} onCancel={() => setAdding(false)} />
              </div>
            ) : null}
          </article>

          {/* Переход между вопросами */}
          <div className="mt-5 grid grid-cols-2 gap-3">
            <button
              onClick={() => goTo(index - 1)}
              disabled={!prev}
              className="group flex min-w-0 items-center gap-3 rounded-2xl border border-line bg-white/60 p-4 text-left transition hover:border-ink/30 disabled:opacity-40"
              title="Ctrl + Shift + Enter"
            >
              <ArrowLeft className="size-5 shrink-0 text-muted transition group-hover:-translate-x-0.5" />
              <span className="min-w-0">
                <span className="block text-xs text-muted">Предыдущий</span>
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
                  <span className="block text-xs text-white/60">{q.answer.trim() ? "Следующий" : "Пропустить"}</span>
                  <span className="block truncate text-sm">{next.prompt}</span>
                </span>
                <ArrowRight className="size-5 shrink-0 transition group-hover:translate-x-0.5" />
              </button>
            ) : (
              <Link href={`/books/${book.id}/preview`} onClick={() => void flush()} className="flex items-center justify-end gap-3 rounded-2xl bg-wine p-4 text-white">
                <span className="text-sm font-medium">Посмотреть макет книги</span>
                <ArrowRight className="size-5" />
              </Link>
            )}
          </div>

          {showPreview && !focus ? (
            <div className="mt-6 rounded-3xl bg-cream/60 p-5 xl:hidden">
              <PagePreview
                {...previewProps}
              />
            </div>
          ) : null}
        </section>

        {/* Превью страницы */}
        {!focus ? (
          <aside className="hidden xl:block">
            <div className="sticky top-20 space-y-4">
              <div className="text-xs font-medium tracking-wider text-muted uppercase">Так будет в книге</div>
              <div className="max-h-[calc(100dvh-16rem)] overflow-y-auto rounded-2xl bg-cream/60 p-3">
                <PagePreview
                {...previewProps}
              />
              </div>
              <div className="rounded-2xl border border-line p-4 text-xs leading-relaxed text-muted">
                <div className="mb-1 text-sm font-medium text-ink">
                  {answeredCount} из {questions.length} ответов
                </div>
                Отвечать на все вопросы не обязательно — в книгу попадут только заполненные.
                <div className="mt-3 border-t border-line pt-3">
                  <kbd className="rounded border border-line bg-white px-1">Ctrl</kbd> + <kbd className="rounded border border-line bg-white px-1">Enter</kbd> — следующий вопрос
                </div>
              </div>
            </div>
          </aside>
        ) : null}
      </div>

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
          otherLabel={(qid) => questions.find((x) => x.id === qid)?.prompt ?? "другой ответ"}
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

function ChapterNav({ groups, current, onPick }: { groups: ChapterGroup[]; current: number; onPick: (i: number) => void }) {
  const currentKey = groups.find((g) => g.items.some((x) => x.i === current))?.key;
  const [open, setOpen] = useState<string | undefined>(currentKey);
  const [search, setSearch] = useState("");
  const [onlyEmpty, setOnlyEmpty] = useState(false);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // раскрываем главу текущего вопроса при переходе
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(currentKey);
  }, [currentKey]);

  useEffect(() => {
    list.current?.querySelector("[data-current=true]")?.scrollIntoView({ block: "nearest" });
  }, [current, open]);

  const s = search.trim().toLowerCase();
  const filtering = !!s || onlyEmpty;

  return (
    <div ref={list}>
      <div className="relative">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
        <input className="input h-10 pl-9 text-sm" placeholder="Поиск по вопросам" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <label className="mt-3 flex items-center gap-2 px-1 text-xs text-muted">
        <input type="checkbox" className="accent-wine" checked={onlyEmpty} onChange={(e) => setOnlyEmpty(e.target.checked)} />
        Только без ответа
      </label>
      <ol className="mt-4 space-y-1">
        {groups.map((g, gi) => {
          const answered = g.items.filter((x) => x.q.answer.trim()).length;
          const items = g.items.filter(
            ({ q }) => (!onlyEmpty || !q.answer.trim()) && (!s || q.prompt.toLowerCase().includes(s) || q.answer.toLowerCase().includes(s)),
          );
          if (filtering && !items.length) return null;
          const expanded = filtering || open === g.key;
          return (
            <li key={`${g.key}-${gi}`}>
              <button
                onClick={() => setOpen(expanded && !filtering ? undefined : g.key)}
                className={cn("flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm transition hover:bg-ink/5", g.key === currentKey && "font-medium")}
              >
                <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full text-[11px]", answered === g.items.length ? "bg-wine text-white" : answered ? "bg-rose text-wine" : "bg-cream text-muted")}>
                  {answered === g.items.length ? <Check className="size-3" /> : gi + 1}
                </span>
                <span className="min-w-0 flex-1 truncate">{g.title}</span>
                <span className="text-[11px] text-muted tabular-nums">
                  {answered}/{g.items.length}
                </span>
              </button>
              {expanded ? (
                <ol className="mt-0.5 mb-2 ml-5 border-l border-line pl-2">
                  {items.map(({ q, i }) => (
                    <li key={q.id}>
                      <button
                        data-current={i === current}
                        onClick={() => onPick(i)}
                        className={cn("flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] leading-snug transition", i === current ? "bg-wine/8 text-wine" : "text-ink-soft hover:bg-ink/5")}
                      >
                        <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", q.answer.trim() ? "bg-emerald-500" : "bg-line")} />
                        <span className="line-clamp-2">{q.prompt}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Drawer({ children, onClose, title = "Главы и вопросы" }: { children: React.ReactNode; onClose: () => void; title?: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-sm flex-col bg-paper shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button className="btn btn-ghost btn-sm size-9 px-0" onClick={onClose} aria-label="Закрыть">
            <X className="size-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

function AddQuestion({ onAdd, onCancel }: { onAdd: (prompt: string) => Promise<void>; onCancel: () => void }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <form
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
      <label className="label">Ваш вопрос — он же станет заголовком в книге</label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input autoFocus className="input" value={value} onChange={(e) => setValue(e.target.value)} maxLength={200} minLength={3} required placeholder="Например: Наша поездка в Бурабай" />
        <button className="btn btn-primary shrink-0" disabled={busy}>
          Добавить
        </button>
        <button type="button" className="btn btn-ghost shrink-0" onClick={onCancel}>
          Отмена
        </button>
      </div>
      {err ? <p className="mt-2 text-sm text-red-700">{err}</p> : null}
    </form>
  );
}

function PhotoPicker({
  bookId,
  photos,
  questionId,
  questionLabel,
  onAttach,
  onDetach,
  onUploaded,
  onClose,
  otherLabel,
}: {
  bookId: string;
  photos: EditorPhoto[];
  questionId: string;
  questionLabel: string;
  onAttach: (id: string) => void;
  onDetach: (id: string) => void;
  onUploaded: (list: EditorPhoto[]) => void;
  onClose: () => void;
  otherLabel: (questionId: string) => string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (files: File[]) => {
    if (!files.length) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      files.slice(0, 6).forEach((f) => form.append("files", f));
      const res = await apiFetch<{ photos: EditorPhoto[]; errors: string[] }>(`/api/books/${bookId}/photos`, { method: "POST", body: form });
      // Загруженные фото сразу вставляем в текущий ответ
      for (const p of res.photos) await apiFetch(`/api/books/${bookId}/photos/${p.id}`, { method: "PATCH", json: { questionId } });
      onUploaded(res.photos.map((p) => ({ ...p, questionId })));
      if (res.errors.length) setError(res.errors.join(", "));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <Drawer onClose={onClose} title="Фото в ответ">
      <p className="text-sm text-muted">
        Фото встанет в книгу сразу после ответа на вопрос «<span className="text-ink">{questionLabel}</span>».
      </p>
      <input ref={input} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void upload([...(e.target.files ?? [])])} />
      <button className="btn btn-primary mt-4 w-full" onClick={() => input.current?.click()} disabled={uploading}>
        {uploading ? <LoaderCircle className="size-4 animate-spin" /> : <ImagePlus className="size-4" />} {uploading ? "Загружаем…" : "Загрузить с устройства"}
      </button>
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
      {photos.length ? (
        <>
          <div className="mt-6 mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Фото книги</div>
          <div className="grid grid-cols-2 gap-2">
            {photos.map((p) => {
              const here = p.questionId === questionId;
              const elsewhere = !!p.questionId && !here;
              return (
                <button
                  key={p.id}
                  onClick={() => (here ? onDetach(p.id) : onAttach(p.id))}
                  className={cn("group relative overflow-hidden rounded-xl text-left ring-offset-2 ring-offset-paper", here ? "ring-2 ring-wine" : "ring-1 ring-line hover:ring-ink/30")}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photoUrl(p.id)} alt={p.caption} className="aspect-square w-full object-cover" />
                  {here ? (
                    <span className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full bg-wine text-white">
                      <Check className="size-3.5" />
                    </span>
                  ) : null}
                  {elsewhere ? (
                    <span className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-2 py-1 text-[11px] text-white" title={otherLabel(p.questionId!)}>
                      в ответе: {otherLabel(p.questionId!)}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-muted">Нажмите на фото, чтобы вставить или убрать его. Фото из другого ответа переместится сюда.</p>
        </>
      ) : null}
    </Drawer>
  );
}
