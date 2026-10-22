"use client";

import { Fragment, memo, useEffect, useMemo, type MouseEvent, type RefObject } from "react";
import type { Messages } from "@/i18n/messages";
import type { Locale } from "@/i18n/config";
import { answerBlocks, rowsByBlock, type AnswerBlock } from "@/lib/book/answer-blocks";
import { layoutMedia, type AnswerMedia } from "@/lib/book/answer-media";
import type { PreviewChapter, PreviewEntry, PreviewPhoto } from "@/lib/book/editor-model";
import { cssFont } from "@/lib/book/fonts";
import { print, PT_TO_MM } from "@/lib/book/formats";
import { layoutInline, normalizeStyle, splitParagraphs, type InlinePhotoStyle } from "@/lib/book/inline-photo";
import { interiorMetrics, pageSide, textArea } from "@/lib/book/page-geometry";
import { AnswerBlockView } from "@/components/interior/answer-block";
import { Divider, InlineRow, MediaCard, QuestionHeading } from "@/components/interior/entry";
import { RunningHead } from "@/components/interior/folio";
import type { PageKit } from "@/components/interior/kit";
import { OpenerPage } from "@/components/interior/pages";
import { LazyPage } from "./LazyPage";
import { fillFocus } from "@/lib/book/photo-crop";
import { previewPhotoLayer } from "./photo-layer";
import type { PhotoPages } from "./layout-hooks";
import type { usePhotoDrag } from "./usePhotoDrag";

const END = Number.POSITIVE_INFINITY;
const PAGE_SHADOW = "shadow-[0_1px_3px_rgba(0,0,0,.06),0_20px_40px_-20px_rgba(0,0,0,.25)]";

type Item = { p: PreviewPhoto; style: InlinePhotoStyle };

/**
 * Содержимое главы для сравнения: заголовки, ответы, фото с их видом и QR-коды. Глава превью перерисовывается и
 * перемеряется, только когда оно меняется (или когда в ней текущий ответ).
 */
export function chapterContentKey(ch: PreviewChapter) {
  return [ch.key, ch.number, ch.title, ch.epigraph ?? "", ...ch.entries.map((e) => `${e.id}:${e.heading}:${e.answer}:` + e.photos.map((p) => `${p.id}:${p.url}:${p.caption}:` + JSON.stringify(normalizeStyle(p.inline))).join(",") + `:${JSON.stringify(e.media)}`)].join("|");
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
  /** На какой полосе текста каждое фото «на всю страницу» (по замеру; тот же объект, пока не изменилось). */
  photoPages: PhotoPages;
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
function ChapterPagesView({ chapter: ch, contentKey, kit, pageW, px, bookTitle, language, t, pages, photoPages, currentId, selectedId, interactive, drag, onChange, scroll, setMeasureRef, measure, onPageClick }: ChapterPagesProps) {
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
    const out = new Map<string, { paragraphs: string[]; blocks: AnswerBlock[]; layout: Map<number, Item[][]>; pages: Map<number, Item[][]>; media: Map<number, AnswerMedia[]> }>();
    for (const e of ch.entries) {
      const paragraphs = splitParagraphs(e.answer);
      const all = e.photos.map((p) => {
        const style = normalizeStyle(p.inline);
        if (resizing?.id === p.id) style.width = resizing.width;
        return { p, style };
      });
      // Фото «на всю страницу» — не в ряду текста, а своей полосой (как в книге: история прерывается и продолжается после).
      const items = all.filter((x) => !x.style.page);
      const pageItems = all.filter((x) => x.style.page);
      const blocks = answerBlocks(paragraphs);
      out.set(e.id, {
        paragraphs,
        blocks,
        layout: rowsByBlock(blocks, layoutInline(items, paragraphs.length)),
        pages: rowsByBlock(blocks, layoutInline(pageItems, paragraphs.length)),
        media: rowsByBlock(blocks, layoutMedia(e.media, paragraphs.length)),
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- содержимое главы описывает contentKey
  }, [contentKey, resizing?.id, resizing?.width]);

  // Замер — только у этой главы и только когда она изменилась (или изменилась ширина полосы).
  useEffect(() => {
    measure(ch.key);
  }, [measure, ch.key, contentKey, resizing?.width]);

  // Фото на всю страницу главы — с ответом и местом в тексте: их рисуют полосы поверх колонок.
  const pagePhotos = useMemo(
    () =>
      ch.entries.flatMap((e) => {
        const d = info.get(e.id)!;
        return [...d.pages].flatMap(([key, rows]) => rows.flat().map((item) => ({ item, entryId: e.id, anchor: key === END ? "end" : key < 0 ? key : d.blocks[key].to })));
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- содержимое главы описывает contentKey (через info)
    [info],
  );

  const moving = drag?.moving ?? null;
  const hint = drag?.hint ?? (() => undefined);

  /** Фото на всю страницу поверх полосы: лист целиком, с вылетами, как в PDF, — лишнее срезает край страницы. */
  const pagePhoto = ({ item, entryId, anchor }: (typeof pagePhotos)[number]) => {
    const layer = previewPhotoLayer({ t, kit, live: entryId === currentId && interactive && !!drag, isMeasure: false, measure: measureThis, selectedId, drag: drag!, onChange });
    const fig = layer(item, { outerW: 0, outerH: 0 } as Parameters<typeof layer>[1]);
    return (
      <div
        key={`pg-${item.p.id}`}
        {...fig.figure}
        data-entry={entryId}
        data-row-anchor={anchor}
        className="absolute inset-0 overflow-hidden"
        // Рамка выделения — внутри листа: снаружи её срежет край страницы.
        style={{ ...fig.figure?.style, position: "absolute", ...(fig.frame ? { ...fig.frame, outlineOffset: -3 } : null) }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- фото клиента на всю страницу в превью */}
        <img
          src={item.p.url}
          alt={fig.img?.alt ?? ""}
          draggable={false}
          style={{
            position: "absolute",
            left: -print.bleedMm * px,
            top: -print.bleedMm * px,
            width: pageW + print.bleedMm * 2 * px,
            height: (format.heightMm + print.bleedMm * 2) * px,
            maxWidth: "none",
            objectFit: item.style.pageFit === "contain" ? "contain" : "cover",
            // Кадр — как в PDF (fillFocus): точка из редактора фото, иначе 30% от верха.
            objectPosition: (({ x, y }) => `${x * 100}% ${y * 100}%`)(fillFocus({ inline: item.style })),
            background: "#fff",
          }}
        />
      </div>
    );
  };

  const renderRows = (entry: PreviewEntry, key: number, isMeasure: boolean) => {
    const d = info.get(entry.id)!;
    // Место вставки в тексте — номер абзаца, после которого встаёт ряд (последний абзац блока).
    const anchor = key === END || key < 0 ? key : d.blocks[key].to;
    // Ряд и фото рисует вёрстка книги (InlineRow — как в PDF и на разворотах), превью добавляет поверх только интерактивность.
    const layer = previewPhotoLayer({ t, kit, live: entry.id === currentId && interactive && !!drag, isMeasure, measure: measureThis, selectedId, drag: drag!, onChange });
    return [
      ...(d.layout.get(key) ?? []).map((row, r) => <InlineRow key={`${anchor}-${r}`} kit={kit} row={row} layer={layer} data-entry={entry.id} data-row-anchor={anchor === END ? "end" : anchor} />),
      // Фото на всю страницу — целая колонка (разрыв до и после): здесь только пустая заглушка, снимок рисуется поверх
      // полосы, на которую она попала (pagePhoto). Внутри колонок его не нарисовать: Chrome ставит абсолютный блок
      // в элементе с break-before по месту до разрыва — внизу прошлой полосы, а своя остаётся пустой.
      ...(d.pages.get(key) ?? []).flat().map((item) => (
        <div
          key={`pg-${item.p.id}`}
          data-page-photo={item.p.id}
          data-entry={entry.id}
          data-row-anchor={anchor === END ? "end" : anchor}
          style={{ height: textH, breakBefore: "column", breakAfter: "column", breakInside: "avoid" }}
        />
      )),
      // QR-коды — после фото того же места; в превью без ссылки (клик по странице выбирает ответ).
      ...(d.media.get(key) ?? []).map((m) => <MediaCard key={`${anchor}-m-${m.id}`} kit={kit} media={m} data-entry={entry.id} data-media={m.id} />),
    ];
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
        ) : entry.photos.length || entry.media.length ? null : (
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
        <LazyPage key={k} root={scroll} pageId={`${ch.key}:${k}`} className={`relative overflow-hidden bg-white ${PAGE_SHADOW}`} style={{ width: pageW, height: format.heightMm * px }} onClick={onPageClick}>
          {() => (
            <>
              {/* Начальная полоса считается правой, поэтому первая полоса текста — левая. */}
              <RunningHead kit={kit} bookTitle={bookTitle} chapterTitle={ch.title} recto={k % 2 === 1} />
              {/* Соседние колонки — за краем листа (его обрезает сама страница). */}
              <div className="absolute" style={{ left: side * px, top: m.marginTop * px, width: textW, height: textH }}>
                {flow(k)}
              </div>
              {pagePhotos.filter((x) => photoPages[x.item.p.id] === k).map(pagePhoto)}
              {/* Номера страниц нет: здесь вёрстка браузера, а номер в книге — у полосы макета (растр PDF). */}
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
