"use client";

import type { BookContent } from "@/lib/book/layout";
import { useMessages } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import type { PreviewChapter, PreviewGallery } from "@/lib/book/editor-model";
import type { BookFormat } from "@/lib/book/formats";
import type { InteriorDesign } from "@/lib/book/interiors";
import { normalizeStyle, splitParagraphs, type InlinePhotoStyle } from "@/lib/book/inline-photo";
import { interiorMetrics, pageSide, textArea } from "@/lib/book/page-geometry";
import { pageKit } from "@/components/interior/kit";
import { PAPER } from "@/lib/book/interiors";
import { PAGE_SHADOW } from "./book-pages";
import { createLineBreaker, type LineBreaker } from "@/components/interior/line-breaker";
import { pxUnits } from "@/components/interior/units";
import { ChapterPages, chapterContentKey } from "./ChapterPages";
import { PreviewOpener, PreviewPhotoPages } from "./book-pages";
import { dropLabel } from "./drag";
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
  openersLeft = false,
  firstPage,
  chapterStart,
  currentId,
  selectedId = null,
  onSelect,
  onChange,
  onMovePhoto,
  canDrop,
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
  /** Начальная полоса главы слева, первая полоса текста справа (BookContent.openersLeft); нет — начальная справа. */
  openersLeft?: boolean;
  /** Номер первой полосы первой главы в книге (после титула, посвящения и оглавления); нет — полосы без номеров. */
  firstPage?: number;
  /** Глава без начальной полосы (BookContent.chapterStart): inline — номер и название над текстом, none — чистый лист. */
  chapterStart?: BookContent["chapterStart"];
  currentId: string;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  onChange?: (id: string, patch: Partial<InlinePhotoStyle>) => void;
  /** Фото текущего ответа бросили в другой ответ (entry — id вопроса) на место anchor; нет — только в пределах ответа. */
  onMovePhoto?: (id: string, entry: string, anchor: number | null) => void;
  /** В какой ответ превью можно бросить фото (вопрос книги, а не письмо); нет — в любой. */
  canDrop?: (entry: string) => boolean;
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
  const { hyphenate, breaker, version } = useBookTypesetter(language);
  // decides — превью делает доводку вёрстки само (ChapterPages), как PDF.
  const kit = useMemo(() => ({ ...pageKit(design, format, pxUnits(px), language, hyphenate, breaker), version, decides: true }), [design, format, px, language, hyphenate, breaker, version]);

  const entries = useMemo(() => new Map(chapters.flatMap((c) => c.entries.map((e) => [e.id, { entry: e, chapter: c.key }] as const))), [chapters]);
  const currentEntry = entries.get(currentId)?.entry;
  const paragraphsOf = (id: string) => splitParagraphs(entries.get(id)?.entry.answer ?? "").length;
  const drag = usePhotoDrag({
    currentId,
    paragraphsOf,
    canDrop: (id) => entries.has(id) && (canDrop?.(id) ?? true),
    textW,
    textH: area.h * px,
    selectedId,
    interactive,
    anchorOf: (id) => normalizeStyle(currentEntry?.photos.find((p) => p.id === id)?.inline).anchor,
    onSelect,
    onChange,
    onMove: onMovePhoto,
  });

  const { scroll, pagesBy, photoPagesBy, setMeasureRef, measure, report } = usePreviewPages({ chapters, currentId, textW, gap, marginTop: interiorMetrics[format.id].marginTop * px });

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

  // Номера полос, как в книге: перед главами — передние полосы (firstPage), у глав — их полосы (как у PDF), пустая
  // полоса перед начальной, если она выпала бы справа, и страницы фото после главы.
  const numbering = useMemo(() => {
    if (firstPage === undefined) return null;
    const out = new Map<string, { text: number; blank: boolean }>();
    let page = firstPage;
    for (const ch of chapters) {
      let blank = false;
      if (!chapterStart) {
        if (openersLeft && page % 2 === 1) {
          blank = true;
          page++;
        }
        page++;
      }
      out.set(ch.key, { text: page, blank });
      page += (pagesBy[ch.key] ?? 1) + (ch.photoPages?.length ?? 0);
    }
    return { chapters: out, galleryBlank: !!openersLeft && page % 2 === 1 };
  }, [firstPage, chapters, chapterStart, openersLeft, pagesBy]);

  const { moving } = drag;
  const dragged = moving ? currentEntry?.photos.find((p) => p.id === moving.id) : null;
  // Глава, куда сейчас бросят фото: её превью тоже получает перетаскивание — для линии места вставки.
  const targetChapter = moving ? entries.get(moving.target.entry)?.chapter : undefined;

  return (
    <div ref={scroll} className={className}>
      {header}
      <div ref={wrap} className="space-y-4">
        {pageW ? (
          chapters.map((ch) => {
            const current = ch.entries.some((e) => e.id === currentId);
            const dropHere = !current && ch.key === targetChapter;
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
                openersLeft={openersLeft}
                firstPage={numbering?.chapters.get(ch.key)?.text}
                blankBefore={numbering?.chapters.get(ch.key)?.blank}
                start={chapterStart}
                photoPages={photoPagesBy[ch.key] ?? NO_PHOTO_PAGES}
                currentId={current ? currentId : null}
                selectedId={current ? selectedId : null}
                interactive={interactive}
                drag={current || dropHere ? drag : null}
                onChange={current ? onChange : undefined}
                scroll={scroll}
                setMeasureRef={setMeasureRef}
                measure={measure}
                report={report}
                onPageClick={onPageClick}
              />
            );
          })
        ) : (
          <div className="bg-white" style={{ aspectRatio: `${W} / ${H}` }} />
        )}
        {pageW && gallery && numbering?.galleryBlank ? <div aria-hidden className={PAGE_SHADOW} style={{ width: pageW, height: H * px, background: design.paper ?? PAPER }} /> : null}
        {pageW && gallery ? (
          // Альбом в конце — после всех глав, как в PDF: начальная полоса без номера и страницы фото.
          <>
            <PreviewOpener kit={kit} number={null} title={gallery.title} photo={gallery.openerPhoto} style={{ width: pageW, height: H * px }} tp={tp} target={{ kind: "gallery" }} label={tp.albumChip} chip={hasTarget ? tp.albumChip : undefined} onTarget={toTarget} />
            <PreviewPhotoPages kit={kit} pages={gallery.pages} pageW={pageW} pageH={H * px} scroll={scroll} idPrefix="album" tp={tp} target={() => ({ kind: "gallery" })} label={tp.albumChip} onTarget={toTarget} />
          </>
        ) : null}
        {dragged && moving ? (
          <div className="pointer-events-none fixed z-50 flex items-center gap-2 rounded-xl bg-ink/90 p-1.5 pr-3 text-xs text-white shadow-xl" style={{ left: moving.x + 12, top: moving.y + 12 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={dragged.url} alt="" className="size-10 rounded-lg object-cover" />
            {dropLabel(t, moving.target, currentId, paragraphsOf(moving.target.entry), entries.get(moving.target.entry)?.entry.heading ?? null)}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Переносы и строки книги для превью: модуль с шаблонами переносов (lib/book/hyphenate.ts) грузится отдельно. Пока его
 * нет — переносы и строки браузера. Потом — строки, как у PDF (line-breaker.ts: Кнут — Пласс по ширинам шрифтов
 * книги), а где шрифт ещё грузится — мягкие переносы PDF. Догрузился шрифт — новая версия набора, превью перестраивается.
 */
function useBookTypesetter(language: Locale) {
  const [tools, setTools] = useState<{ hyphenate: (text: string) => string; breaker: LineBreaker } | undefined>(undefined);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let live = true;
    void import("@/lib/book/hyphenate").then(({ softHyphenate, hyphenateWord }) => {
      if (!live) return;
      const memo = new Map<string, string>();
      const hyphenate = (text: string) => {
        let out = memo.get(text);
        if (out === undefined) {
          out = softHyphenate(text, language);
          if (memo.size > 5000) memo.clear();
          memo.set(text, out);
        }
        return out;
      };
      const breaker = createLineBreaker(language, hyphenateWord, () => live && setVersion((v) => v + 1));
      setTools({ hyphenate, breaker });
    });
    return () => {
      live = false;
    };
  }, [language]);
  // Новая версия — новая функция: набор (kit) меняется, главы перерисовываются и перемеряются.
  const breaker = useMemo(() => (tools ? withVersion(tools.breaker, version) : undefined), [tools, version]);
  return { hyphenate: tools?.hyphenate, breaker, version };
}

/** Та же разбивка строк новой функцией (версия набора — в замыкании: функции разные, кэш общий). */
function withVersion(base: LineBreaker, version: number): LineBreaker {
  const fn: LineBreaker = (req) => (version >= 0 ? base(req) : null);
  fn.width = base.width;
  return fn;
}

/** Превью перерисовывается, только когда меняются его данные: книга в редакторе приходит отложенно (useDeferredValue). */
export const PagePreview = memo(PagePreviewView);
