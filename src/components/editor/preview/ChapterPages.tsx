"use client";

import { Fragment, memo, useEffect, useMemo, type MouseEvent, type RefObject } from "react";
import type { Messages } from "@/i18n/messages";
import type { Locale } from "@/i18n/config";
import { answerBlocks, rowsByBlock, type AnswerBlock } from "@/lib/book/answer-blocks";
import type { PreviewChapter, PreviewEntry, PreviewPhoto } from "@/lib/book/editor-model";
import { cssFont } from "@/lib/book/fonts";
import { PT_TO_MM } from "@/lib/book/formats";
import { layoutInline, normalizeStyle, splitParagraphs, type InlinePhotoStyle } from "@/lib/book/inline-photo";
import { interiorMetrics, pageSide, textArea } from "@/lib/book/page-geometry";
import { AnswerBlockView } from "@/components/interior/answer-block";
import { Divider, InlineRow, QuestionHeading } from "@/components/interior/entry";
import { Folio, RunningHead } from "@/components/interior/folio";
import type { PageKit } from "@/components/interior/kit";
import { OpenerPage } from "@/components/interior/pages";
import { LazyPage } from "./LazyPage";
import { previewPhotoLayer } from "./photo-layer";
import type { usePhotoDrag } from "./usePhotoDrag";

const END = Number.POSITIVE_INFINITY;
const PAGE_SHADOW = "shadow-[0_1px_3px_rgba(0,0,0,.06),0_20px_40px_-20px_rgba(0,0,0,.25)]";

type Item = { p: PreviewPhoto; style: InlinePhotoStyle };

/**
 * Содержимое главы для сравнения: заголовки, ответы и фото с их видом. Глава превью перерисовывается и
 * перемеряется, только когда оно меняется (или когда в ней текущий ответ).
 */
export function chapterContentKey(ch: PreviewChapter) {
  return [ch.key, ch.number, ch.title, ch.epigraph ?? "", ...ch.entries.map((e) => `${e.id}:${e.heading}:${e.answer}:` + e.photos.map((p) => `${p.id}:${p.url}:${p.caption}:` + JSON.stringify(normalizeStyle(p.inline))).join(","))].join("|");
}

export interface ChapterPagesProps {
  chapter: PreviewChapter;
  contentKey: string;
  kit: PageKit;
  /** Ширина страницы и пикселей на миллиметр. */
  pageW: number;
  px: number;
  bookTitle: string;
  language: Locale;
  t: Messages["editor"]["preview"];
  /** Полос текста в главе (по замеру). */
  pages: number;
  /** Текущий ответ, если он в этой главе, иначе null. */
  currentId: string | null;
  /** Выделенное фото, если глава текущая. */
  selectedId: string | null;
  interactive: boolean;
  /** Перетаскивание фото — только у текущей главы. */
  drag: ReturnType<typeof usePhotoDrag> | null;
  onChange?: (id: string, patch: Partial<InlinePhotoStyle>) => void;
  scroll: RefObject<HTMLDivElement | null>;
  setMeasureRef: (key: string, el: HTMLDivElement | null) => void;
  /** Перемерить полосы этой главы. */
  measure: (key: string) => void;
  onPageClick: (e: MouseEvent) => void;
}

/** Начальная полоса главы, полосы текста и невидимая копия главы для замера. */
function ChapterPagesView({ chapter: ch, contentKey, kit, pageW, px, bookTitle, language, t, pages, currentId, selectedId, interactive, drag, onChange, scroll, setMeasureRef, measure, onPageClick }: ChapterPagesProps) {
  const { format, design } = kit;
  const m = interiorMetrics[format.id];
  const side = pageSide(format);
  const area = textArea(format);
  const textW = area.w * px;
  const textH = area.h * px;
  const gap = side * 2 * px;
  const S = kit.sizes;
  const P = design.palette;
  const bodyPx = S.body * PT_TO_MM * px;
  const ptPx = (v: number) => v * PT_TO_MM * px;
  const resizing = drag?.drag?.kind === "resize" ? drag.drag : null;
  const measureThis = () => measure(ch.key);

  // Ряды фото по блокам набора (answer-blocks): −1 — перед текстом, i — после блока i, END — в конце.
  const info = useMemo(() => {
    const out = new Map<string, { paragraphs: string[]; blocks: AnswerBlock[]; layout: Map<number, Item[][]> }>();
    for (const e of ch.entries) {
      const paragraphs = splitParagraphs(e.answer);
      const items = e.photos.map((p) => {
        const style = normalizeStyle(p.inline);
        if (resizing?.id === p.id) style.width = resizing.width;
        return { p, style };
      });
      const blocks = answerBlocks(paragraphs);
      out.set(e.id, { paragraphs, blocks, layout: rowsByBlock(blocks, layoutInline(items, paragraphs.length)) });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- содержимое главы описывает contentKey
  }, [contentKey, resizing?.id, resizing?.width]);

  // Замер — только у этой главы и только когда она изменилась (или изменилась ширина полосы).
  useEffect(() => {
    measure(ch.key);
  }, [measure, ch.key, contentKey, resizing?.width]);

  const moving = drag?.moving ?? null;
  const hint = drag?.hint ?? (() => undefined);

  const renderRows = (entry: PreviewEntry, key: number, isMeasure: boolean) => {
    const d = info.get(entry.id)!;
    // Место вставки в тексте — номер абзаца, после которого встаёт ряд (последний абзац блока).
    const anchor = key === END || key < 0 ? key : d.blocks[key].to;
    // Ряд и фото рисует вёрстка книги (InlineRow — как в PDF и на разворотах), превью добавляет поверх только интерактивность.
    const layer = previewPhotoLayer({ t, kit, live: entry.id === currentId && interactive && !!drag, isMeasure, measure: measureThis, selectedId, drag: drag!, onChange });
    return (d.layout.get(key) ?? []).map((row, r) => <InlineRow key={`${anchor}-${r}`} kit={kit} row={row} layer={layer} data-entry={entry.id} data-row-anchor={anchor === END ? "end" : anchor} />);
  };

  const renderEntry = (entry: PreviewEntry, first: boolean, isMeasure: boolean) => {
    const d = info.get(entry.id)!;
    const live = entry.id === currentId;
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
            style={{ marginTop: gapBefore, boxShadow: live && moving && moving.target === -1 && paragraphs.length ? drag?.belowShadow : undefined }}
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
                style={{ boxShadow: live ? (hint(b.to) ?? (b.from > 0 ? undefined : hint(0))) : undefined }}
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

  const flow = (k: number) => (
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

  return (
    <>
      {/* Невидимая копия главы — только для подсчёта страниц и поиска начала ответов */}
      <div aria-hidden style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", visibility: "hidden", pointerEvents: "none" }}>
        <div ref={(el) => setMeasureRef(ch.key, el)} lang={language} style={{ position: "relative", width: textW, height: textH, columnWidth: textW, columnGap: gap, columnFill: "auto" }}>
          {ch.entries.map((e, i) => renderEntry(e, i === 0, true))}
        </div>
      </div>
      <OpenerPage kit={kit} number={ch.number} title={ch.title} epigraph={ch.epigraph} className={PAGE_SHADOW} style={{ width: pageW, height: format.heightMm * px }} />
      {Array.from({ length: pages }, (_, k) => (
        <LazyPage key={k} root={scroll} pageId={`${ch.key}:${k}`} className={`relative bg-white ${PAGE_SHADOW}`} style={{ width: pageW, height: format.heightMm * px }} onClick={onPageClick}>
          {() => (
            <>
              {/* Начальная полоса считается правой, поэтому первая полоса текста — левая. */}
              <RunningHead kit={kit} bookTitle={bookTitle} chapterTitle={ch.title} recto={k % 2 === 1} />
              <div className="absolute overflow-clip" style={{ left: side * px, top: m.marginTop * px, width: textW, height: textH }}>
                {flow(k)}
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
    </>
  );
}

/**
 * Глава превью перерисовывается, только если изменилось её содержимое (contentKey, а не новый объект главы)
 * или что-то, что от неё зависит: полосы, ширина, текущий ответ и перетаскивание в ней.
 */
export const ChapterPages = memo(ChapterPagesView, (a, b) => {
  for (const k of Object.keys(b) as (keyof ChapterPagesProps)[]) if (k !== "chapter" && a[k] !== b[k]) return false;
  return a.contentKey === b.contentKey;
});
