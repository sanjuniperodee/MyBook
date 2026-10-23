"use client";

import type { ReactNode } from "react";
import { Eye, ImagePlus, ListTree, Maximize2, Minimize2, Plus, QrCode, Trash2 } from "lucide-react";
import { useMessages } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { cn } from "@/lib/class-names";

/** Над карточкой вопроса: оглавление, глава, объём книги (pages — PagesBadge), «Как в книге» на узком экране, режим фокуса. */
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
    <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 sm:mb-4 sm:flex-nowrap">
      <button className={cn("btn btn-outline btn-sm shrink-0", !focus && "lg:hidden")} onClick={onChapters}>
        <ListTree className="size-4" /> {t.chapters}
      </button>
      {/* На телефоне глава — своей строкой под кнопками: рядом с «Как в книге» от названия оставалось три буквы. */}
      <div className="min-w-0 flex-1 truncate text-sm text-muted max-sm:order-last max-sm:basis-full">
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
      <span className="flex-1 sm:hidden" aria-hidden />
      {pages}
      {!focus ? (
        // «Как в книге» — подписанная кнопка: на телефоне открывает превью на весь экран (на широком оно справа).
        <button className="btn btn-outline btn-sm h-9 shrink-0 gap-1 px-2.5 text-xs xl:hidden" onClick={onTogglePreview}>
          <Eye className="size-3.5" /> {t.chrome.previewBtn}
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
  // Дробь — по языку интерфейса; где Intl не знает kk-KZ, берётся ru-RU (разделители те же).
  // Дробь с запятой и в русском, и в казахском — без toLocaleString: у браузера и сервера разные данные для kk-KZ
  // (на сервере «0,9», в Chrome «0.9»), и счётчик расходился при гидратации.
  const share = (n: number) => String(Math.round(Math.max(n, 0.1) * 10) / 10).replace(".", ",");
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
        {answerPages > 0 ? t.answerPages(share(answerPages)) : ""}
      </span>
    </div>
  );
}
