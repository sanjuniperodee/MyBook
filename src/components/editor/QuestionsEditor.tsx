"use client";

import { confirmDialog, toast, toastError } from "@/components/ui/overlays";
import { Link, useLocale, useMessages } from "@/i18n/client";
import { localeMeta } from "@/i18n/config";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ChevronDown, ImagePlus, Lightbulb } from "lucide-react";
import { AddQuestion } from "./questions/AddQuestion";
import { ChapterNav } from "./questions/ChapterNav";
import { Drawer } from "./questions/Drawer";
import { MobileBar } from "./questions/MobileBar";
import { PhotoPicker } from "./questions/PhotoPicker";
import { DictationControl, DictationStatus } from "./questions/DictationControl";
import { HeadingField } from "./questions/HeadingField";
import { PhotoStrip } from "./questions/PhotoStrip";
import { ProgressCard, QuestionPager } from "./questions/QuestionPager";
import { AnswerToolbar, EditorTopBar } from "./questions/Toolbars";
import { useInlinePhotos } from "./questions/useInlinePhotos";
import { answerPagesOf, useBookPages } from "./questions/usePageEstimate";
import { PreviewPane } from "./questions/PreviewPane";
import { useQuestionsDraft } from "./questions/useQuestionsDraft";
import { ProofBar, ProofTextarea, type ProofHandle } from "./proofread/ProofTextarea";
import { useProofread } from "./proofread/useProofread";
import { SaveIndicator } from "@/components/SaveIndicator";
import { useDictation } from "@/hooks/useDictation";
import { getFormat } from "@/lib/book/formats";
import { cssFont } from "@/lib/book/fonts";
import { groupByChapter, type EditorBook, type EditorPhoto, type EditorQuestion } from "@/lib/book/editor-model";
import { getInteriorDesign } from "@/lib/book/interiors";
import { countWords, type LetterLike } from "@/lib/book/layout";
import { cn } from "@/lib/class-names";

const NO_EPIGRAPHS: Record<string, string> = {};

export function QuestionsEditor({
  book,
  epigraphs = NO_EPIGRAPHS,
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
  const draft = useQuestionsDraft({ bookId: book.id, editable, initialQuestions });
  const { questions, status, error, flush, patchQuestion, appendText } = draft;
  const inlinePhotos = useInlinePhotos({ bookId: book.id, editable, initialPhotos });
  const { photos, selectedPhotoId, setSelectedPhotoId, updateInline, rotatePhoto, patchPhoto, editCaption } = inlinePhotos;
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
  // Оглавление получает стабильный обработчик, чтобы не перерисовываться на каждый символ.
  const goToRef = useRef(goTo);
  useLayoutEffect(() => {
    goToRef.current = goTo;
  });
  const pick = useCallback((i: number) => goToRef.current(i), []);


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
  const pages = useBookPages(book, questions, photos, letters);
  const answerPages = answerPagesOf(q, qPhotos, format, design);
  const selectedPhoto = qPhotos.find((p) => p.id === selectedPhotoId) ?? null;

  const previewProps = {
    language: book.language,
    format,
    design,
    bookTitle: book.title,
    questions,
    photos,
    epigraphs,
    currentId: q.id,
    selectedId: selectedPhoto?.id ?? null,
    onSelect: setSelectedPhotoId,
    onChange: editable ? updateInline : undefined,
  };

  const prev = questions[index - 1];
  const next = questions[index + 1];

  const addQuestion = async (prompt: string) => {
    setIndex(await draft.addQuestion(q, prompt));
    setAdding(false);
    setTimeout(() => textarea.current?.focus(), 50);
  };

  const removeQuestion = async () => {
    if (!q.isCustom || !(await confirmDialog({ title: t.deleteTitle, text: t.deleteText, confirmLabel: t.delete, danger: true }))) return;
    await draft.removeQuestion(q.id);
    setIndex((i) => Math.max(0, i - 1));
  };

  /** Диктовка: на компьютере — в панели под ответом, на телефоне — в нижней панели (compact). */
  const dictateControl = (className: string, compact: boolean) =>
    editable && dictation.supported ? <DictationControl dictation={dictation} lang={lang} onLang={setLang} onToggle={toggleDictation} compact={compact} className={className} /> : null;

  const sidebar = <ChapterNav groups={groups} current={index} onPick={pick} />;

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
          <EditorTopBar
            chapterNumber={chapterNumber}
            chapterTitle={q.chapterTitle}
            language={book.language}
            printedPages={pages.printed}
            focus={focus}
            onChapters={() => setDrawer(true)}
            onTogglePreview={() => setShowPreview((v) => !v)}
            onToggleFocus={toggleFocus}
          />

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

              <HeadingField question={q} language={book.language} typography={typography} editable={editable} onPatch={(patch) => patchQuestion(q.id, patch)} />

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
              {dictation.listening ? <DictationStatus dictation={dictation} /> : null}
            </div>

            {qPhotos.length ? (
              <PhotoStrip
                photos={qPhotos}
                selected={selectedPhoto}
                answer={q.answer}
                editable={editable}
                onSelect={setSelectedPhotoId}
                onChange={updateInline}
                onCaption={editCaption}
                onRotate={rotatePhoto}
                onRemove={(id) => {
                  setSelectedPhotoId(null);
                  void patchPhoto(id, { questionId: null });
                }}
              />
            ) : null}

            <AnswerToolbar
              dictation={dictateControl("max-lg:hidden", false)}
              editable={editable}
              custom={q.isCustom}
              words={words}
              answerPages={answerPages}
              onPhoto={() => setPicker(true)}
              onAdd={() => setAdding((v) => !v)}
              onRemove={removeQuestion}
            />
            {dictation.error ? <p className="px-4 pb-3 text-sm text-red-700 sm:px-10">{dictation.error}</p> : null}
            {adding ? (
              <div className="border-t border-line/60 p-4 sm:px-8">
                <AddQuestion onAdd={addQuestion} onCancel={() => setAdding(false)} />
              </div>
            ) : null}
          </article>

          {/* Переход между вопросами */}
          <QuestionPager bookId={book.id} prev={prev} next={next} answered={!!q.answer.trim()} onGo={(step) => goTo(index + step)} onFinish={() => void flush()} />

          {showPreview && !focus ? (
            <div className="mt-6 xl:hidden">
              <PreviewPane {...previewProps} className="max-h-[75dvh] overflow-y-auto rounded-3xl bg-cream/60 p-4" />
            </div>
          ) : null}
        </section>

        {/* Превью страницы */}
        {!focus ? (
          <aside className="hidden xl:block">
            <div className="sticky top-20 space-y-4">
              <div className="text-xs font-medium tracking-wider text-muted uppercase">{t.inBook}</div>
              <PreviewPane {...previewProps} className="max-h-[calc(100dvh-16rem)] overflow-y-auto rounded-2xl bg-cream/60 p-3" />
              <ProgressCard answered={answeredCount} total={questions.length} />
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
          onUploaded={inlinePhotos.addUploaded}
          onClose={() => setPicker(false)}
          otherLabel={(qid) => questions.find((x) => x.id === qid)?.prompt ?? t.otherAnswer}
        />
      ) : null}

      {drawer ? (
        <Drawer onClose={() => setDrawer(false)}>
          <ChapterNav groups={groups} current={index} onPick={pick} />
        </Drawer>
      ) : null}
    </div>
  );
}
