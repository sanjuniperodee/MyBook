"use client";

import type { ReactNode } from "react";
import { BookOpen, Eye, ImagePlus, ListTree, Maximize2, Minimize2, Plus, Trash2 } from "lucide-react";
import { useMessages } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { cn } from "@/lib/class-names";

/** Над карточкой вопроса: оглавление, глава, объём книги, превью на узком экране, режим фокуса. */
export function EditorTopBar({
  chapterNumber,
  chapterTitle,
  language,
  printedPages,
  focus,
  onChapters,
  onTogglePreview,
  onToggleFocus,
}: {
  chapterNumber: number;
  chapterTitle: string;
  language: Locale;
  printedPages: number;
  focus: boolean;
  onChapters: () => void;
  onTogglePreview: () => void;
  onToggleFocus: () => void;
}) {
  const t = useMessages().editor;
  return (
    <div className="mb-3 flex items-center gap-2 sm:mb-4">
      <button className={cn("btn btn-outline btn-sm shrink-0", !focus && "lg:hidden")} onClick={onChapters}>
        <ListTree className="size-4" /> {t.chapters}
      </button>
      <div className="min-w-0 flex-1 truncate text-sm text-muted">
        <span className="text-ink">{t.chapter(chapterNumber)}</span> · <span lang={language}>{chapterTitle}</span>
      </div>
      <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-rose/70 px-3 py-1.5 text-xs font-medium text-wine" title={t.pagesEstimate}>
        <BookOpen className="size-3.5" /> {t.pagesShort(printedPages || 0)}
      </span>
      {!focus ? (
        <button className="btn btn-ghost btn-sm size-9 px-0 xl:hidden" onClick={onTogglePreview} title={t.showPage}>
          <Eye className="size-4" />
        </button>
      ) : null}
      <button className="btn btn-ghost btn-sm size-9 px-0 max-lg:hidden" onClick={onToggleFocus} title={focus ? t.focusOff : t.focusOn}>
        {focus ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
      </button>
    </div>
  );
}

/** Под ответом: диктовка, фото в ответ, свой вопрос, удалить свой; справа — слов и доля полосы. */
export function AnswerToolbar({
  dictation,
  editable,
  custom,
  words,
  answerPages,
  onPhoto,
  onAdd,
  onRemove,
}: {
  dictation: ReactNode;
  editable: boolean;
  /** Свой вопрос — его можно удалить. */
  custom: boolean;
  words: number;
  /** Сколько полос займёт ответ; 0 — ответа нет. */
  answerPages: number;
  onPhoto: () => void;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const t = useMessages().editor;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line/60 px-3 py-2 sm:px-8 sm:py-3">
      {dictation}
      {editable ? (
        <button className="btn btn-ghost btn-sm text-muted max-lg:hidden" onClick={onPhoto}>
          <ImagePlus className="size-4" /> {t.photoInAnswer}
        </button>
      ) : null}
      {editable ? (
        <button className="btn btn-ghost btn-sm text-muted" onClick={onAdd}>
          <Plus className="size-4" /> {t.ownQuestion}
        </button>
      ) : null}
      {editable && custom ? (
        <button className="btn btn-ghost btn-sm text-red-700" onClick={onRemove}>
          <Trash2 className="size-4" /> {t.delete}
        </button>
      ) : null}
      <span className="ml-auto text-xs text-muted tabular-nums">
        {t.words(words)}
        {answerPages > 0 ? t.answerPages((Math.round(Math.max(answerPages, 0.1) * 10) / 10).toLocaleString("ru-RU")) : ""}
      </span>
    </div>
  );
}
