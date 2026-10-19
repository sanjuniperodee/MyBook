"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { Link, useMessages } from "@/i18n/client";
import { sectionLabel, type EditorQuestion } from "@/lib/book/editor-model";
import type { BookKind } from "@/lib/content/kinds";
import type { EditorBook, EditorChapter, EditorPhoto } from "@/lib/book/editor-model";
import type { LetterLike } from "@/lib/book/layout";
import { useBookPages } from "./usePageEstimate";

/**
 * Переход между вопросами на компьютере: назад, вперёд («Пропустить», если ответа нет) или к книге после
 * последнего вопроса — дописав черновик.
 */
export function QuestionPager({ bookId, kind, prev, next, answered, onGo, onFinish }: { bookId: string; kind: BookKind; prev?: EditorQuestion; next?: EditorQuestion; answered: boolean; onGo: (step: -1 | 1) => void; onFinish: () => void }) {
  const m = useMessages();
  const t = m.editor;
  const label = (q: EditorQuestion) => sectionLabel(q, kind, m.books.untitledSection);
  return (
    <div className="mt-5 grid grid-cols-2 gap-3 max-lg:hidden">
      <button
        onClick={() => onGo(-1)}
        disabled={!prev}
        className="group flex min-w-0 items-center gap-3 rounded-2xl border border-line bg-white/60 p-4 text-left transition hover:border-ink/30 disabled:opacity-40"
        title="Ctrl + Shift + Enter"
      >
        <ArrowLeft className="size-5 shrink-0 text-muted transition group-hover:-translate-x-0.5" />
        <span className="min-w-0">
          <span className="block text-xs text-muted">{t.prev}</span>
          <span className="block truncate text-sm">{prev ? label(prev) : "—"}</span>
        </span>
      </button>
      {next ? (
        <button onClick={() => onGo(1)} className="group flex min-w-0 items-center justify-end gap-3 rounded-2xl bg-ink p-4 text-right text-white transition hover:bg-ink-soft" title="Ctrl + Enter">
          <span className="min-w-0">
            <span className="block text-xs text-white/60">{kind === "blank" ? t.blank.nextSection : answered ? t.next : t.skip}</span>
            <span className="block truncate text-sm">{label(next)}</span>
          </span>
          <ArrowRight className="size-5 shrink-0 transition group-hover:translate-x-0.5" />
        </button>
      ) : (
        <Link href={`/books/${bookId}/preview`} onClick={onFinish} className="flex items-center justify-end gap-3 rounded-2xl bg-wine p-4 text-white">
          <span className="text-sm font-medium">{t.toPreview}</span>
          <ArrowRight className="size-5" />
        </Link>
      )}
    </div>
  );
}

/** Сколько вопросов с ответом и подсказка про Ctrl + Enter — под превью. */
export function ProgressCard({ answered, total }: { answered: number; total: number }) {
  const t = useMessages().editor;
  return (
    <div className="rounded-2xl border border-line p-4 text-xs leading-relaxed text-muted">
      <div className="mb-1 text-sm font-medium text-ink">{t.answeredOf(answered, total)}</div>
      {t.notAll}
      <div className="mt-3 border-t border-line pt-3">
        <kbd className="rounded border border-line bg-white px-1">Ctrl</kbd> + <kbd className="rounded border border-line bg-white px-1">Enter</kbd> {t.nextShortcut}
      </div>
    </div>
  );
}

/** Своя книга: сколько разделов с текстом и на сколько страниц это тянет; пустые главы в книгу не попадут. */
export function BlankProgress({ book, questions, photos, letters, chapters }: { book: EditorBook; questions: EditorQuestion[]; photos: EditorPhoto[]; letters: LetterLike[]; chapters: EditorChapter[] }) {
  const t = useMessages().editor;
  const pages = useBookPages(book, questions, photos, letters, chapters);
  const written = questions.filter((q) => q.answer.trim()).length;
  return (
    <div className="rounded-2xl border border-line p-4 text-xs leading-relaxed text-muted">
      <div className="mb-1 text-sm font-medium text-ink">{t.blank.progress(written, pages.printed || 0)}</div>
      {t.blank.emptyChaptersNote}
      <div className="mt-3 border-t border-line pt-3">
        <kbd className="rounded border border-line bg-white px-1">Ctrl</kbd> + <kbd className="rounded border border-line bg-white px-1">Enter</kbd> {t.blank.nextShortcut}
      </div>
    </div>
  );
}
