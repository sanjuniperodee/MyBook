"use client";

import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, Eye, ImagePlus, ListTree, Maximize2, Minimize2, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Plus, QrCode, Trash2 } from "lucide-react";
import { SaveIndicator } from "@/components/SaveIndicator";
import type { SaveStatus } from "@/hooks/useAutosave";
import { useMessages } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { cn } from "@/lib/class-names";

/**
 * Полоса прогресса по главе: по сегменту на вопрос (с ответом — тушью, текущий — винным), подпись «Вопрос 3 из 8» слева.
 * Сегменты — украшение для глаза (aria-hidden), смысл несёт подпись; в длинной главе остаётся одна подпись.
 */
export function QuestionTicks({ label, items, current, className }: { label: string; items: boolean[]; current: number; className?: string }) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2.5 text-xs text-muted", className)}>
      <span className="shrink-0 tabular-nums">{label}</span>
      {items.length > 1 && items.length <= 24 ? (
        <span className="flex h-1.5 min-w-0 items-center gap-[3px]" aria-hidden>
          {items.map((done, i) => (
            <span key={i} className={cn("h-1 w-3.5 shrink-0 rounded-[2px] transition-colors", i === current ? "h-1.5 bg-wine" : done ? "bg-ink/70" : "bg-line-strong")} />
          ))}
        </span>
      ) : null}
    </div>
  );
}

/** Кнопка-значок полосы: 44 px на телефоне, 36 на компьютере. */
function BarBtn({ label, title, onClick, disabled, pressed, className, children }: { label: string; title?: string; onClick: () => void; disabled?: boolean; pressed?: boolean; className?: string; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title ?? label} aria-label={label} aria-pressed={pressed} className={cn("btn btn-ghost btn-icon btn-sm shrink-0 text-ink-soft max-sm:size-11 max-sm:h-11", className)}>
      {children}
    </button>
  );
}

/**
 * Верхняя полоса редактора — липкая, одна строка: оглавление, глава, прогресс по главе, «сохранено», объём книги,
 * шаг к соседним вопросам, «Как в книге» и режим фокуса. На телефоне остаётся самое нужное: оглавление, глава, статус
 * и «Как в книге» (диктовка, фото и «Следующий» — в нижней панели).
 */
export function EditorTopBar({
  chapterNumber,
  chapterTitle,
  language,
  pages,
  status,
  error,
  progress,
  tocOpen,
  previewOpen,
  focus,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  onToc,
  onRename,
  onPreview,
  onFocus,
}: {
  /** Номер главы; null — глава своей книги без текста и фото (в книгу не попадёт и номера не получит). */
  chapterNumber: number | null;
  chapterTitle: string;
  language: Locale;
  pages: ReactNode;
  status: SaveStatus;
  error?: string | null;
  /** «Вопрос 3 из 8» и сегменты — на компьютере, в полосе. */
  progress: ReactNode;
  /** Оглавление сейчас видно слева (только на широком экране; на узком оно открывается шторкой). */
  tocOpen: boolean;
  /** Страница книги сейчас видна справа. */
  previewOpen: boolean;
  focus: boolean;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToc: () => void;
  /** Быстрое переименование главы (только своя книга): название становится кнопкой. */
  onRename?: () => void;
  onPreview: () => void;
  onFocus: () => void;
}) {
  const t = useMessages().editor;
  const c = t.chrome;
  return (
    <div className="sticky z-30 border-b border-line/70 bg-paper/[0.97] backdrop-blur-xl" style={{ top: "var(--ed-top)" }} role="toolbar" aria-label={c.barAria} data-editor-bar>
      <div className="mx-auto flex h-12 max-w-[96rem] items-center gap-1 px-3 sm:gap-1.5 sm:px-6 max-sm:h-14">
        {/* Оглавление: на телефоне и узком экране — шторка, на широком — столбец слева (кнопка прячет и показывает его). */}
        <BarBtn label={t.chapters} className={focus ? undefined : "min-[1281px]:hidden"} onClick={onToc}>
          <ListTree className="size-[18px]" />
        </BarBtn>
        <BarBtn
          label={tocOpen ? c.tocHide : c.tocShow}
          className={focus ? "hidden" : "max-[1280px]:hidden"}
          onClick={onToc}
        >
          {tocOpen ? <PanelLeftClose className="size-[18px]" /> : <PanelLeftOpen className="size-[18px]" />}
        </BarBtn>

        <div className="min-w-0 flex-1 truncate text-sm text-muted">
          {chapterNumber === null ? null : (
            <>
              <span className="font-medium text-ink">{t.chapter(chapterNumber)}</span>
              <span className="mx-1.5 text-line-strong" aria-hidden>
                /
              </span>
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

        <div className="mr-2 hidden min-w-0 shrink items-center lg:flex">{progress}</div>
        <SaveIndicator status={status} error={error} className="shrink-0 text-xs" />
        <span className="ml-1 hidden shrink-0 lg:flex">{pages}</span>

        <span className="mx-1 hidden h-5 w-px shrink-0 bg-line lg:block" aria-hidden />
        <BarBtn label={t.prev} title={`${t.prev} · Ctrl + Shift + Enter`} disabled={!hasPrev} onClick={onPrev} className="max-lg:hidden">
          <ChevronLeft className="size-[18px]" />
        </BarBtn>
        <BarBtn label={t.next} title={`${t.next} · Ctrl + Enter`} disabled={!hasNext} onClick={onNext} className="max-lg:hidden">
          <ChevronRight className="size-[18px]" />
        </BarBtn>

        {/* «Как в книге»: на широком экране прячет и показывает страницу справа, на узком — открывает её на весь экран. */}
        {!focus ? (
          <>
            <button type="button" className="btn btn-outline btn-sm shrink-0 px-3 max-lg:hidden min-[1100px]:hidden" onClick={onPreview}>
              <Eye className="size-4" /> {c.previewBtn}
            </button>
            <BarBtn label={c.previewBtn} className="lg:hidden" onClick={onPreview}>
              <Eye className="size-[18px]" />
            </BarBtn>
            <BarBtn label={previewOpen ? c.previewHide : c.previewShow} className="max-[1099px]:hidden" onClick={onPreview}>
              {previewOpen ? <PanelRightClose className="size-[18px]" /> : <PanelRightOpen className="size-[18px]" />}
            </BarBtn>
          </>
        ) : null}
        <BarBtn label={focus ? t.focusOff : t.focusOn} pressed={focus} onClick={onFocus} className="max-lg:hidden">
          {focus ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        </BarBtn>
      </div>
    </div>
  );
}

/**
 * Панель инструментов под листом: диктовка, фото в ответ, видео или музыка (QR-код), свой вопрос, удалить свой; справа —
 * слов и доля полосы. На компьютере она прилипает к низу экрана, пока лист длиннее экрана; на телефоне диктовка и фото —
 * в нижней панели, здесь остальное.
 */
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
  // Дробь с запятой и в русском, и в казахском — без toLocaleString: у браузера и сервера разные данные для kk-KZ
  // (на сервере «0,9», в Chrome «0.9»), и счётчик расходился при гидратации.
  const share = (n: number) => String(Math.round(Math.max(n, 0.1) * 10) / 10).replace(".", ",");
  return (
    <div
      role="group"
      aria-label={t.chrome.toolsAria}
      className="flex flex-wrap items-center gap-x-0.5 gap-y-1 border-t border-line bg-white px-2 py-1.5 sm:px-4 lg:sticky lg:bottom-0 lg:z-20 lg:rounded-b-[14px] lg:bg-white/95 lg:backdrop-blur-md"
    >
      {dictation}
      {editable ? (
        <button className="btn btn-ghost btn-sm text-ink-soft max-lg:hidden" onClick={onPhoto}>
          <ImagePlus className="size-4" /> {t.photoInAnswer}
        </button>
      ) : null}
      {editable ? (
        <button className="btn btn-ghost btn-sm text-ink-soft" onClick={onMedia} title={t.media.addTitle} data-testid="add-media">
          <QrCode className="size-4" /> {t.media.add}
        </button>
      ) : null}
      {editable ? (
        <button className="btn btn-ghost btn-sm text-ink-soft" onClick={onAdd}>
          <Plus className="size-4" /> {blank ? t.blank.addSection : t.ownQuestion}
        </button>
      ) : null}
      {editable && custom ? (
        <button className="btn btn-ghost btn-sm text-danger hover:bg-danger-bg hover:text-danger" onClick={onRemove}>
          <Trash2 className="size-4" /> {t.delete}
        </button>
      ) : null}
      <span className="ml-auto px-2 text-xs text-muted tabular-nums">
        {t.words(words)}
        {answerPages > 0 ? t.answerPages(share(answerPages)) : ""}
      </span>
    </div>
  );
}
