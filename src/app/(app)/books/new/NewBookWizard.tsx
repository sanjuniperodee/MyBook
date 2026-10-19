"use client";

import { useActionState, useState } from "react";
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
  defaultRecipientGender: Gender;
  /** Варианты названия на каждом из языков книги. */
  titleSuggestions: Record<Locale, string[]>;
  /** Название первой главы по умолчанию на каждом языке (только своя книга) — подсказка в поле. */
  firstChapterTitle: Record<Locale, string>;
  /** Обложка темы по умолчанию — метаданные шаблона (coverMeta). */
  defaultCover: CoverMeta;
}

function GenderToggle({ name, value, onChange, labels }: { name: string; value: Gender; onChange: (g: Gender) => void; labels: [string, string] }) {
  return (
    <div className="grid grid-cols-2 gap-2 rounded-2xl bg-cream/70 p-1">
      <input type="hidden" name={name} value={value} />
      {(["m", "f"] as const).map((g, i) => (
        <button
          key={g}
          type="button"
          onClick={() => onChange(g)}
          className={cn("h-10 rounded-xl text-sm font-medium transition", value === g ? "bg-white shadow-soft" : "text-muted hover:text-ink")}
        >
          {labels[i]}
        </button>
      ))}
    </div>
  );
}

type WizardMessages = ReturnType<typeof useMessages>["books"]["wizard"];

/** Название и описание карточки: у подарков — из темы, у автобиографии и своей книги — из словаря мастера. */
function themeCopy(th: WizardTheme, t: WizardMessages) {
  return th.kind === "gift" ? { name: th.name, description: th.description } : t.cards[th.kind];
}

function ThemeCard({ th, language, t, onPick }: { th: WizardTheme; language: Locale; t: WizardMessages; onPick: (th: WizardTheme) => void }) {
  const copy = themeCopy(th, t);
  return (
    <button type="button" onClick={() => onPick(th)} data-theme={th.id} className="card group flex items-center gap-5 p-5 text-left transition hover:-translate-y-0.5 hover:shadow-lift">
      <div className="w-24 shrink-0">
        <CoverFace template={th.defaultCover} title={th.titleSuggestions[language][0]} lite className="rounded-[3px] shadow-book" />
      </div>
      <div>
        <div className="text-xl font-semibold">{copy.name}</div>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">{copy.description}</p>
        <div className="mt-3 text-xs font-medium text-wine">{th.kind === "blank" ? t.noQuestions : t.questions(th.questions)}</div>
      </div>
    </button>
  );
}

export function NewBookWizard({ themes, defaultTheme, defaultAuthor, defaultLanguage }: { themes: WizardTheme[]; defaultTheme?: ThemeId; defaultAuthor: string; defaultLanguage: Locale }) {
  const [state, action] = useActionState<CreateState, FormData>(createBookAction, {});
  const m = useMessages();
  const t = m.books.wizard;
  const [language, setLanguage] = useState<Locale>(defaultLanguage);
  const [themeId, setThemeId] = useState<ThemeId | null>(defaultTheme ?? null);
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
  const suggestions = theme?.titleSuggestions[language] ?? [];

  const selectTheme = (th: WizardTheme) => {
    setThemeId(th.id);
    setRecipientGender(th.recipientGender ?? th.defaultRecipientGender);
    setTitle(th.titleSuggestions[language][0]);
  };

  // Сменили язык книги — предложенное название тоже переводим (своё название не трогаем).
  const selectLanguage = (l: Locale) => {
    if (theme && (!title || theme.titleSuggestions[language].includes(title))) setTitle(theme.titleSuggestions[l][Math.max(0, theme.titleSuggestions[language].indexOf(title))]);
    setLanguage(l);
  };

  if (!theme) {
    const gifts = themes.filter((th) => th.kind === "gift");
    const own = themes.filter((th) => th.kind !== "gift");
    return (
      <div>
        <h1 className="font-serif text-3xl font-medium sm:text-5xl">{t.whoTitle}</h1>
        <p className="mt-3 text-lg text-muted">{t.whoText}</p>
        <h2 className="mt-8 text-sm font-semibold tracking-wide text-muted uppercase sm:mt-12">{t.groups.gift}</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 sm:gap-5">
          {gifts.map((th) => (
            <ThemeCard key={th.id} th={th} language={language} t={t} onPick={selectTheme} />
          ))}
        </div>
        {own.length ? (
          <>
            <h2 className="mt-8 text-sm font-semibold tracking-wide text-muted uppercase sm:mt-10">{t.groups.own}</h2>
            <div className="mt-3 grid gap-4 sm:grid-cols-2 sm:gap-5">
              {own.map((th) => (
                <ThemeCard key={th.id} th={th} language={language} t={t} onPick={selectTheme} />
              ))}
            </div>
          </>
        ) : null}
      </div>
    );
  }

  const kind = theme.kind;
  const copy = themeCopy(theme, t);
  const asNarrator = kind === "autobiography" && storyOther;
  // Имя автора на обложке — имя рассказчика: у истории близкого это не вошедший пользователь.
  const effectiveAuthor = asNarrator ? narratorName : authorName;
  const names = coverNames({ theme: theme.id, authorName: effectiveAuthor, recipientName, hideRecipientOnCover: false });
  return (
    <div className="grid gap-12 lg:grid-cols-[1fr_300px]">
      <form action={action} className="space-y-7">
        <button type="button" onClick={() => setThemeId(null)} aria-label={t.back} className="flex items-center gap-1.5 text-sm text-muted hover:text-ink">
          <ArrowLeft className="size-4" /> {copy.name}
        </button>
        <div>
          <h1 className="font-serif text-3xl font-medium sm:text-5xl">{t.detailsTitle}</h1>
          <p className="mt-3 text-muted">{kind === "blank" ? t.detailsTextBlank : t.detailsText}</p>
        </div>
        {state.error ? <Alert>{state.error}</Alert> : null}
        <input type="hidden" name="theme" value={theme.id} />
        <input type="hidden" name="language" value={language} />

        {kind === "autobiography" ? (
          <div>
            <span className="label" id="story-label">{t.story.title}</span>
            <div className="grid gap-2 rounded-2xl bg-cream/70 p-1 sm:grid-cols-2" role="radiogroup" aria-labelledby="story-label">
              {([false, true] as const).map((other) => (
                <button
                  key={String(other)}
                  type="button"
                  role="radio"
                  aria-checked={storyOther === other}
                  onClick={() => setStoryOther(other)}
                  className={cn("min-h-10 rounded-xl px-3 py-2 text-sm font-medium transition", storyOther === other ? "bg-white shadow-soft" : "text-muted hover:text-ink")}
                >
                  {other ? t.story.other : t.story.own}
                </button>
              ))}
            </div>
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
            />
          </div>
          {kind === "blank" ? (
            // В своей книге нет склоняемых текстов — род автора ничего не меняет, поле не показываем.
            <input type="hidden" name="authorGender" value={authorGender} />
          ) : (
            <div>
              <span className="label">{asNarrator ? t.story.narratorAs : t.authorAs}</span>
              <GenderToggle name="authorGender" value={authorGender} onChange={setAuthorGender} labels={t.genders.author} />
            </div>
          )}
          {theme.recipient !== "none" ? (
            <div>
              <label className="label" htmlFor="recipientName">{theme.recipientLabel}</label>
              <input
                className="input"
                id="recipientName"
                name="recipientName"
                placeholder={theme.recipientPlaceholder}
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                maxLength={60}
                required={theme.recipient === "required"}
              />
            </div>
          ) : null}
          {theme.recipient !== "required" ? null : theme.recipientGender ? (
            <input type="hidden" name="recipientGender" value={theme.recipientGender} />
          ) : (
            <div>
              <span className="label">{t.recipientFor}</span>
              <GenderToggle name="recipientGender" value={recipientGender} onChange={setRecipientGender} labels={t.genders.recipient} />
            </div>
          )}
        </div>

        {kind === "autobiography" ? (
          <div className="grid gap-5 sm:grid-cols-2">
            {storyOther ? (
              <div>
                <label className="label" htmlFor="recordedBy">{t.story.recordedBy} <span className="font-normal text-muted">{t.optional}</span></label>
                <input className="input" id="recordedBy" name="recordedBy" value={recordedBy} onChange={(e) => setRecordedBy(e.target.value)} placeholder={t.story.recordedByPlaceholder} maxLength={RECORDED_BY_MAX} />
                <p className="mt-2 text-sm text-muted">{t.story.recordedByHint}</p>
              </div>
            ) : null}
            <div className={storyOther ? undefined : "sm:col-span-2"}>
              <label className="label" htmlFor="dedication">{t.story.dedication} <span className="font-normal text-muted">{t.optional}</span></label>
              <input className="input" id="dedication" name="dedication" value={dedication} onChange={(e) => setDedication(e.target.value)} placeholder={t.story.dedicationPlaceholder} maxLength={600} />
              <p className="mt-2 text-sm text-muted">{t.story.dedicationHint}</p>
            </div>
          </div>
        ) : null}

        <div>
          <span className="label">{t.language}</span>
          <div className="grid max-w-sm grid-cols-2 gap-2 rounded-2xl bg-cream/70 p-1" role="radiogroup" aria-label={t.language}>
            {locales.map((l) => (
              <button
                key={l}
                type="button"
                role="radio"
                aria-checked={language === l}
                lang={l}
                onClick={() => selectLanguage(l)}
                className={cn("h-10 rounded-xl text-sm font-medium transition", language === l ? "bg-white shadow-soft" : "text-muted hover:text-ink")}
              >
                {localeMeta[l].label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-sm text-muted">{kind === "blank" ? t.languageHintBlank : t.languageHint}</p>
        </div>

        <div>
          <label className="label" htmlFor="title">{t.bookTitle}</label>
          <input className="input" id="title" name="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} required={kind === "blank"} />
          {kind === "blank" ? <p className="mt-2 text-sm text-muted">{t.blank.titleHint}</p> : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setTitle(s)}
                className={cn("flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition", title === s ? "border-wine bg-wine/5 text-wine" : "border-line bg-white hover:border-ink/30")}
              >
                {title === s ? <Check className="size-3.5" /> : null}
                {s}
              </button>
            ))}
          </div>
        </div>

        {kind === "blank" ? (
          <div>
            <label className="label" htmlFor="firstChapterTitle">{t.blank.firstChapter} <span className="font-normal text-muted">{t.optional}</span></label>
            <input
              className="input"
              id="firstChapterTitle"
              name="firstChapterTitle"
              value={firstChapter}
              onChange={(e) => setFirstChapter(e.target.value)}
              placeholder={theme.firstChapterTitle[language]}
              maxLength={CHAPTER_TITLE_MAX}
            />
            <p className="mt-2 text-sm text-muted">{t.blank.firstChapterHint}</p>
          </div>
        ) : null}

        <div>
          <span className="label">{t.occasion} <span className="font-normal text-muted">{t.optional}</span></span>
          <p className="-mt-1 mb-3 text-sm text-muted">{t.occasionHint}</p>
          <OccasionPicker theme={theme.id} />
        </div>

        <SubmitButton className="btn-lg w-full sm:w-auto" pendingText={t.pending}>{t.submit}</SubmitButton>
      </form>
      <div className="hidden lg:block">
        <div className="sticky top-28">
          <CoverFace template={theme.defaultCover} title={title} names={names} titlePlaceholder={t.bookTitle} className="rounded-[3px] shadow-book" />
          <p className="mt-4 text-center text-sm text-muted">{t.coverNote}</p>
        </div>
      </div>
    </div>
  );
}
