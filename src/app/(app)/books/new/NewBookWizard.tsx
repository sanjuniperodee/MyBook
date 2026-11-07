"use client";

import { useActionState, useRef, useState } from "react";
import { ArrowLeft, Check } from "lucide-react";
import { createBookAction, type CreateState } from "../actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";
import { CoverFace } from "@/components/cover/CoverFace";
import type { CoverMeta } from "@/lib/book/covers/meta";
import { OccasionPicker } from "@/components/OccasionPicker";
import { cn } from "@/lib/class-names";
import { useMessages } from "@/i18n/client";
import { localeMeta, locales, type Locale } from "@/i18n/config";
import type { ThemeId } from "@/lib/content/types";
import { CHAPTER_TITLE_MAX, RECORDED_BY_MAX, type BookKind, type RecipientPolicy } from "@/lib/content/kinds";
import { coverNames } from "@/lib/book/cover-names";
import type { Gender } from "@/modules/authoring/domain";

export interface WizardTheme {
  id: ThemeId;
  /** Вид книги (kinds.ts): подарок, автобиография, своя книга. */
  kind: BookKind;
  /** Нужен ли получатель: подарок — обязателен, своя книга — по желанию, автобиография — нет. */
  recipient: RecipientPolicy;
  name: string;
  description: string;
  /** Вопросов в банке; у своей книги 0 — банка нет. */
  questions: number;
  recipientLabel?: string;
  recipientPlaceholder?: string;
  recipientGender?: Gender;
  /** Спрашивать ли род адресата; у книги родителям — нет (их двое, банк во множественном числе). */
  recipientGenderChoice?: boolean;
  defaultRecipientGender: Gender;
  /** Варианты названия на каждом из языков книги. */
  titleSuggestions: Record<Locale, string[]>;
  /** Название первой главы по умолчанию на каждом языке (только своя книга) — подсказка в поле. */
  firstChapterTitle: Record<Locale, string>;
  /** Обложка темы по умолчанию — метаданные шаблона (coverMeta). */
  defaultCover: CoverMeta;
}

type WizardMessages = ReturnType<typeof useMessages>["books"]["wizard"];

/** Шаги мастера: выбор книги, имена, название и повод. Первый шаг — каталог тем, остальные — одна форма. */
const STEPS = 3;
type Step = 0 | 1 | 2;
/** Поля, которые мастер проверяет сам (до отправки на сервер): ошибка показывается у поля. */
type FieldId = "authorName" | "recipientName" | "title";

/** Переключатель из двух-трёх вариантов: подложка и выбранный вариант белым — как Segmented в CRM, но под палец. */
function Choice<T extends string>({ value, options, onChange, label, labelledBy, className }: { value: T; options: { id: T; label: string; lang?: string }[]; onChange: (v: T) => void; label?: string; labelledBy?: string; className?: string }) {
  return (
    <div role="radiogroup" aria-label={label} aria-labelledby={labelledBy} className={cn("grid gap-1 rounded-[var(--r-panel)] bg-sunken p-1", className)} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          lang={o.lang}
          onClick={() => onChange(o.id)}
          className={cn("min-h-11 rounded-[var(--r-ctl)] px-3 py-2 text-sm font-medium transition-colors sm:min-h-10", value === o.id ? "border border-line bg-white text-ink" : "border border-transparent text-muted hover:text-ink")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Название и описание карточки: у подарков — из темы, у автобиографии и своей книги — из словаря мастера. */
function themeCopy(th: WizardTheme, t: WizardMessages) {
  return th.kind === "gift" ? { name: th.name, description: th.description } : t.cards[th.kind];
}

function ThemeCard({ th, language, t, selected, onPick }: { th: WizardTheme; language: Locale; t: WizardMessages; selected: boolean; onPick: (th: WizardTheme) => void }) {
  const copy = themeCopy(th, t);
  return (
    // Тема — как книга на полке: обложка в настоящих пропорциях, под ней кому, о чём и сколько вопросов.
    <button type="button" onClick={() => onPick(th)} data-theme={th.id} aria-pressed={selected} className="group block w-full rounded-[6px] text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-wine">
      <div className={cn("rounded-[4px] transition-transform duration-300 ease-[var(--ease-out-soft)] group-hover:-translate-y-1", selected && "ring-2 ring-wine ring-offset-4 ring-offset-paper")}>
        <CoverFace template={th.defaultCover} title={th.titleSuggestions[language][0]} lite className="rounded-[3px] shadow-book" />
      </div>
      <div className="mt-4 text-[17px] leading-snug font-semibold group-hover:text-wine">{copy.name}</div>
      <p className="mt-1 line-clamp-3 text-[13px] leading-relaxed text-muted">{copy.description}</p>
      <div className="mt-1.5 text-xs text-ink-soft">{th.kind === "blank" ? t.noQuestions : t.questions(th.questions)}</div>
    </button>
  );
}

/** Полоса шагов: пройденные — винные с галочкой (по ним можно вернуться), текущий — с обводкой. На телефоне подписи только у текущего. */
function Stepper({ step, labels, ariaLabel, onGo }: { step: Step; labels: string[]; ariaLabel: string; onGo: (s: Step) => void }) {
  return (
    <nav aria-label={ariaLabel}>
      <ol className="flex items-center gap-2 sm:gap-3">
        {labels.map((label, i) => {
          const done = i < step;
          const here = i === step;
          return (
            <li key={label} className={cn("flex items-center gap-2 sm:gap-3", i < labels.length - 1 && "flex-1")}>
              <button
                type="button"
                disabled={!done}
                onClick={() => onGo(i as Step)}
                aria-current={here ? "step" : undefined}
                className="flex min-h-11 shrink-0 items-center gap-2 rounded-[var(--r-ctl)] text-left disabled:cursor-default"
              >
                <span
                  className={cn(
                    "flex size-7 items-center justify-center rounded-full text-[13px] font-medium tabular-nums",
                    done ? "bg-wine text-white" : here ? "border-2 border-wine text-wine" : "border-2 border-line-strong text-muted",
                  )}
                >
                  {done ? <Check className="size-3.5" strokeWidth={3} aria-hidden /> : i + 1}
                </span>
                <span className={cn("text-sm font-medium", here ? "text-ink" : "text-muted", !here && "max-sm:sr-only")}>{label}</span>
              </button>
              {i < labels.length - 1 ? <span aria-hidden className={cn("h-0.5 flex-1 rounded-full", i < step ? "bg-wine" : "bg-line-strong")} /> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function NewBookWizard({ themes, defaultTheme, defaultAuthor, defaultLanguage }: { themes: WizardTheme[]; defaultTheme?: ThemeId; defaultAuthor: string; defaultLanguage: Locale }) {
  const [state, action] = useActionState<CreateState, FormData>(createBookAction, {});
  const m = useMessages();
  const t = m.books.wizard;
  const [language, setLanguage] = useState<Locale>(defaultLanguage);
  const [themeId, setThemeId] = useState<ThemeId | null>(defaultTheme ?? null);
  // Пришли со ссылкой «?theme=…» — каталог пропускаем и сразу спрашиваем имена.
  const [step, setStep] = useState<Step>(defaultTheme ? 1 : 0);
  const [errors, setErrors] = useState<FieldId[]>([]);
  const [authorName, setAuthorName] = useState(defaultAuthor);
  const [authorGender, setAuthorGender] = useState<Gender>("f");
  const [recipientName, setRecipientName] = useState("");
  const theme = themes.find((t) => t.id === themeId);
  const [recipientGender, setRecipientGender] = useState<Gender>(theme?.defaultRecipientGender ?? "m");
  const [title, setTitle] = useState(theme?.titleSuggestions[defaultLanguage][0] ?? "");
  // Автобиография: своя история или чужая, записанная со слов близкого (тогда автор книги — рассказчик, а не вошедший).
  const [storyOther, setStoryOther] = useState(false);
  const [narratorName, setNarratorName] = useState("");
  const [recordedBy, setRecordedBy] = useState("");
  const [dedication, setDedication] = useState("");
  const [firstChapter, setFirstChapter] = useState("");
  const top = useRef<HTMLDivElement>(null);
  const suggestions = theme?.titleSuggestions[language] ?? [];

  const goTo = (s: Step) => {
    setStep(s);
    // С нового шага — к его началу: на телефоне форма длиннее экрана.
    requestAnimationFrame(() => top.current?.scrollIntoView({ block: "start", behavior: "smooth" }));
  };

  const selectTheme = (th: WizardTheme) => {
    if (th.id !== themeId) {
      setThemeId(th.id);
      setRecipientGender(th.recipientGender ?? th.defaultRecipientGender);
      setTitle(th.titleSuggestions[language][0]);
      setStoryOther(false);
    }
    setErrors([]);
    goTo(1);
  };

  // Сменили язык книги — предложенное название тоже переводим (своё название не трогаем).
  const selectLanguage = (l: Locale) => {
    if (theme && (!title || theme.titleSuggestions[language].includes(title))) setTitle(theme.titleSuggestions[l][Math.max(0, theme.titleSuggestions[language].indexOf(title))]);
    setLanguage(l);
  };

  const gifts = themes.filter((th) => th.kind === "gift");
  const own = themes.filter((th) => th.kind !== "gift");
  const grid = "mt-5 grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 sm:gap-x-8 lg:grid-cols-4 xl:grid-cols-5";
  /** Первый шаг: каталог книг. Если тема уже выбрана, форма ниже остаётся в дереве (скрытая) — введённое не теряется. */
  const catalog = (
    <div>
      <Stepper step={0} labels={[t.steps.theme, t.steps.names, t.steps.title]} ariaLabel={t.stepsAria} onGo={goTo} />
      <h1 className="mt-8 font-serif text-4xl leading-tight font-medium sm:text-5xl">{t.whoTitle}</h1>
      <p className="mt-3 max-w-2xl text-[17px] leading-relaxed text-muted">{t.whoText}</p>
      <h2 className="mt-10 font-serif text-2xl font-medium sm:mt-14">{t.groups.gift}</h2>
      <div className={grid}>
        {gifts.map((th) => (
          <ThemeCard key={th.id} th={th} language={language} t={t} selected={th.id === themeId} onPick={selectTheme} />
        ))}
      </div>
      {own.length ? (
        <>
          <h2 className="mt-14 font-serif text-2xl font-medium sm:mt-16">{t.groups.own}</h2>
          <div className={grid}>
            {own.map((th) => (
              <ThemeCard key={th.id} th={th} language={language} t={t} selected={th.id === themeId} onPick={selectTheme} />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
  if (!theme)
    return (
      <div ref={top} className="scroll-mt-20">
        {catalog}
      </div>
    );

  const kind = theme.kind;
  const copy = themeCopy(theme, t);
  const asNarrator = kind === "autobiography" && storyOther;
  // Имя автора на обложке — имя рассказчика: у истории близкого это не вошедший пользователь.
  const effectiveAuthor = asNarrator ? narratorName : authorName;
  const names = coverNames({ theme: theme.id, authorName: effectiveAuthor, recipientName, hideRecipientOnCover: false });

  /** Какие обязательные поля шага пусты. Проверяем сами, а не браузером: ошибка стоит у поля, а не всплывает пузырём. */
  const missing = (s: Step): FieldId[] => {
    const out: FieldId[] = [];
    if (s === 1) {
      if (!effectiveAuthor.trim()) out.push("authorName");
      if (theme.recipient === "required" && !recipientName.trim()) out.push("recipientName");
    }
    if (s === 2 && kind === "blank" && !title.trim()) out.push("title");
    return out;
  };
  const showErrors = (fields: FieldId[]) => {
    setErrors(fields);
    requestAnimationFrame(() => document.getElementById(fields[0])?.focus());
  };
  const next = () => {
    const bad = missing(step);
    if (bad.length) return showErrors(bad);
    setErrors([]);
    goTo(2);
  };
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    // Enter в поле первого шага не должен создавать книгу — он ведёт дальше.
    if (step < 2) {
      e.preventDefault();
      next();
      return;
    }
    const bad = [...missing(1), ...missing(2)];
    if (bad.length) {
      e.preventDefault();
      if (missing(1).length) setStep(1);
      showErrors(bad);
    }
  };
  const error = (id: FieldId) => {
    if (!errors.includes(id)) return {};
    return { "aria-invalid": true, "aria-describedby": `${id}-error` } as const;
  };
  const errorText = (id: FieldId, text: string) =>
    errors.includes(id) ? (
      <span id={`${id}-error`} className="field-error" role="alert">
        {text}
      </span>
    ) : null;
  const heading = step === 1 ? (kind === "blank" ? t.stepTitles.namesBlank : t.stepTitles.names) : t.stepTitles.title;

  return (
    <div ref={top} className="scroll-mt-20">
      {step === 0 ? catalog : null}
      <div hidden={step === 0} className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-14">
        <form action={action} onSubmit={submit} noValidate className="min-w-0">
          <Stepper step={step} labels={[t.steps.theme, t.steps.names, t.steps.title]} ariaLabel={t.stepsAria} onGo={goTo} />

          {/* Живое превью на телефоне: мини-обложка и то, что на ней напечатано. На широком экране оно справа. */}
          <div className="mt-6 flex items-center gap-4 rounded-[var(--r-panel)] border border-line bg-white p-3 lg:hidden">
            <div className="w-14 shrink-0">
              <CoverFace template={theme.defaultCover} title={title} names={names} titlePlaceholder={t.bookTitle} lite className="rounded-[2px] shadow-book" />
            </div>
            <div className="min-w-0">
              <div className="text-xs text-muted">{copy.name}</div>
              <div className="truncate font-serif text-xl leading-tight font-medium">{title || t.bookTitle}</div>
              {names ? <div className="truncate text-sm text-muted">{names}</div> : null}
            </div>
          </div>

          <div className="mt-8">
            <div className="text-sm text-muted">{t.stepOf(step + 1, STEPS)}</div>
            <h1 className="mt-1 font-serif text-4xl leading-tight font-medium sm:text-5xl">{heading}</h1>
            <p className="mt-3 max-w-xl text-muted">{step === 2 ? t.titleText : kind === "blank" ? t.detailsTextBlank : t.detailsText}</p>
          </div>

          <div className="mt-8 space-y-7">
            {state.error ? <Alert>{state.error}</Alert> : null}
            <input type="hidden" name="theme" value={theme.id} />
            <input type="hidden" name="language" value={language} />

            {/* Шаг 2: имена. Скрытый шаг остаётся в форме — его значения уйдут вместе с остальными. */}
            <div hidden={step !== 1}>
              <div className="space-y-7">
                {kind === "autobiography" ? (
                  <div>
                    <span className="label" id="story-label">
                      {t.story.title}
                    </span>
                    <Choice
                      labelledBy="story-label"
                      value={storyOther ? "other" : "own"}
                      onChange={(v) => setStoryOther(v === "other")}
                      options={[
                        { id: "own", label: t.story.own },
                        { id: "other", label: t.story.other },
                      ]}
                      className="sm:grid-cols-2"
                    />
                  </div>
                ) : null}

                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="authorName">
                      {asNarrator ? t.story.narratorName : kind === "blank" ? t.blank.authorName : t.authorName}
                    </label>
                    <input
                      className="input"
                      id="authorName"
                      name="authorName"
                      value={effectiveAuthor}
                      placeholder={asNarrator ? t.story.narratorNamePlaceholder : undefined}
                      onChange={(e) => (asNarrator ? setNarratorName(e.target.value) : setAuthorName(e.target.value))}
                      maxLength={60}
                      required
                      {...error("authorName")}
                    />
                    {errorText("authorName", t.errors.authorName)}
                  </div>
                  {kind === "blank" ? (
                    // В своей книге нет склоняемых текстов — род автора ничего не меняет, поле не показываем.
                    <input type="hidden" name="authorGender" value={authorGender} />
                  ) : (
                    <div>
                      <span className="label" id="author-gender-label">
                        {asNarrator ? t.story.narratorAs : t.authorAs}
                      </span>
                      <input type="hidden" name="authorGender" value={authorGender} />
                      <Choice
                        labelledBy="author-gender-label"
                        value={authorGender}
                        onChange={setAuthorGender}
                        options={[
                          { id: "m", label: t.genders.author[0] },
                          { id: "f", label: t.genders.author[1] },
                        ]}
                      />
                    </div>
                  )}
                  {theme.recipient !== "none" ? (
                    <div>
                      <label className="label" htmlFor="recipientName">
                        {theme.recipientLabel}
                      </label>
                      <input
                        className="input"
                        id="recipientName"
                        name="recipientName"
                        placeholder={theme.recipientPlaceholder}
                        value={recipientName}
                        onChange={(e) => setRecipientName(e.target.value)}
                        maxLength={60}
                        required={theme.recipient === "required"}
                        {...error("recipientName")}
                      />
                      {errorText("recipientName", t.errors.recipientName)}
                    </div>
                  ) : null}
                  {theme.recipient !== "required" ? null : theme.recipientGender ? (
                    <input type="hidden" name="recipientGender" value={theme.recipientGender} />
                  ) : theme.recipientGenderChoice === false ? (
                    // Родителям — вдвоём: род адресата не спрашиваем, в банке вопросов его нет.
                    <input type="hidden" name="recipientGender" value={theme.defaultRecipientGender} />
                  ) : (
                    <div>
                      <span className="label" id="recipient-gender-label">
                        {t.recipientFor}
                      </span>
                      <input type="hidden" name="recipientGender" value={recipientGender} />
                      <Choice
                        labelledBy="recipient-gender-label"
                        value={recipientGender}
                        onChange={setRecipientGender}
                        options={[
                          { id: "m", label: t.genders.recipient[0] },
                          { id: "f", label: t.genders.recipient[1] },
                        ]}
                      />
                    </div>
                  )}
                </div>

                {kind === "autobiography" ? (
                  <div className="grid gap-5 sm:grid-cols-2">
                    {storyOther ? (
                      <div>
                        <label className="label" htmlFor="recordedBy">
                          {t.story.recordedBy} <span className="font-normal text-muted">{t.optional}</span>
                        </label>
                        <input className="input" id="recordedBy" name="recordedBy" value={recordedBy} onChange={(e) => setRecordedBy(e.target.value)} placeholder={t.story.recordedByPlaceholder} maxLength={RECORDED_BY_MAX} />
                        <p className="hint">{t.story.recordedByHint}</p>
                      </div>
                    ) : null}
                    <div className={storyOther ? undefined : "sm:col-span-2"}>
                      <label className="label" htmlFor="dedication">
                        {t.story.dedication} <span className="font-normal text-muted">{t.optional}</span>
                      </label>
                      <input className="input" id="dedication" name="dedication" value={dedication} onChange={(e) => setDedication(e.target.value)} placeholder={t.story.dedicationPlaceholder} maxLength={600} />
                      <p className="hint">{t.story.dedicationHint}</p>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Шаг 3: название, язык, первая глава своей книги и повод. */}
            <div hidden={step !== 2}>
              <div className="space-y-7">
                <div>
                  <label className="label" htmlFor="title">
                    {t.bookTitle}
                  </label>
                  <input className="input" id="title" name="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} required={kind === "blank"} {...error("title")} />
                  {errorText("title", t.errors.title)}
                  {kind === "blank" ? <p className="hint">{t.blank.titleHint}</p> : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {suggestions.map((s) => (
                      <button key={s} type="button" className="chip" aria-pressed={title === s} onClick={() => setTitle(s)}>
                        {title === s ? <Check className="size-3.5" aria-hidden /> : null}
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                {kind === "blank" ? (
                  <div>
                    <label className="label" htmlFor="firstChapterTitle">
                      {t.blank.firstChapter} <span className="font-normal text-muted">{t.optional}</span>
                    </label>
                    <input className="input" id="firstChapterTitle" name="firstChapterTitle" value={firstChapter} onChange={(e) => setFirstChapter(e.target.value)} placeholder={theme.firstChapterTitle[language]} maxLength={CHAPTER_TITLE_MAX} />
                    <p className="hint">{t.blank.firstChapterHint}</p>
                  </div>
                ) : null}

                <div>
                  <span className="label" id="language-label">
                    {t.language}
                  </span>
                  <Choice
                    labelledBy="language-label"
                    value={language}
                    onChange={selectLanguage}
                    options={locales.map((l) => ({ id: l, label: localeMeta[l].label, lang: l }))}
                    className="max-w-sm"
                  />
                  <p className="hint">{kind === "blank" ? t.languageHintBlank : t.languageHint}</p>
                </div>

                <div>
                  <span className="label">
                    {t.occasion} <span className="font-normal text-muted">{t.optional}</span>
                  </span>
                  <p className="-mt-1 mb-3 text-sm text-muted">{t.occasionHint}</p>
                  <OccasionPicker theme={theme.id} />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-10 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button type="button" onClick={() => goTo((step - 1) as Step)} aria-label={step === 1 ? t.back : undefined} className="btn btn-ghost max-sm:w-full">
              <ArrowLeft className="size-4" aria-hidden /> {step === 1 ? copy.name : t.prev}
            </button>
            {step === 1 ? (
              <button type="button" onClick={next} className="btn btn-primary btn-lg max-sm:w-full">
                {t.next}
              </button>
            ) : (
              <SubmitButton className="btn-lg max-sm:w-full" pendingText={t.pending}>
                {t.submit}
              </SubmitButton>
            )}
          </div>
        </form>

        {/* Живое превью на компьютере: обложка и название меняются вместе с полями. */}
        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <div className="rounded-[var(--r-panel)] bg-sunken px-8 py-9">
              <CoverFace template={theme.defaultCover} title={title} names={names} titlePlaceholder={t.bookTitle} className="rounded-[3px] shadow-book" />
            </div>
            <div className="mt-4 text-center">
              <div className="text-sm font-medium">{t.previewTitle}</div>
              <p className="mt-0.5 text-sm text-muted">{t.coverNote}</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
