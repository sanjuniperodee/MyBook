"use client";

import { useState } from "react";
import { Printer, Shuffle } from "lucide-react";
import { useLocale } from "@/i18n/client";
import { toolUi } from "@/lib/content/tools/ui";
import type { CardQuestion } from "@/lib/tools/cards";
import { Choice, CopyButton } from "./Choice";

/** Карточки с вопросами из банка вопросов книг. Темы и вопросы приходят с сервера на языке страницы. */
export function QuestionCards({ themes }: { themes: Record<string, CardQuestion[]> }) {
  const ui = toolUi[useLocale()].cards;
  const ids = Object.keys(themes);
  const [theme, setTheme] = useState(ids[0]);
  const [index, setIndex] = useState(0);
  const [list, setList] = useState<CardQuestion[]>([]);
  const all = themes[theme] ?? [];
  const current = all[index % Math.max(all.length, 1)];

  const draw = (n: number) => {
    const copy = [...all];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, n);
  };

  return (
    <div className="card p-6 sm:p-8">
      <span className="label">{ui.themeLabel}</span>
      <Choice
        label={ui.themeLabel}
        value={theme}
        onChange={(v) => {
          setTheme(v);
          setIndex(0);
          setList([]);
        }}
        options={ids.map((id) => ({ id, label: ui.theme[id] ?? id }))}
      />

      {current ? (
        <div className="mt-8 rounded-3xl bg-gradient-to-br from-rose/50 to-cream p-6 sm:p-10">
          {current.chapter ? (
            <div className="text-xs font-semibold tracking-[0.18em] text-wine uppercase">
              {ui.chapter}: {current.chapter}
            </div>
          ) : null}
          <p className="mt-5 min-h-[5.5rem] font-serif text-2xl leading-snug text-ink sm:text-3xl" data-testid="question-card" aria-live="polite">
            {current.text}
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-primary" onClick={() => setIndex((i) => (all.length > 1 ? (i + 1 + Math.floor(Math.random() * (all.length - 1))) % all.length : 0))}>
              {ui.next}
            </button>
            <span className="text-sm text-muted">{ui.card((index % all.length) + 1, all.length)}</span>
          </div>
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" className="btn btn-outline" onClick={() => setList(draw(10))}>
          <Shuffle className="size-4" /> {ui.shuffle}
        </button>
      </div>

      {list.length ? (
        <div className="mt-6 rounded-3xl border border-line p-6 print:border-0 print:p-0">
          <h3 className="font-serif text-2xl font-medium">{ui.tenTitle}</h3>
          <ol className="mt-4 list-decimal space-y-2 pl-5 leading-relaxed">
            {list.map((q) => (
              <li key={q.text}>{q.text}</li>
            ))}
          </ol>
          <div className="mt-5 flex flex-wrap gap-3 print:hidden">
            <CopyButton text={list.map((q, i) => `${i + 1}. ${q.text}`).join("\n")} label={ui.copyAll} done={ui.copied} />
            <button type="button" className="btn btn-outline btn-sm" onClick={() => window.print()}>
              <Printer className="size-4" /> {ui.print}
            </button>
          </div>
        </div>
      ) : null}
      <p className="mt-4 text-sm leading-relaxed text-muted print:hidden">{ui.hint}</p>
    </div>
  );
}
