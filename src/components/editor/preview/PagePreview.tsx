"use client";

import { useMessages } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { memo, useCallback, useLayoutEffect, useMemo, useRef, type MouseEvent, type ReactNode } from "react";
import type { PreviewChapter, PreviewGallery } from "@/lib/book/editor-model";
import type { BookFormat } from "@/lib/book/formats";
import type { InteriorDesign } from "@/lib/book/interiors";
import { normalizeStyle, splitParagraphs, type InlinePhotoStyle } from "@/lib/book/inline-photo";
import { interiorMetrics, pageSide, textArea } from "@/lib/book/page-geometry";
import { pageKit } from "@/components/interior/kit";
import { pxUnits } from "@/components/interior/units";
import { ChapterPages, chapterContentKey } from "./ChapterPages";
import { PreviewOpener, PreviewPhotoPages } from "./book-pages";
import { anchorLabel } from "./drag";
import { NO_PHOTO_PAGES, usePageWidth, usePreviewPages } from "./layout-hooks";
import type { OnPreviewTarget, PreviewTarget } from "./targets";
import { usePhotoDrag } from "./usePhotoDrag";

/**
 * HTML-копия книги в выбранном оформлении — те же шрифты, кегли, поля и графика, что в PDF:
 * все главы и ответы подряд, перед каждой главой — её начальная полоса.
 * Текст главы раскладывается по страницам через CSS-колонки размером с текстовую область:
 * каждая колонка — отдельная страница, страницы листаются вертикально. Страницы вне экрана
 * не отрисовываются, а при смене `currentId` список прокручивается к началу этого ответа.
 *
 * Если передан onChange, фото текущего ответа интерактивны: щелчок выделяет, уголок меняет размер,
 * перетаскивание переносит фото в другое место текста. Начальные полосы глав (фото главы), страницы фото после глав
 * и альбом в конце (gallery) — как в PDF; с onTarget они нажимаются: что нажали — ключами полос сборки (PreviewTarget).
 */
function PagePreviewView({
  format,
  design,
  bookTitle,
  chapters,
  gallery = null,
  currentId,
  selectedId = null,
  onSelect,
  onChange,
  onTarget,
  header,
  className,
  language,
}: {
  /** Язык книги: на нём подпись «Глава N» и переносы — как в PDF. */
  language: Locale;
  format: BookFormat;
  design: InteriorDesign;
  /** Название книги — в колонтитуле левых полос. */
  bookTitle: string;
  chapters: PreviewChapter[];
  /** Альбом в конце книги; null — его нет. */
  gallery?: PreviewGallery | null;
  currentId: string;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  onChange?: (id: string, patch: Partial<InlinePhotoStyle>) => void;
  onTarget?: OnPreviewTarget;
  /** Над страницами, в той же прокрутке (превью на весь экран: подпись и объяснение мест фото). */
  header?: ReactNode;
  className?: string;
}) {
  const messages = useMessages().editor;
  const t = messages.preview;
  const tp = messages.previewPhotos;
  const W = format.widthMm;
  const H = format.heightMm;
  const area = textArea(format);
  const wrap = useRef<HTMLDivElement>(null);
  const interactive = !!onChange;

  const pageW = usePageWidth(wrap);
  const px = pageW / W; // пикселей на миллиметр
  const textW = area.w * px;
  const gap = pageSide(format) * 2 * px;
  const kit = useMemo(() => pageKit(design, format, pxUnits(px), language), [design, format, px, language]);

  const currentEntry = chapters.flatMap((c) => c.entries).find((e) => e.id === currentId);
  const curParas = splitParagraphs(currentEntry?.answer ?? "").length;
  const drag = usePhotoDrag({
    currentId,
    paragraphs: curParas,
    textW,
    selectedId,
    interactive,
    anchorOf: (id) => normalizeStyle(currentEntry?.photos.find((p) => p.id === id)?.inline).anchor,
    onSelect,
    onChange,
  });

  const { scroll, pagesBy, photoPagesBy, setMeasureRef, measure } = usePreviewPages({ chapters, currentId, textW, gap, marginTop: interiorMetrics[format.id].marginTop * px });

  // Щелчок по полосе мимо фото снимает выделение. Обработчик стабилен (через ref), чтобы не перерисовывать главы.
  const clickState = useRef({ interactive, selectedId, onSelect, suppressUntil: drag.suppressClickUntil });
  useLayoutEffect(() => {
    clickState.current = { interactive, selectedId, onSelect, suppressUntil: drag.suppressClickUntil };
  });
  const onPageClick = useCallback((e: MouseEvent) => {
    const c = clickState.current;
    if (e.timeStamp < c.suppressUntil.current) return;
    if (c.interactive && c.selectedId && !(e.target as HTMLElement).closest("[data-photo]")) c.onSelect?.(null);
  }, []);

  // Нажатие на полосу — стабильным обработчиком: главы превью не перерисовываются из-за нового обработчика.
  const targetRef = useRef(onTarget);
  useLayoutEffect(() => {
    targetRef.current = onTarget;
  });
  const hasTarget = !!onTarget;
  const tapTarget = useCallback((target: PreviewTarget) => targetRef.current?.(target), []);
  const toTarget = hasTarget ? tapTarget : undefined;

  const { moving } = drag;
  const dragged = moving ? chapters.flatMap((c) => c.entries).flatMap((e) => e.photos).find((p) => p.id === moving.id) : null;

  return (
    <div ref={scroll} className={className}>
      {header}
      <div ref={wrap} className="space-y-4">
        {pageW ? (
          chapters.map((ch) => {
            const current = ch.entries.some((e) => e.id === currentId);
            return (
              <ChapterPages
                key={ch.key}
                chapter={ch}
                contentKey={chapterContentKey(ch)}
                kit={kit}
                pageW={pageW}
                px={px}
                bookTitle={bookTitle}
                language={language}
                t={t}
                tp={tp}
                onTarget={toTarget}
                pages={pagesBy[ch.key] ?? 1}
                photoPages={photoPagesBy[ch.key] ?? NO_PHOTO_PAGES}
                currentId={current ? currentId : null}
                selectedId={current ? selectedId : null}
                interactive={interactive}
                drag={current ? drag : null}
                onChange={current ? onChange : undefined}
                scroll={scroll}
                setMeasureRef={setMeasureRef}
                measure={measure}
                onPageClick={onPageClick}
              />
            );
          })
        ) : (
          <div className="bg-white" style={{ aspectRatio: `${W} / ${H}` }} />
        )}
        {pageW && gallery ? (
          // Альбом в конце — после всех глав, как в PDF: начальная полоса без номера и страницы фото.
          <>
            <PreviewOpener kit={kit} number={null} title={gallery.title} style={{ width: pageW, height: H * px }} tp={tp} target={{ kind: "gallery" }} label={tp.albumChip} chip={hasTarget ? tp.albumChip : undefined} onTarget={toTarget} />
            <PreviewPhotoPages kit={kit} pages={gallery.pages} pageW={pageW} pageH={H * px} scroll={scroll} idPrefix="album" tp={tp} target={() => ({ kind: "gallery" })} label={tp.albumChip} onTarget={toTarget} />
          </>
        ) : null}
        {dragged && moving ? (
          <div className="pointer-events-none fixed z-50 flex items-center gap-2 rounded-xl bg-ink/90 p-1.5 pr-3 text-xs text-white shadow-xl" style={{ left: moving.x + 12, top: moving.y + 12 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={dragged.url} alt="" className="size-10 rounded-lg object-cover" />
            {anchorLabel(t, moving.target, curParas)}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Превью перерисовывается, только когда меняются его данные: книга в редакторе приходит отложенно (useDeferredValue). */
export const PagePreview = memo(PagePreviewView);
