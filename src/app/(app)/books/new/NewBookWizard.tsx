"use client";

import { useActionState, useState } from "react";
import { ArrowLeft, Check } from "lucide-react";
import { createBookAction, type CreateState } from "../actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";
import { CoverPreview } from "@/components/cover/CoverPreview";
import { OccasionPicker } from "@/components/OccasionPicker";
import { cn } from "@/lib/utils";
import { useMessages } from "@/i18n/client";
import { localeMeta, locales, type Locale } from "@/i18n/config";
import type { ThemeId } from "@/lib/content/types";
import type { Gender } from "@/lib/db/schema";

export interface WizardTheme {
  id: ThemeId;
  name: string;
  description: string;
  questions: number;
  recipientLabel: string;
  recipientPlaceholder: string;
  recipientGender?: Gender;
  defaultRecipientGender: Gender;
  /** Варианты названия на каждом из языков книги. */
  titleSuggestions: Record<Locale, string[]>;
  defaultCover: string;
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
    return (
      <div>
        <h1 className="font-serif text-4xl font-medium sm:text-5xl">{t.whoTitle}</h1>
        <p className="mt-3 text-lg text-muted">{t.whoText}</p>
        <div className="mt-10 grid gap-5 sm:grid-cols-2">
          {themes.map((th) => (
            <button key={th.id} type="button" onClick={() => selectTheme(th)} className="card group flex items-center gap-5 p-5 text-left transition hover:-translate-y-0.5 hover:shadow-lift">
              <div className="w-24 shrink-0">
                <CoverPreview template={th.defaultCover} title={th.titleSuggestions[language][0]} lite className="rounded-[3px] shadow-book" />
              </div>
              <div>
                <div className="text-xl font-semibold">{th.name}</div>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{th.description}</p>
                <div className="mt-3 text-xs font-medium text-wine">{t.questions(th.questions)}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const names = [authorName, recipientName].filter(Boolean).join(" & ");
  return (
    <div className="grid gap-12 lg:grid-cols-[1fr_300px]">
      <form action={action} className="space-y-7">
        <button type="button" onClick={() => setThemeId(null)} className="flex items-center gap-1.5 text-sm text-muted hover:text-ink">
          <ArrowLeft className="size-4" /> {theme.name}
        </button>
        <div>
          <h1 className="font-serif text-4xl font-medium sm:text-5xl">{t.detailsTitle}</h1>
          <p className="mt-3 text-muted">{t.detailsText}</p>
        </div>
        {state.error ? <Alert>{state.error}</Alert> : null}
        <input type="hidden" name="theme" value={theme.id} />
        <input type="hidden" name="language" value={language} />

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="authorName">{t.authorName}</label>
            <input className="input" id="authorName" name="authorName" value={authorName} onChange={(e) => setAuthorName(e.target.value)} maxLength={60} required />
          </div>
          <div>
            <span className="label">{t.authorAs}</span>
            <GenderToggle name="authorGender" value={authorGender} onChange={setAuthorGender} labels={t.genders.author} />
          </div>
          <div>
            <label className="label" htmlFor="recipientName">{theme.recipientLabel}</label>
            <input className="input" id="recipientName" name="recipientName" placeholder={theme.recipientPlaceholder} value={recipientName} onChange={(e) => setRecipientName(e.target.value)} maxLength={60} required />
          </div>
          {theme.recipientGender ? (
            <input type="hidden" name="recipientGender" value={theme.recipientGender} />
          ) : (
            <div>
              <span className="label">{t.recipientFor}</span>
              <GenderToggle name="recipientGender" value={recipientGender} onChange={setRecipientGender} labels={t.genders.recipient} />
            </div>
          )}
        </div>

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
          <p className="mt-2 text-sm text-muted">{t.languageHint}</p>
        </div>

        <div>
          <label className="label" htmlFor="title">{t.bookTitle}</label>
          <input className="input" id="title" name="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
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

        <div>
          <span className="label">{t.occasion} <span className="font-normal text-muted">{t.optional}</span></span>
          <p className="-mt-1 mb-3 text-sm text-muted">{t.occasionHint}</p>
          <OccasionPicker />
        </div>

        <SubmitButton className="btn-lg w-full sm:w-auto" pendingText={t.pending}>{t.submit}</SubmitButton>
      </form>
      <div className="hidden lg:block">
        <div className="sticky top-28">
          <CoverPreview template={theme.defaultCover} title={title} names={names} titlePlaceholder={t.bookTitle} className="rounded-[3px] shadow-book" />
          <p className="mt-4 text-center text-sm text-muted">{t.coverNote}</p>
        </div>
      </div>
    </div>
  );
}
