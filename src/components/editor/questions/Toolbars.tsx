"use client";

import type { ReactNode } from "react";
import { Eye, ImagePlus, ListTree, Maximize2, Minimize2, Plus, QrCode, Trash2 } from "lucide-react";
import { useMessages } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { cn } from "@/lib/class-names";

/** Над карточкой вопроса: оглавление, глава, объём книги (pages — PagesBadge), превью на узком экране, режим фокуса. */
export function EditorTopBar({
  chapterNumber,
  chapterTitle,
  language,
  pages,
  focus,
  onChapters,
  onRename,
  onTogglePreview,
  onToggleFocus,
}: {
  /** Номер главы; null — глава своей книги без текста и фото (в книгу не попадёт и номера не получит). */
  chapterNumber: number | null;
  chapterTitle: string;
  language: Locale;
  pages: ReactNode;
  focus: boolean;
  onChapters: () => void;
  /** Быстрое переименование главы (только своя книга): название становится кнопкой. */
  onRename?: () => void;
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
        {chapterNumber === null ? null : (
          <>
            <span className="text-ink">{t.chapter(chapterNumber)}</span> ·{" "}
          </>
        )}
        {onRename ? (
          <button type="button" className="max-w-full truncate align-bottom hover:text-ink hover:underline max-sm:py-2" title={t.nav.rename} onClick={onRename}>
            <span lang={language}>{chapterTitle}</span>
          </button>
        ) : (
          <span lang={language}>{chapterTitle}</span>
        )}
        {chapterNumber === null ? <span> · {t.nav.notInBook}</span> : null}
      </div>
      {pages}
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

/** Под ответом: диктовка, фото в ответ, видео или музыка (QR-код), свой вопрос, удалить свой; справа — слов и доля полосы. */
export function AnswerToolbar({
  dictation,
  editable,
  blank,
  custom,
  words,
  answerPages,
  onPhoto,
  onMedia,
  onAdd,
  onRemove,
}: {
  dictation: ReactNode;
  editable: boolean;
  /** Своя книга: вместо «Свой вопрос» — «+ Раздел», удалить можно любой раздел. */
  blank: boolean;
  /** Свой вопрос — его можно удалить. */
  custom: boolean;
  words: number;
  /** Сколько полос займёт ответ; 0 — ответа нет. */
  answerPages: number;
  onPhoto: () => void;
  onMedia: () => void;
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
        <button className="btn btn-ghost btn-sm text-muted" onClick={onMedia} title={t.media.addTitle} data-testid="add-media">
          <QrCode className="size-4" /> {t.media.add}
        </button>
      ) : null}
      {editable ? (
        <button className="btn btn-ghost btn-sm text-muted" onClick={onAdd}>
          <Plus className="size-4" /> {blank ? t.blank.addSection : t.ownQuestion}
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
