"use client";

import { useMessages } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { Fragment, useRef } from "react";
import type { PreviewChapter, PreviewEntry, PreviewPhoto } from "@/lib/book/editor-model";
import { cssFont } from "@/lib/book/fonts";
import { PT_TO_MM, type BookFormat } from "@/lib/book/formats";
import type { InteriorDesign } from "@/lib/book/interiors";
import { interiorMetrics, pageSide, textArea } from "@/lib/book/page-geometry";
import { layoutInline, normalizeStyle, splitParagraphs } from "@/lib/book/inline-photo";
import type { InlinePhotoStyle } from "@/lib/book/inline-photo";
import { AnswerBlockView } from "@/components/interior/answer-block";
import { Divider, InlineRow, QuestionHeading } from "@/components/interior/entry";
import { Folio, RunningHead } from "@/components/interior/folio";
import { pageKit } from "@/components/interior/kit";
import { OpenerPage } from "@/components/interior/pages";
import { answerBlocks, rowsByBlock, type AnswerBlock } from "@/lib/book/answer-blocks";
import { pxUnits } from "@/components/interior/units";
import { anchorLabel } from "./drag";
import { LazyPage } from "./LazyPage";
import { usePageWidth, usePreviewPages } from "./layout-hooks";
import { previewPhotoLayer } from "./photo-layer";
import { usePhotoDrag } from "./usePhotoDrag";

const END = Number.POSITIVE_INFINITY;

/**
 * HTML-копия книги в выбранном оформлении — те же шрифты, кегли, поля и графика, что в PDF:
 * все главы и ответы подряд, перед каждой главой — её начальная полоса.
 * Текст главы раскладывается по страницам через CSS-колонки размером с текстовую область:
 * каждая колонка — отдельная страница, страницы листаются вертикально. Страницы вне экрана
 * не отрисовываются, а при смене `currentId` список прокручивается к началу этого ответа.
 *
 * Если передан onChange, фото текущего ответа интерактивны: щелчок выделяет, уголок меняет размер,
 * перетаскивание переносит фото в другое место текста.
 */
export function PagePreview({
  format,
  design,
  bookTitle,
  chapters,
  currentId,
  selectedId = null,
  onSelect,
  onChange,
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
  currentId: string;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  onChange?: (id: string, patch: Partial<InlinePhotoStyle>) => void;
  className?: string;
}) {
  const t = useMessages().editor.preview;
  const m = interiorMetrics[format.id];
  const W = format.widthMm;
  const H = format.heightMm;
  const side = pageSide(format);
  const area = textArea(format);
  const wrap = useRef<HTMLDivElement>(null);
  const interactive = !!onChange;

  const pageW = usePageWidth(wrap);
  const px = pageW / W; // пикселей на миллиметр
  const textW = area.w * px;
  const textH = area.h * px;
  const gap = side * 2 * px;
  const kit = pageKit(design, format, pxUnits(px), language);
  const S = kit.sizes;
  const P = design.palette;
  const bodyPx = S.body * PT_TO_MM * px;
  const ptPx = (v: number) => v * PT_TO_MM * px;

  type Item = { p: PreviewPhoto; style: InlinePhotoStyle };
  const curParas = splitParagraphs(chapters.flatMap((c) => c.entries).find((e) => e.id === currentId)?.answer ?? "").length;
  /** Место в тексте у фото текущего ответа — заполняется раскладкой ниже. */
  const anchors = new Map<string, number | null>();
  const drag = usePhotoDrag({
    currentId,
    paragraphs: curParas,
    textW,
    selectedId,
    interactive,
    anchorOf: (id) => anchors.get(id) ?? null,
    onSelect,
    onChange,
  });
  const resizing = drag.drag?.kind === "resize" ? drag.drag : null;

  // layout — ряды фото по блокам набора (answer-blocks): −1 — перед текстом, i — после блока i, END — в конце.
  const info = new Map<string, { paragraphs: string[]; blocks: AnswerBlock[]; layout: Map<number, Item[][]>; live: boolean }>();
  for (const ch of chapters)
    for (const e of ch.entries) {
      const paragraphs = splitParagraphs(e.answer);
      const items = e.photos.map((p) => {
        const style = normalizeStyle(p.inline);
        if (resizing?.id === p.id) style.width = resizing.width;
        if (e.id === currentId) anchors.set(p.id, style.anchor);
        return { p, style };
      });
      const blocks = answerBlocks(paragraphs);
      info.set(e.id, { paragraphs, blocks, layout: rowsByBlock(blocks, layoutInline(items, paragraphs.length)), live: e.id === currentId });
    }
  const liveKey = chapters
    .map((ch) => ch.key + ch.entries.map((e) => `${e.id}:${e.heading}:${e.answer}:` + e.photos.map((p) => `${p.id}:${p.url}:${p.caption}:` + JSON.stringify(normalizeStyle(p.inline))).join(",")).join("|"))
    .join("#");

  const { scroll, measureRefs, pagesBy, measure } = usePreviewPages({ chapters, currentId, textW, gap, liveKey, pageW, resizeWidth: resizing?.width ?? 0, marginTop: m.marginTop * px });

  const { moving, hint } = drag;
  const renderRows = (entry: PreviewEntry, key: number, isMeasure: boolean) => {
    const d = info.get(entry.id)!;
    // Место вставки в тексте — номер абзаца, после которого встаёт ряд (последний абзац блока).
    const anchor = key === END || key < 0 ? key : d.blocks[key].to;
    // Ряд и фото рисует вёрстка книги (InlineRow — как в PDF и на разворотах), превью добавляет поверх только интерактивность.
    const layer = previewPhotoLayer({ t, kit, live: d.live && interactive, isMeasure, measure, selectedId, drag, onChange });
    return (d.layout.get(key) ?? []).map((row, r) => <InlineRow key={`${anchor}-${r}`} kit={kit} row={row} layer={layer} data-entry={entry.id} data-row-anchor={anchor === END ? "end" : anchor} />);
  };

  const renderEntry = (entry: PreviewEntry, first: boolean, isMeasure: boolean) => {
    const d = info.get(entry.id)!;
    const paragraphs = d.paragraphs;
    // Отбивки — как в PDF: перед заголовком больше, перед ответом без заголовка — разделитель.
    // Именно margin (а не распорка): на переносе в новую колонку-страницу браузер его отбрасывает.
    const gapBefore = first ? 0 : ptPx(entry.heading ? S.beforeHeading : S.beforeHeadless);
    return (
      <Fragment key={entry.id}>
        <span data-marker={entry.id} style={{ display: "block", height: 1, breakAfter: "avoid" }} />
        {entry.heading ? (
          <QuestionHeading
            kit={kit}
            data-entry={entry.id}
            data-para={-1}
            style={{ marginTop: gapBefore, boxShadow: d.live && moving && moving.target === -1 && paragraphs.length ? drag.belowShadow : undefined }}
          >
            {entry.heading}
          </QuestionHeading>
        ) : first ? null : (
          <Divider kit={kit} style={{ marginTop: gapBefore }} />
        )}
        {paragraphs.length ? renderRows(entry, -1, isMeasure) : null}
        {paragraphs.length ? (
          d.blocks.map((b, i) => (
            <Fragment key={i}>
              <AnswerBlockView
                kit={kit}
                block={b}
                leadIn={design.leadIn && first && i === 0}
                data-entry={entry.id}
                data-para={b.to}
                data-para-from={b.from}
                style={{ boxShadow: d.live ? (hint(b.to) ?? (b.from > 0 ? undefined : hint(0))) : undefined }}
              />
              {i < d.blocks.length - 1 ? renderRows(entry, i, isMeasure) : null}
            </Fragment>
          ))
        ) : entry.photos.length ? null : (
          <p style={{ fontFamily: cssFont(design.type.body), fontSize: bodyPx, lineHeight: design.type.lineHeight, color: P.rule, fontStyle: "italic" }}>{t.empty}</p>
        )}
        {renderRows(entry, END, isMeasure)}
      </Fragment>
    );
  };

  const flow = (ch: PreviewChapter, k: number) => (
    <div
      lang={language}
      style={{
        width: textW,
        height: textH,
        columnWidth: textW,
        columnGap: gap,
        columnFill: "auto",
        transform: k ? `translateX(${-k * (textW + gap)}px)` : undefined,
        color: P.ink,
      }}
    >
      {ch.entries.map((e, i) => renderEntry(e, i === 0, false))}
    </div>
  );

  const pageShadow = "shadow-[0_1px_3px_rgba(0,0,0,.06),0_20px_40px_-20px_rgba(0,0,0,.25)]";
  const dragged = moving ? chapters.flatMap((c) => c.entries).flatMap((e) => e.photos).find((p) => p.id === moving.id) : null;

  return (
    <div ref={scroll} className={className}>
      <div ref={wrap} className="space-y-4">
        {pageW
          ? chapters.map((ch) => {
              const pages = pagesBy[ch.key] ?? 1;
              return (
                <Fragment key={ch.key}>
                  {/* Невидимая копия главы — только для подсчёта страниц и поиска начала ответов */}
                  <div aria-hidden style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", visibility: "hidden", pointerEvents: "none" }}>
                    <div
                      ref={(el) => {
                        if (el) measureRefs.current.set(ch.key, el);
                        else measureRefs.current.delete(ch.key);
                      }}
                      lang={language}
                      style={{ position: "relative", width: textW, height: textH, columnWidth: textW, columnGap: gap, columnFill: "auto" }}
                    >
                      {ch.entries.map((e, i) => renderEntry(e, i === 0, true))}
                    </div>
                  </div>
                  <OpenerPage kit={kit} number={ch.number} title={ch.title} epigraph={ch.epigraph} className={pageShadow} style={{ width: pageW, height: H * px }} />
                  {Array.from({ length: pages }, (_, k) => (
                    <LazyPage
                      key={k}
                      root={scroll}
                      pageId={`${ch.key}:${k}`}
                      className={`relative bg-white ${pageShadow}`}
                      style={{ width: pageW, height: H * px }}
                      onClick={(e) => {
                        if (e.timeStamp < drag.suppressClickUntil.current) return;
                        if (interactive && selectedId && !(e.target as HTMLElement).closest("[data-photo]")) onSelect?.(null);
                      }}
                    >
                      {() => (
                        <>
                          {/* Начальная полоса считается правой, поэтому первая полоса текста — левая. */}
                          <RunningHead kit={kit} bookTitle={bookTitle} chapterTitle={ch.title} recto={k % 2 === 1} />
                          <div className="absolute overflow-clip" style={{ left: side * px, top: m.marginTop * px, width: textW, height: textH }}>
                            {flow(ch, k)}
                          </div>
                          {pages > 1 ? (
                            <Folio kit={kit} recto={k % 2 === 1}>
                              {k + 1} / {pages}
                            </Folio>
                          ) : null}
                        </>
                      )}
                    </LazyPage>
                  ))}
                </Fragment>
              );
            })
          : <div className="bg-white" style={{ aspectRatio: `${W} / ${H}` }} />}
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
