"use client";

import { BookOpen, Plus } from "lucide-react";
import { Link, useMessages } from "@/i18n/client";
import { CHAPTER_TITLE_MAX } from "@/lib/content/kinds";

/** Что показать вместо листа, когда редактировать нечего. */
export type EmptyMode = "noChapters" | "noSections" | "noQuestions";

/**
 * Пустое состояние редактора: у своей книги ни одной главы («Создайте первую главу») или ни одного раздела («Добавьте
 * первый раздел»), у остальных — книга без вопросов (после сбоя, редкость). Редактор не падает ни в одном из них.
 */
export function EmptyEditor({ mode, bookId, editable, busy, onCreateChapter, onAddSection }: { mode: EmptyMode; bookId: string; editable: boolean; busy: boolean; onCreateChapter: (title: string) => void; onAddSection: () => void }) {
  const t = useMessages().editor.empty;
  const text = t[mode];
  return (
    <article className="rounded-[28px] border border-line/70 bg-white px-6 py-10 text-center shadow-soft sm:px-10 sm:py-14">
      <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-rose/70 text-wine">
        <BookOpen className="size-6" />
      </div>
      <h1 className="mt-4 font-serif text-2xl font-medium text-ink sm:text-3xl">{text.title}</h1>
      <p className="mx-auto mt-2 max-w-md text-[15px] leading-relaxed text-muted">{text.text}</p>
      {mode === "noChapters" && editable ? (
        <form
          className="mx-auto mt-6 flex max-w-md flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            const title = new FormData(e.currentTarget).get("title");
            onCreateChapter(typeof title === "string" ? title.trim() : "");
          }}
        >
          <input name="title" autoFocus maxLength={CHAPTER_TITLE_MAX} className="input" placeholder={t.noChapters.placeholder} aria-label={t.noChapters.placeholder} />
          <button className="btn btn-primary shrink-0" disabled={busy}>
            <Plus className="size-4" /> {t.noChapters.create}
          </button>
        </form>
      ) : null}
      {mode === "noSections" && editable ? (
        <button className="btn btn-primary mt-6" disabled={busy} onClick={onAddSection}>
          <Plus className="size-4" /> {t.noSections.create}
        </button>
      ) : null}
      {mode === "noQuestions" ? (
        <Link href={`/books/${bookId}`} className="btn btn-primary mt-6">
          {t.noQuestions.back}
        </Link>
      ) : null}
    </article>
  );
}
