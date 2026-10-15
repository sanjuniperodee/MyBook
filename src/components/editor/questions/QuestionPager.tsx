"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { Link, useMessages } from "@/i18n/client";
import type { EditorQuestion } from "@/lib/book/editor-model";

/**
 * Переход между вопросами на компьютере: назад, вперёд («Пропустить», если ответа нет) или к книге после
 * последнего вопроса — дописав черновик.
 */
export function QuestionPager({ bookId, prev, next, answered, onGo, onFinish }: { bookId: string; prev?: EditorQuestion; next?: EditorQuestion; answered: boolean; onGo: (step: -1 | 1) => void; onFinish: () => void }) {
  const t = useMessages().editor;
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
          <span className="block truncate text-sm">{prev?.prompt ?? "—"}</span>
        </span>
      </button>
      {next ? (
        <button onClick={() => onGo(1)} className="group flex min-w-0 items-center justify-end gap-3 rounded-2xl bg-ink p-4 text-right text-white transition hover:bg-ink-soft" title="Ctrl + Enter">
          <span className="min-w-0">
            <span className="block text-xs text-white/60">{answered ? t.next : t.skip}</span>
            <span className="block truncate text-sm">{next.prompt}</span>
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
