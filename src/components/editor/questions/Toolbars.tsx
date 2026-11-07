"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronLeft, ChevronRight, Eye, ImagePlus, ListTree, Maximize2, Minimize2, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Plus, QrCode, Trash2, Ellipsis } from "lucide-react";
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
      {/* Реже нужное — видео и музыка по QR, свой вопрос, удалить свой — в одном меню «Ещё»: на виду диктовка и фото. */}
      {editable ? (
        <MoreTools
          label={t.chrome.more}
          items={[
            { key: "media", label: t.media.add, title: t.media.addTitle, icon: QrCode, onClick: onMedia, testId: "add-media" },
            { key: "add", label: blank ? t.blank.addSection : t.ownQuestion, icon: Plus, onClick: onAdd },
            ...(custom ? [{ key: "remove", label: t.delete, icon: Trash2, onClick: onRemove, danger: true }] : []),
          ]}
        />
      ) : null}
      <span className="ml-auto px-2 text-xs text-muted tabular-nums">
        {t.words(words)}
        {answerPages > 0 ? t.answerPages(share(answerPages)) : ""}
      </span>
    </div>
  );
}

/** Меню «Ещё» нижней панели ответа: закрывается по Esc, клику снаружи и после выбора. */
function MoreTools({ label, items }: { label: string; items: { key: string; label: string; title?: string; icon: LucideIcon; onClick: () => void; danger?: boolean; testId?: string }[] }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div ref={root} className="relative">
      <button type="button" className={cn("btn btn-ghost btn-sm text-ink-soft", open && "bg-sunken text-ink")} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Ellipsis className="size-4" /> {label}
      </button>
      {/* Пункты в разметке всегда (hidden, пока меню закрыто): data-testid и подписи доступны тестам и поиску по странице. */}
      <div role="menu" hidden={!open} className="absolute bottom-[calc(100%+0.375rem)] left-0 z-30 w-60 rounded-[var(--r-panel)] border border-line bg-white p-1.5 shadow-soft">
          {items.map((it) => (
            <button
              key={it.key}
              role="menuitem"
              type="button"
              title={it.title}
              data-testid={it.testId}
              onClick={() => {
                setOpen(false);
                it.onClick();
              }}
              className={cn("flex min-h-10 w-full items-center gap-2.5 rounded-[8px] px-2.5 text-left text-sm hover:bg-sunken", it.danger ? "text-danger hover:bg-danger-bg" : "text-ink-soft hover:text-ink")}
            >
              <it.icon className="size-4 shrink-0" aria-hidden /> {it.label}
            </button>
          ))}
      </div>
    </div>
  );
}
