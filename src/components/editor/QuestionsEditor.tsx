"use client";

import { confirmDialog, toast, toastError } from "@/components/ui/overlays";
import { Link, useLocale, useMessages } from "@/i18n/client";
import { localeMeta } from "@/i18n/config";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ChevronDown, ImagePlus, Lightbulb, ListTree, Plus } from "lucide-react";
import { AddQuestion } from "./questions/AddQuestion";
import { ChapterNav, type NavActions } from "./questions/ChapterNav";
import { Drawer } from "./questions/Drawer";
import { EmptyEditor, type EmptyMode } from "./questions/EmptyEditor";
import { MobileBar } from "./questions/MobileBar";
import { PhotoPicker } from "./questions/PhotoPicker";
import { DictationControl, DictationStatus } from "./questions/DictationControl";
import { HeadingField } from "./questions/HeadingField";
import { PhotoStrip } from "./questions/PhotoStrip";
import { BlankProgress, ProgressCard, QuestionPager } from "./questions/QuestionPager";
import { SectionFields } from "./questions/SectionFields";
import { AnswerToolbar, EditorTopBar } from "./questions/Toolbars";
import { useInlinePhotos } from "./questions/useInlinePhotos";
import { chapterNumbers, selectionAfterRemoval } from "./questions/outline";
import { useOutline } from "./questions/useOutline";
import { answerPagesOf } from "./questions/usePageEstimate";
import { PagesBadge } from "./questions/PagesBadge";
import { PreviewPane } from "./questions/PreviewPane";
import { useQuestionsDraft } from "./questions/useQuestionsDraft";
import { ProofBar, ProofTextarea, type ProofHandle } from "./proofread/ProofTextarea";
import { useProofread } from "./proofread/useProofread";
import { AiWriter } from "./proofread/AiWriter";
import { SaveIndicator } from "@/components/SaveIndicator";
import { useDictation } from "@/hooks/useDictation";
import { getFormat } from "@/lib/book/formats";
import { cssFont } from "@/lib/book/fonts";
import { groupByChapter, sectionLabel, type EditorBook, type EditorChapter, type EditorPhoto, type EditorQuestion } from "@/lib/book/editor-model";
import { getInteriorDesign } from "@/lib/book/interiors";
import { countWords, type LetterLike } from "@/lib/book/layout";
import { cn } from "@/lib/class-names";

const NO_EPIGRAPHS: Record<string, string> = {};
const NO_CHAPTERS: EditorChapter[] = [];

export interface QuestionsEditorProps {
  book: EditorBook;
  /** Эпиграфы глав (по ключу главы) — для начальных полос в превью. */
  epigraphs?: Record<string, string>;
  initialQuestions: EditorQuestion[];
  /** Главы редактора: у своей книги — из book_chapters, включая пустые. */
  chapters?: EditorChapter[];
  /** Номер раздела (с нуля) для совместимости со ссылками ?q=N; раздел по id (?s=) страница переводит в номер. */
  initialIndex: number;
  initialPhotos: EditorPhoto[];
  /** Одобренные письма близких: идут в книгу последней главой и входят в оценку объёма. */
  letters: LetterLike[];
  /** Книгу можно править: она черновик и у смотрящего есть право правки (сотрудник с просмотром — только читает). */
  editable: boolean;
  /** AI-корректор подключён в «Интеграциях» — показываем кнопку «Проверить грамотность». */
  proofreadAi?: boolean;
}

/**
 * Редактор текста. Обёртка перечитывает страницу, когда данные разошлись с сервером (оглавление изменили в другом окне,
 * раздел удалён): после router.refresh() новые данные страницы пересоздают редактор, а открытый раздел сохраняется по id.
 */
export function QuestionsEditor(props: QuestionsEditorProps) {
  const router = useRouter();
  const [generation, setGeneration] = useState(0);
  const [waiting, setWaiting] = useState<{ id: string | null } | null>(null);
  const [resumeId, setResumeId] = useState<string | null>(null);
  const [seen, setSeen] = useState(props.initialQuestions);
  if (props.initialQuestions !== seen) {
    // Пришли новые данные страницы. Заменяем состояние редактора только если сами просили перечитать.
    setSeen(props.initialQuestions);
    if (waiting) {
      setResumeId(waiting.id);
      setWaiting(null);
      setGeneration((g) => g + 1);
    }
  }
  const onResync = useCallback(
    (currentId: string | null) => {
      setWaiting((w) => w ?? { id: currentId });
      router.refresh();
    },
    [router],
  );
  return <EditorBody key={generation} {...props} resumeId={resumeId} onResync={onResync} />;
}

function EditorBody({
  book,
  epigraphs = NO_EPIGRAPHS,
  initialQuestions,
  chapters: initialChapters = NO_CHAPTERS,
  initialIndex,
  initialPhotos,
  letters,
  editable,
  proofreadAi = false,
  resumeId,
  onResync,
}: QuestionsEditorProps & { resumeId: string | null; onResync: (currentId: string | null) => void }) {
  const t = useMessages().editor;
  const messages = useMessages();
  const kind = book.kind;
  const blank = kind === "blank";
  const untitled = messages.books.untitledSection;
  const untitledChapter = messages.book.untitledChapter;

  // Актуальные значения для обработчиков, которые не должны пересоздаваться (оглавление, перечитывание страницы).
  const latest = useRef<{ flush: () => Promise<void>; currentId: string | null }>({ flush: async () => {}, currentId: null });
  const resync = useCallback(() => {
    void latest.current.flush().finally(() => onResync(latest.current.currentId));
  }, [onResync]);
  const onGone = useCallback(() => {
    toast(t.nav.gone, "info");
    resync();
  }, [t, resync]);

  const draft = useQuestionsDraft({ bookId: book.id, editable, initialQuestions, initialChapters, onGone });
  const { questions, chapters, status, error, flush, patchQuestion, patchChapter, appendText } = draft;
  const inlinePhotos = useInlinePhotos({ bookId: book.id, editable, initialPhotos });
  const { photos, selectedPhotoId, setSelectedPhotoId, updateInline, rotatePhoto, patchPhoto, editCaption, detachQuestions } = inlinePhotos;
  const [picker, setPicker] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(() => {
    const byId = resumeId ? initialQuestions.find((x) => x.id === resumeId) : undefined;
    return (byId ?? initialQuestions[Math.min(Math.max(initialIndex, 0), initialQuestions.length - 1)])?.id ?? null;
  });
  const [drawer, setDrawer] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [showTips, setShowTips] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [focus, setFocus] = useState(false);
  const [aiWriting, setAiWriting] = useState(false);
  // Диктуют обычно на языке книги.
  const [lang, setLang] = useState<string>(localeMeta[book.language].speech);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const titleField = useRef<HTMLInputElement>(null);
  const proof = useRef<ProofHandle>(null);
  const ui = useLocale();

  const format = getFormat(book.format);
  const design = getInteriorDesign(book.interior);
  const typography = design.type;
  // Раздел, которого нет (удалён в другом окне), заменяется первым; пустая книга — q === undefined.
  const found = questions.findIndex((x) => x.id === currentId);
  const index = Math.max(0, found);
  const q: EditorQuestion | undefined = questions[index];
  const proofread = useProofread({ bookId: book.id, docId: q?.id ?? "", text: q?.answer ?? "", language: book.language, ui, names: book.names ?? [], enabled: editable && !!q });

  useLayoutEffect(() => {
    latest.current = { flush, currentId: q?.id ?? null };
  });

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
    if (!q) return;
    dictationTarget.current = q.id;
    dictation.start(lang);
  };

  /** Перейти к разделу по id: дописать черновик, остановить диктовку, закрыть панели. */
  const select = useCallback(
    (id: string | null) => {
      void flush();
      dictation.stop();
      setCurrentId(id);
      setAdding(false);
      setDrawer(false);
      setShowTips(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [flush, dictation],
  );
  const goTo = useCallback(
    (i: number) => {
      const target = questions[Math.min(Math.max(i, 0), questions.length - 1)];
      if (target) select(target.id);
    },
    [select, questions],
  );

  // Адрес — по id раздела (?s=): после перестановки обновление страницы откроет тот же раздел. Прежнее ?q=N убираем.
  useEffect(() => {
    if (!q) return;
    const url = new URL(window.location.href);
    url.searchParams.set("s", q.id);
    url.searchParams.delete("q");
    window.history.replaceState(null, "", url);
  }, [q?.id]); // eslint-disable-line react-hooks/exhaustive-deps -- адрес зависит только от id раздела

  useEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, 220)}px`;
  }, [q?.answer, q?.id]);

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

  const groups = useMemo(() => groupByChapter(questions, blank ? chapters : undefined), [questions, chapters, blank]);
  // Оглавление получает стабильный обработчик, чтобы не перерисовываться на каждый символ.
  const selectRef = useRef(select);
  useLayoutEffect(() => {
    selectRef.current = select;
  });
  const pick = useCallback((id: string) => selectRef.current(id), []);

  const answeredCount = questions.filter((x) => x.answer.trim()).length;
  // Вехи: маленький праздник, когда книга растёт (не срабатывает при открытии редактора). У своей книги ответов нет — вех нет.
  const milestoneRef = useRef<number | null>(null);
  useEffect(() => {
    const prev = milestoneRef.current;
    milestoneRef.current = answeredCount;
    if (blank || prev === null || answeredCount <= prev) return;
    const m = t.milestones.find(([n]) => prev < n && answeredCount >= n);
    if (m) toast(m[1], "info");
  }, [answeredCount, t, blank]);

  const group = q ? groups.find((g) => g.key === q.chapter) : undefined;
  const posInChapter = group && q ? group.items.findIndex((x) => x.q.id === q.id) : 0;
  const numbers = chapterNumbers(groups, photos, blank);
  const chapterNumber = group ? (numbers.get(group.key) ?? null) : null;
  const chapterTitle = group ? group.title.trim() || (blank ? untitledChapter : group.title) : "";
  const words = q ? countWords(q.answer) : 0;
  const qPhotos = q ? photos.filter((p) => p.questionId === q.id) : [];
  const answerPages = q ? answerPagesOf(q, qPhotos, format, design) : 0;
  const selectedPhoto = qPhotos.find((p) => p.id === selectedPhotoId) ?? null;
  const labelOf = (x: EditorQuestion) => sectionLabel(x, kind, untitled);

  const previewProps = q
    ? {
        language: book.language,
        format,
        design,
        bookTitle: book.title,
        questions,
        photos,
        epigraphs,
        chapters: blank ? chapters : undefined,
        currentId: q.id,
        selectedId: selectedPhoto?.id ?? null,
        onSelect: setSelectedPhotoId,
        onChange: editable ? updateInline : undefined,
      }
    : null;

  const prev = questions[index - 1];
  const next = questions[index + 1];

  // ── оглавление своей книги ──
  const { actions: outline, busy } = useOutline({ bookId: book.id, stateRef: draft.stateRef, setState: draft.setState, flush, forget: draft.forget, detachPhotos: detachQuestions, onResync: resync });

  const focusTitle = () => setTimeout(() => titleField.current?.focus(), 80);

  /** Новый раздел в главе (после afterId или в конец): открыть его и поставить курсор в заголовок. */
  const addSection = useCallback(
    async (chapterKey: string, afterId?: string) => {
      const id = await outline.addSection(chapterKey, afterId);
      if (id) {
        select(id);
        focusTitle();
      }
    },
    [outline, select],
  );

  /** Удалить раздел (с подтверждением): если он открыт, перейти к соседнему. */
  const removeSection = useCallback(
    async (id: string) => {
      if (!(await confirmDialog({ title: t.blank.deleteTitle, text: t.blank.deleteText, confirmLabel: t.delete, danger: true }))) return;
      const st = draft.stateRef.current;
      const open = latest.current.currentId;
      if (open === id) setCurrentId(selectionAfterRemoval(st.questions, new Set([id]), id));
      outline.deleteSection(id);
    },
    [draft.stateRef, outline, t],
  );

  const removeChapter = useCallback(
    (key: string) => {
      const st = draft.stateRef.current;
      const ids = new Set(st.questions.filter((x) => x.chapter === key).map((x) => x.id));
      const open = latest.current.currentId;
      if (open && ids.has(open)) setCurrentId(selectionAfterRemoval(st.questions, ids, open));
      outline.deleteChapter(key);
    },
    [draft.stateRef, outline],
  );

  // Обработчики оглавления стабильны (через ref): оно не перерисовывается из-за новой функции на каждый символ.
  const handlers = useRef({ addSection, removeSection, removeChapter, patchChapter, select, outline });
  useLayoutEffect(() => {
    handlers.current = { addSection, removeSection, removeChapter, patchChapter, select, outline };
  });
  const navActions = useMemo<NavActions | null>(
    () =>
      blank && editable
        ? {
            rename: (key, title) => handlers.current.patchChapter(key, { title }),
            addChapter: (title) => {
              void handlers.current.outline.addChapter(title).then((id) => {
                if (id) {
                  handlers.current.select(id);
                  setTimeout(() => titleField.current?.focus(), 80);
                }
              });
            },
            deleteChapter: (key) => handlers.current.removeChapter(key),
            moveChapter: (key, delta) => handlers.current.outline.moveChapter(key, delta),
            addSection: (key) => void handlers.current.addSection(key),
            deleteSection: (id) => void handlers.current.removeSection(id),
            moveSection: (id, delta) => handlers.current.outline.moveSection(id, delta),
            moveSectionToChapter: (id, key) => handlers.current.outline.moveSectionToChapter(id, key),
          }
        : null,
    [blank, editable],
  );

  const addQuestion = async (prompt: string) => {
    if (!q) return;
    const id = await draft.addQuestion(q, prompt);
    setCurrentId(id);
    setAdding(false);
    setTimeout(() => textarea.current?.focus(), 50);
  };

  const removeQuestion = async () => {
    if (!q) return;
    if (blank) {
      await removeSection(q.id);
      return;
    }
    if (!q.isCustom || !(await confirmDialog({ title: t.deleteTitle, text: t.deleteText, confirmLabel: t.delete, danger: true }))) return;
    const nextId = selectionAfterRemoval(questions, new Set([q.id]), q.id);
    try {
      await draft.removeQuestion(q.id);
      setCurrentId(nextId);
    } catch (e) {
      toastError(e);
    }
  };

  /** Диктовка: на компьютере — в панели под ответом, на телефоне — в нижней панели (compact). */
  const dictateControl = (className: string, compact: boolean) =>
    editable && dictation.supported && q ? <DictationControl dictation={dictation} lang={lang} onLang={setLang} onToggle={toggleDictation} compact={compact} className={className} /> : null;

  const navProps = { groups, kind, current: q?.id ?? null, onPick: pick, photos, actions: navActions, busy, renaming, onRenaming: setRenaming };
  const sidebar = <ChapterNav {...navProps} />;

  const emptyMode: EmptyMode | null = q ? null : blank ? (chapters.length ? "noSections" : "noChapters") : "noQuestions";
  const tips = blank ? t.blank.tips : kind === "autobiography" ? t.life.tips : t.tips;
  const placeholder = !editable ? "" : blank ? t.blank.answerPlaceholder : kind === "autobiography" ? t.life.answerPlaceholder : t.answerPlaceholder;
  const lastChapter = chapters[chapters.length - 1];

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
          {q ? (
            <EditorTopBar
              chapterNumber={chapterNumber}
              chapterTitle={chapterTitle}
              language={book.language}
              pages={<PagesBadge book={book} questions={questions} photos={photos} letters={letters} chapters={blank ? chapters : undefined} />}
              focus={focus}
              onChapters={() => setDrawer(true)}
              onRename={
                blank && editable && group
                  ? () => {
                      setRenaming(group.key);
                      // Без боковой панели (телефон, режим фокуса) поле переименования открывается в панели оглавления.
                      if (focus || window.matchMedia("(max-width: 1023px)").matches) setDrawer(true);
                    }
                  : undefined
              }
              onTogglePreview={() => setShowPreview((v) => !v)}
              onToggleFocus={toggleFocus}
            />
          ) : (
            <div className={cn("mb-3 sm:mb-4", !focus && "lg:hidden")}>
              <button className="btn btn-outline btn-sm" onClick={() => setDrawer(true)}>
                <ListTree className="size-4" /> {t.chapters}
              </button>
            </div>
          )}

          {q && group ? (
            <article className="relative overflow-hidden rounded-[28px] border border-line/70 bg-white shadow-soft">
              {/* Прогресс по главе — тонкая линия сверху */}
              <div className="absolute inset-x-0 top-0 h-0.5 bg-cream" aria-hidden>
                <div className="h-full bg-wine/70 transition-[width] duration-500 ease-out" style={{ width: `${((posInChapter + 1) / group.items.length) * 100}%` }} />
              </div>
              <div className="flex items-center justify-between border-b border-line/60 px-4 py-2.5 text-xs text-muted sm:px-10 sm:py-3">
                <span>{blank ? t.blank.sectionOf(posInChapter + 1, group.items.length) : t.questionOf(posInChapter + 1, group.items.length)}</span>
                <SaveIndicator status={status} error={error} className="text-xs" />
              </div>

              <div className="px-4 pt-5 pb-4 sm:px-10 sm:pt-10 sm:pb-6">
                {blank ? (
                  // key — чтобы поля раздела (в том числе свёрнутая подсказка) не переносились на другой раздел
                  <SectionFields key={q.id} ref={titleField} question={q} language={book.language} typography={typography} editable={editable} onPatch={(patch) => patchQuestion(q.id, patch)} />
                ) : (
                  <>
                    {/* key — чтобы при переходе к другому вопросу формулировка мягко проявлялась */}
                    <h1 key={q.id} lang={book.language} className="enter font-serif text-2xl leading-tight font-medium text-ink sm:text-[38px]">
                      {labelOf(q)}
                    </h1>
                    {q.hint ? (
                      <p key={`h-${q.id}`} lang={book.language} style={{ "--i": 1 } as React.CSSProperties} className="enter mt-3 text-[15px] leading-relaxed text-muted">
                        {q.hint}
                      </p>
                    ) : null}
                  </>
                )}
                <button className="mt-4 inline-flex items-center gap-1.5 py-1 text-sm text-wine hover:underline max-sm:py-2" onClick={() => setShowTips((v) => !v)}>
                  <Lightbulb className="size-4" /> {t.whereToStart}
                  <ChevronDown className={cn("size-3.5 transition", showTips && "rotate-180")} />
                </button>
                {showTips ? (
                  <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                    {kind === "autobiography" ? (
                      <li className="enter rounded-2xl bg-rose/50 px-4 py-3 text-sm leading-snug text-ink-soft sm:col-span-2">{t.life.recordedNote}</li>
                    ) : null}
                    {tips.map((tip, i) => (
                      <li key={tip} style={{ "--i": i } as React.CSSProperties} className="enter rounded-2xl bg-cream/70 px-4 py-3 text-sm leading-snug text-ink-soft">
                        {tip}
                      </li>
                    ))}
                  </ul>
                ) : null}

                {blank ? null : <HeadingField question={q} language={book.language} typography={typography} editable={editable} onPatch={(patch) => patchQuestion(q.id, patch)} />}

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
                  readOnly={!editable || aiWriting}
                  aria-busy={aiWriting}
                  placeholder={placeholder}
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
                  >
                    {proofreadAi ? <AiWriter bookId={book.id} docId={q.id} text={q.answer} textarea={textarea} onText={(answer) => patchQuestion(q.id, { answer })} onBusy={setAiWriting} /> : null}
                  </ProofBar>
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
                blank={blank}
                custom={q.isCustom}
                words={words}
                answerPages={answerPages}
                onPhoto={() => setPicker(true)}
                onAdd={() => (blank ? void addSection(q.chapter, q.id) : setAdding((v) => !v))}
                onRemove={removeQuestion}
              />
              {dictation.error ? <p className="px-4 pb-3 text-sm text-red-700 sm:px-10">{dictation.error}</p> : null}
              {adding && !blank ? (
                <div className="border-t border-line/60 p-4 sm:px-8">
                  <AddQuestion onAdd={addQuestion} onCancel={() => setAdding(false)} />
                </div>
              ) : null}
            </article>
          ) : emptyMode ? (
            <EmptyEditor
              mode={emptyMode}
              bookId={book.id}
              editable={editable}
              busy={busy}
              onCreateChapter={(title) => navActions?.addChapter(title)}
              onAddSection={() => lastChapter && void addSection(lastChapter.key)}
            />
          ) : null}

          {/* Переход между вопросами */}
          {q ? <QuestionPager bookId={book.id} kind={kind} prev={prev} next={next} answered={!!q.answer.trim()} onGo={(step) => goTo(index + step)} onFinish={() => void flush()} /> : null}
          {q && blank ? (
            <Link href={`/books/${book.id}/preview`} onClick={() => void flush()} className="mt-4 flex items-center justify-center gap-2 py-2 text-sm text-wine hover:underline lg:hidden">
              {t.toPreview} <ArrowRight className="size-4" />
            </Link>
          ) : null}

          {previewProps && showPreview && !focus ? (
            <div className="mt-6 xl:hidden">
              <PreviewPane {...previewProps} className="max-h-[75dvh] overflow-y-auto rounded-3xl bg-cream/60 p-4" />
            </div>
          ) : null}
        </section>

        {/* Превью страницы */}
        {!focus ? (
          <aside className="hidden xl:block">
            <div className="sticky top-20 space-y-4">
              {previewProps ? (
                <>
                  <div className="text-xs font-medium tracking-wider text-muted uppercase">{t.inBook}</div>
                  <PreviewPane {...previewProps} className="max-h-[calc(100dvh-16rem)] overflow-y-auto rounded-2xl bg-cream/60 p-3" />
                </>
              ) : null}
              {blank ? (
                <BlankProgress book={book} questions={questions} photos={photos} letters={letters} chapters={chapters} />
              ) : (
                <ProgressCard answered={answeredCount} total={questions.length} />
              )}
            </div>
          </aside>
        ) : null}
      </div>

      {(q || blank) && editable ? (
        <MobileBar>
          {q ? (
            <>
              <button
                onClick={() => goTo(index - 1)}
                disabled={!prev}
                className="flex size-11 shrink-0 items-center justify-center rounded-full border border-line bg-white disabled:opacity-35"
                aria-label={t.prev}
              >
                <ArrowLeft className="size-5" />
              </button>
              {dictateControl("shrink-0", true)}
              <button className="flex size-11 shrink-0 items-center justify-center rounded-full border border-line bg-white" onClick={() => setPicker(true)} aria-label={t.photoInAnswer}>
                <ImagePlus className="size-5" />
              </button>
              {next ? (
                <button onClick={() => goTo(index + 1)} className="flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-ink px-4 text-[15px] font-medium text-white active:bg-ink-soft">
                  <span className="truncate">{blank ? t.blank.nextSection : q.answer.trim() ? t.next : t.skip}</span>
                  <ArrowRight className="size-4 shrink-0" />
                </button>
              ) : blank ? (
                <button disabled={busy} onClick={() => void addSection(q.chapter, q.id)} className="flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-ink px-4 text-[15px] font-medium text-white active:bg-ink-soft disabled:opacity-60">
                  <Plus className="size-4 shrink-0" />
                  <span className="truncate">{t.blank.addSection}</span>
                </button>
              ) : (
                <Link href={`/books/${book.id}/preview`} onClick={() => void flush()} className="flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-wine px-4 text-[15px] font-medium text-white">
                  <span className="truncate">{t.toPreview}</span>
                  <ArrowRight className="size-4 shrink-0" />
                </Link>
              )}
            </>
          ) : emptyMode === "noChapters" ? (
            <button disabled={busy} onClick={() => navActions?.addChapter("")} className="flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-ink px-4 text-[15px] font-medium text-white active:bg-ink-soft disabled:opacity-60">
              <Plus className="size-4 shrink-0" />
              <span className="truncate">{t.nav.newChapter}</span>
            </button>
          ) : lastChapter ? (
            <button disabled={busy} onClick={() => void addSection(lastChapter.key)} className="flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-ink px-4 text-[15px] font-medium text-white active:bg-ink-soft disabled:opacity-60">
              <Plus className="size-4 shrink-0" />
              <span className="truncate">{t.empty.noSections.create}</span>
            </button>
          ) : null}
        </MobileBar>
      ) : q && !editable ? (
        <MobileBar>
          <button onClick={() => goTo(index - 1)} disabled={!prev} className="flex size-11 shrink-0 items-center justify-center rounded-full border border-line bg-white disabled:opacity-35" aria-label={t.prev}>
            <ArrowLeft className="size-5" />
          </button>
          {next ? (
            <button onClick={() => goTo(index + 1)} className="flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-ink px-4 text-[15px] font-medium text-white active:bg-ink-soft">
              <span className="truncate">{blank ? t.blank.nextSection : t.next}</span>
              <ArrowRight className="size-4 shrink-0" />
            </button>
          ) : (
            <Link href={`/books/${book.id}/preview`} className="flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-wine px-4 text-[15px] font-medium text-white">
              <span className="truncate">{t.toPreview}</span>
              <ArrowRight className="size-4 shrink-0" />
            </Link>
          )}
        </MobileBar>
      ) : null}

      {picker && q ? (
        <PhotoPicker
          bookId={book.id}
          photos={photos}
          questionId={q.id}
          questionLabel={labelOf(q)}
          onAttach={(id) => {
            setSelectedPhotoId(id);
            void patchPhoto(id, { questionId: q.id });
          }}
          onDetach={(id) => patchPhoto(id, { questionId: null })}
          onUploaded={inlinePhotos.addUploaded}
          onClose={() => setPicker(false)}
          otherLabel={(qid) => {
            const other = questions.find((x) => x.id === qid);
            return other ? labelOf(other) : t.otherAnswer;
          }}
        />
      ) : null}

      {drawer ? (
        <Drawer title={blank ? t.blank.drawerTitle : undefined} onClose={() => setDrawer(false)}>
          <ChapterNav {...navProps} />
        </Drawer>
      ) : null}
    </div>
  );
}
