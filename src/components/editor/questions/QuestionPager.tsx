"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { Link, useMessages } from "@/i18n/client";
import { sectionLabel, type EditorQuestion } from "@/lib/book/editor-model";
import type { BookKind } from "@/lib/content/kinds";
import type { EditorBook, EditorChapter, EditorPhoto } from "@/lib/book/editor-model";
import type { LetterLike } from "@/lib/book/layout";
import { useBookPages } from "./usePageEstimate";

/**
 * Переход между вопросами на компьютере — под листом, тихо: слева «Предыдущий» текстом, справа тёмная «Следующий» с названием
 * (или «Пропустить», если ответа нет) или к книге после последнего вопроса — дописав черновик. На телефоне — нижняя панель.
 */
export function QuestionPager({ bookId, kind, prev, next, answered, onGo, onFinish }: { bookId: string; kind: BookKind; prev?: EditorQuestion; next?: EditorQuestion; answered: boolean; onGo: (step: -1 | 1) => void; onFinish: () => void }) {
  const m = useMessages();
  const t = m.editor;
  const label = (q: EditorQuestion) => sectionLabel(q, kind, m.books.untitledSection);
  return (
    <nav className="mt-6 flex items-center justify-between gap-4 max-lg:hidden" aria-label={t.next}>
      <button
        onClick={() => onGo(-1)}
        disabled={!prev}
        className="group flex min-w-0 max-w-[44%] items-center gap-2 rounded-[10px] py-2 pr-3 pl-1.5 text-left text-muted transition hover:bg-ink/5 hover:text-ink disabled:pointer-events-none disabled:opacity-40"
        title="Ctrl + Shift + Enter"
      >
        <ArrowLeft className="size-4 shrink-0 transition group-hover:-translate-x-0.5" />
        <span className="min-w-0">
          <span className="block text-xs">{t.prev}</span>
          <span className="block truncate text-sm text-ink-soft">{prev ? label(prev) : "—"}</span>
        </span>
      </button>
      {next ? (
        <button onClick={() => onGo(1)} className="btn btn-dark group h-auto min-h-12 max-w-[55%] min-w-0 justify-end gap-3 py-2 text-right" title="Ctrl + Enter">
          <span className="min-w-0">
            <span className="block text-xs font-normal text-white/70">{kind === "blank" ? t.blank.nextSection : answered ? t.next : t.skip}</span>
            <span className="block truncate text-sm">{label(next)}</span>
          </span>
          <ArrowRight className="size-5 shrink-0 transition group-hover:translate-x-0.5" />
        </button>
      ) : (
        <Link href={`/books/${bookId}/preview`} onClick={onFinish} className="btn btn-primary h-auto min-h-12 gap-3 py-2">
          <span>{t.toPreview}</span>
          <ArrowRight className="size-5" />
        </Link>
      )}
    </nav>
  );
}

/** Сколько вопросов с ответом — тонкая линия и подпись; подсказка про Ctrl + Enter — под превью. */
export function ProgressCard({ answered, total }: { answered: number; total: number }) {
  const t = useMessages().editor;
  return (
    <div className="text-xs leading-relaxed text-muted">
      <div className="mb-1.5 text-sm font-medium text-ink">{t.answeredOf(answered, total)}</div>
      <div className="mb-2 h-1 overflow-hidden rounded-[2px] bg-line" aria-hidden>
        <div className="h-full bg-wine transition-[width] duration-500" style={{ width: `${total ? Math.round((answered / total) * 100) : 0}%` }} />
      </div>
      {t.notAll}
      <div className="mt-3 border-t border-line pt-3">
        <kbd className="rounded-[4px] border border-line bg-white px-1">Ctrl</kbd> + <kbd className="rounded-[4px] border border-line bg-white px-1">Enter</kbd> {t.nextShortcut}
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
    <div className="text-xs leading-relaxed text-muted">
      <div className="mb-1 text-sm font-medium text-ink">{t.blank.progress(written, pages.printed || 0)}</div>
      {t.blank.emptyChaptersNote}
      <div className="mt-3 border-t border-line pt-3">
        <kbd className="rounded-[4px] border border-line bg-white px-1">Ctrl</kbd> + <kbd className="rounded-[4px] border border-line bg-white px-1">Enter</kbd> {t.blank.nextShortcut}
      </div>
    </div>
  );
}
