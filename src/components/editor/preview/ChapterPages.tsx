"use client";

import { Fragment, memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type RefObject } from "react";
import type { Messages } from "@/i18n/messages";
import type { Locale } from "@/i18n/config";
import { answerBlocks, rowsByBlock, type AnswerBlock } from "@/lib/book/answer-blocks";
import { layoutMedia, type AnswerMedia } from "@/lib/book/answer-media";
import type { BookContent } from "@/lib/book/layout";
import type { PreviewChapter, PreviewEntry, PreviewPagePhoto, PreviewPhoto } from "@/lib/book/editor-model";
import { cssFont } from "@/lib/book/fonts";
import { MM_TO_PT, print, PT_TO_MM } from "@/lib/book/formats";
import { applyDecision, nextDecisions, type FlowDecisions } from "@/lib/book/flow-decisions";
import { framedBox, layoutInline, normalizeStyle, placedByAuthor, splitParagraphsDetailed, type InlinePhotoStyle } from "@/lib/book/inline-photo";
import { blockSpace, flowMinLead, INLINE_ROW, MEDIA_CARD } from "@/lib/book/typesetting";
import { interiorMetrics, pageSide, textArea } from "@/lib/book/page-geometry";
import { AnswerBlockView } from "@/components/interior/answer-block";
import { ChapterTail, Divider, InlineRow, MediaCard, QuestionHeading } from "@/components/interior/entry";
import { stackedTop } from "@/components/interior/entry-gap";
import { copyFlow, flowMark, measureFlow, NO_FLOW } from "@/components/interior/flow-measure";
import { RunningHead } from "@/components/interior/folio";
import { ChapterHead } from "@/components/interior/pages";
import type { PageKit } from "@/components/interior/kit";
import { LazyPage } from "./LazyPage";
import { PAGE_SHADOW, PreviewOpener, PreviewPhotoPages } from "./book-pages";
import { fillFocus } from "@/lib/book/photo-crop";
import { previewPhotoLayer } from "./photo-layer";
import type { PhotoPages } from "./layout-hooks";
import type { OnPreviewTarget } from "./targets";
import type { usePhotoDrag } from "./usePhotoDrag";

const END = Number.POSITIVE_INFINITY;

/**
 * Проходов доводки у одной главы превью не больше: каждый — повторная отрисовка в useLayoutEffect, а React допускает
 * их подряд не больше 50. Главе обычно хватает 1–3 (PDF нужно больше: у него проходы на всю книгу сразу).
 */
const PREVIEW_PASSES = 20;

type Item = { p: PreviewPhoto; style: InlinePhotoStyle };

/**
 * Содержимое главы для сравнения: заголовки, ответы, фото с их видом и QR-коды, фото главы и страницы фото после
 * неё. Глава превью перерисовывается и перемеряется, только когда оно меняется (или когда в ней текущий ответ).
 */
export function chapterContentKey(ch: PreviewChapter) {
  const pagePhoto = (p: PreviewPagePhoto) => `${p.id}:${p.url}:${p.caption}:${p.layout}:${p.auto ? 1 : 0}:${JSON.stringify(p.crop ?? null)}:${p.contain ? 1 : 0}`;
  return [
    ch.key,
    ch.number,
    ch.title,
    ch.epigraph ?? "",
    ch.openerPhoto ? pagePhoto(ch.openerPhoto) : "",
    (ch.photoPages ?? []).map((g) => g.map(pagePhoto).join("+")).join(","),
    ...ch.entries.map((e) => `${e.id}:${e.heading}:${e.answer}:${e.pageBreak ? 1 : 0}:` + e.photos.map((p) => `${p.id}:${p.url}:${p.caption}:` + JSON.stringify(normalizeStyle(p.inline))).join(",") + `:${JSON.stringify(e.media)}`),
  ].join("|");
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
  /** Подписи мест фото в превью; нет (стенд снимков, тесты) — полосы без чипов и пунктирного места. */
  tp?: Messages["editor"]["previewPhotos"];
  /** Нажатие на начальную полосу и страницы фото (ключи — как у полос сборки); нет — превью только смотрят. */
  onTarget?: OnPreviewTarget;
  /** Полос текста в главе (по замеру). */
  pages: number;
  /** Начальная полоса слева (BookContent.openersLeft): первая полоса текста — правая; иначе начальная справа. */
  openersLeft?: boolean;
  /** Глава без начальной полосы (BookContent.chapterStart): inline — номер и название над текстом, none — чистый лист. */
  start?: BookContent["chapterStart"];
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
function ChapterPagesView({ chapter: ch, contentKey, kit, pageW, px, bookTitle, language, t, tp, onTarget, pages, openersLeft = false, start, photoPages, currentId, selectedId, interactive, drag, onChange, scroll, setMeasureRef, measure, onPageClick }: ChapterPagesProps) {
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
  const spacing = drag?.drag?.kind === "space" ? drag.drag : null;
  const measureThis = () => measure(ch.key);

  // Ряды фото по блокам набора (answer-blocks): −1 — перед текстом, i — после блока i, END — в конце.
  const info = useMemo(() => {
    const out = new Map<string, { paragraphs: string[]; blocks: AnswerBlock[]; layout: Map<number, Item[][]>; pages: Map<number, Item[][]>; media: Map<number, AnswerMedia[]> }>();
    for (const e of ch.entries) {
      const { paragraphs, breaks } = splitParagraphsDetailed(e.answer);
      const all = e.photos.map((p) => {
        const style = normalizeStyle(p.inline);
        if (resizing?.id === p.id) style.width = resizing.width;
        // Отступ, который тянут сейчас: тем же правилом, что сохранит normalizeStyle (меньше порога — без отступа).
        if (spacing?.id === p.id) {
          const space = normalizeStyle({ ...style, spaceAbove: spacing.space }).spaceAbove;
          if (space) style.spaceAbove = space;
          else delete style.spaceAbove;
        }
        return { p, style };
      });
      // Фото «на всю страницу» — не в ряду текста, а своей полосой (как в книге: история прерывается и продолжается после).
      const items = all.filter((x) => !x.style.page);
      const pageItems = all.filter((x) => x.style.page);
      const blocks = answerBlocks(paragraphs, { plain: design.plainAnswers, breaks });
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
  }, [contentKey, resizing?.id, resizing?.width, spacing?.id, spacing?.space]);

  // Высота самих фото в каждом ряду, pt (без подписи) — для уменьшения ряда доводкой, как rowHeights у PDF. Ряд с фото
  // «не уменьшать» и ряд, поставленный автором, в доводку не идут: без высоты их не уменьшат.
  const rowHeights = useMemo(() => {
    const out = new Map<string, number>();
    for (const e of ch.entries)
      for (const [key, rows] of info.get(e.id)!.layout)
        rows.forEach((row, r) => {
          if (!placedByAuthor(row[0].style) && !row.some((x) => x.style.keepSize)) out.set(`r:${e.id}:${key}:${r}`, Math.max(...row.map((x) => framedBox(x.p, x.style, area.w * MM_TO_PT, area.h * MM_TO_PT, row.length).outerH)));
        });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- содержимое главы описывает contentKey (через info)
  }, [info, format]);

  // Доводка вёрстки — та же, что у PDF (lib/book/flow-decisions.ts), по раскладке копии для замера: после каждой
  // отрисовки читаем, где встали блоки, и добавляем решения, пока они есть (не больше PREVIEW_PASSES проходов). Решения
  // считаются заново, когда меняется содержимое главы, ширина полосы или догрузились шрифты; пока фото тянут за уголок
  // или ручку отступа — остаются прежние. Проходы идут в useLayoutEffect: экран видит только итог.
  const measureEl = useRef<HTMLDivElement | null>(null);
  const [fontsTick, setFontsTick] = useState(0);
  useEffect(() => {
    let live = true;
    void document.fonts?.ready.then(() => live && setFontsTick((n) => n + 1));
    return () => {
      live = false;
    };
  }, []);
  const flowKey = `${contentKey}|${px}|${start ?? ""}|${fontsTick}|${kit.hyphenate ? 1 : 0}`;
  const [flowState, setFlowState] = useState<{ key: string; flow: FlowDecisions; passes: number }>({ key: "", flow: NO_FLOW, passes: 0 });
  const fresh = flowState.key === flowKey;
  const dragging = !!(resizing || spacing);
  const flow = fresh || dragging ? flowState.flow : NO_FLOW;
  useLayoutEffect(() => {
    const root = measureEl.current;
    if (!root || !textW || dragging) return;
    const passes = fresh ? flowState.passes : 0;
    if (passes >= PREVIEW_PASSES) return;
    const decisions = nextDecisions(measureFlow(root, ch.key, PT_TO_MM * px, area.h * MM_TO_PT), flow, rowHeights, flowMinLead(design, S));
    if (!decisions.length) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- раскладка браузера (DOM) — внешняя система: решения по её замеру
      if (!fresh) setFlowState({ key: flowKey, flow, passes });
      return;
    }
    const next = copyFlow(flow);
    for (const d of decisions) applyDecision(next, d);
    setFlowState({ key: flowKey, flow: next, passes: passes + 1 });
  }, [flowKey, flow, fresh, flowState.passes, rowHeights, dragging, textW, px, ch.key, area.h, design, S]);

  // Замер — только у этой главы и только когда она изменилась (или изменилась ширина полосы, или решения доводки).
  useEffect(() => {
    measure(ch.key);
  }, [measure, ch.key, contentKey, resizing?.width, spacing?.space, start, flow, kit]);

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

  /**
   * Ряды фото, фото на всю страницу и QR-коды в одном месте ответа. prevAfter — поле снизу у того, что стоит перед ними,
   * pt: складывается с полем сверху первого (stackedTop), как в PDF. fresh — ответ стоит в начале текста главы без
   * заголовка: его первый ряд и так в верху полосы («с новой страницы» разрыва не делает).
   */
  const renderRows = (entry: PreviewEntry, key: number, isMeasure: boolean, prevAfter = 0, fresh = false) => {
    const d = info.get(entry.id)!;
    const lead = d.blocks.length ? -1 : END;
    let after = prevAfter;
    const top = (own: number) => {
      const v = stackedTop(own, after);
      after = 0;
      return v === undefined ? undefined : { marginTop: ptPx(v) };
    };
    // Место вставки в тексте — номер абзаца, после которого встаёт ряд (последний абзац блока).
    const anchor = key === END || key < 0 ? key : d.blocks[key].to;
    // Ряд и фото рисует вёрстка книги (InlineRow — как в PDF и на разворотах), превью добавляет поверх только интерактивность.
    const layer = previewPhotoLayer({ t, kit, live: entry.id === currentId && interactive && !!drag, isMeasure, measure: measureThis, selectedId, drag: drag!, onChange });
    return [
      ...(d.layout.get(key) ?? []).map((row, r) => {
        const freshRow = fresh && key === lead && r === 0;
        // Ряд «с новой страницы» начинается с полосы без отбивки сверху; ряд, поставленный автором, — вид f (как в PDF).
        const breaksRow = !!row[0].style.breakBefore && !freshRow;
        const mark = `${placedByAuthor(row[0].style) ? "f" : "r"}:${entry.id}:${key}:${r}`;
        const gap = top(S.body * INLINE_ROW.before);
        return (
          <InlineRow
            key={`${anchor}-${r}`}
            kit={kit}
            row={row}
            layer={layer}
            fresh={freshRow}
            scale={flow.rowScale.get(mark)}
            offset={flow.rowOffset.get(mark)}
            style={breaksRow ? undefined : gap}
            {...flowMark(mark)}
            data-entry={entry.id}
            data-row-anchor={anchor === END ? "end" : anchor}
          />
        );
      }),
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
      ...(d.media.get(key) ?? []).map((m) => <MediaCard key={`${anchor}-m-${m.id}`} kit={kit} media={m} style={top(S.body * MEDIA_CARD.before)} {...flowMark(`b:${entry.id}:m${key}:${m.id}`)} data-entry={entry.id} data-media={m.id} />),
    ];
  };
  /** Поле снизу того, что встанет перед следующим блоком, после рядов в месте key (они его забирают). */
  const afterRows = (entry: PreviewEntry, key: number, prevAfter: number) => {
    const d = info.get(entry.id)!;
    return (d.layout.get(key)?.length || d.pages.get(key)?.length || d.media.get(key)?.length) ? 0 : prevAfter;
  };

  const renderEntry = (entry: PreviewEntry, first: boolean, isMeasure: boolean) => {
    const d = info.get(entry.id)!;
    const paragraphs = d.paragraphs;
    // Отбивки — как в PDF: перед заголовком больше, перед ответом без заголовка — разделитель.
    // Именно margin (а не распорка): на переносе в новую колонку-страницу браузер его отбрасывает.
    // «С новой страницы» — разрыв колонки перед историей и без отбивки сверху, как в PDF (Entry: break и marginTop 0).
    const breaks = !first && (!!entry.pageBreak || flow.breakBefore.has(entry.id));
    const gapBefore = first || breaks ? 0 : ptPx(entry.heading ? S.beforeHeading : S.beforeHeadless);
    // Первый ответ главы без заголовка (и без названия главы над текстом) — в самом верху полосы. Ответ не первый —
    // над ним заголовок или разделитель, как в PDF.
    const fresh = first && !entry.heading && start !== "inline";
    // Поле снизу у заголовка или разделителя — складывается с полем сверху первого блока, как в PDF.
    const headAfter = entry.heading ? S.afterHeading : first ? 0 : design.divider === "space" || design.divider === "stars" ? S.beforeHeadless : 0;
    /** Поле сверху блока i с учётом поля того, что стоит перед ним (заголовок, прошлый блок или ряды фото). */
    const topOf = (b: AnswerBlock, i: number) => {
      const prev = i === 0 ? afterRows(entry, -1, headAfter) : afterRows(entry, i - 1, blockSpace(design, S, d.blocks[i - 1].kind).after);
      const v = stackedTop(blockSpace(design, S, b.kind).before, prev);
      return v === undefined ? {} : { marginTop: ptPx(v) };
    };
    return (
      <Fragment key={entry.id}>
        <span data-marker={entry.id} style={{ display: "block", height: 1, breakAfter: "avoid", ...(breaks ? { breakBefore: "column" as const } : {}) }} />
        {entry.heading ? (
          <QuestionHeading
            kit={kit}
            {...flowMark(`h:${entry.id}`)}
            data-entry={entry.id}
            data-para={-1}
            style={{ marginTop: gapBefore, boxShadow: moving?.target.entry === entry.id && moving.target.anchor === -1 && paragraphs.length ? drag?.belowShadow : undefined }}
          >
            {entry.heading}
          </QuestionHeading>
        ) : first ? null : (
          <Divider kit={kit} {...flowMark(`h:${entry.id}`)} style={{ marginTop: gapBefore }} />
        )}
        {paragraphs.length ? renderRows(entry, -1, isMeasure, headAfter, fresh) : null}
        {paragraphs.length ? (
          d.blocks.map((b, i) => (
            <Fragment key={i}>
              <AnswerBlockView
                kit={kit}
                block={b}
                leadIn={design.leadIn && first && i === 0}
                // Как в PDF (TextBlock): буквица — в начале главы, красная строка — по первому блоку ответа (indentFirst).
                dropCap={first && i === 0}
                first={i === 0}
                {...flowMark(`${b.kind === "lede" ? "k" : "b"}:${entry.id}:${i}`)}
                data-entry={entry.id}
                data-para={b.to}
                data-para-from={b.from}
                style={{ boxShadow: hint(entry.id, b.to) ?? (b.from > 0 ? undefined : hint(entry.id, 0)), ...topOf(b, i) }}
              />
              {i < d.blocks.length - 1 ? renderRows(entry, i, isMeasure, blockSpace(design, S, b.kind).after) : null}
            </Fragment>
          ))
        ) : entry.photos.length || entry.media.length ? null : (
          <p style={{ fontFamily: cssFont(design.type.body), fontSize: bodyPx, lineHeight: design.type.lineHeight, color: P.rule, fontStyle: "italic" }}>{t.empty}</p>
        )}
        {renderRows(entry, END, isMeasure, d.blocks.length ? blockSpace(design, S, d.blocks[d.blocks.length - 1].kind).after : headAfter, fresh)}
      </Fragment>
    );
  };

  // Глава без начальной полосы (inline): номер и название — в начале её текста (как в PDF); чистый лист — без них.
  const head = start === "inline" ? <ChapterHead kit={kit} number={ch.number} title={ch.title} epigraph={ch.epigraph} /> : null;
  // Концовка главы — виньетка после текста, как в PDF (ChapterBody); у главы без текста её нет.
  const tail = ch.entries.some((e) => e.answer || e.photos.length || e.media.length) && !flow.noTail.has(ch.key) ? <ChapterTail kit={kit} {...flowMark(`t:${ch.key}`)} /> : null;

  const textFlow = (k: number) => (
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
      {head}
      {ch.entries.map((e, i) => renderEntry(e, i === 0, false))}
      {tail}
    </div>
  );

  return (
    <>
      {/* Невидимая копия главы — только для подсчёта страниц и поиска начала ответов */}
      <div aria-hidden style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", visibility: "hidden", pointerEvents: "none" }}>
        <div
          ref={(el) => {
            measureEl.current = el;
            setMeasureRef(ch.key, el);
          }}
          lang={language} style={{ position: "relative", width: textW, height: textH, columnWidth: textW, columnGap: gap, columnFill: "auto" }}>
          {head}
          {ch.entries.map((e, i) => renderEntry(e, i === 0, true))}
          {tail}
        </div>
      </div>
      {/* Начальная полоса: фото главы, как в печати, — или полоса с названием и пунктирное место фото (только здесь). */}
      {start ? null : (
      <PreviewOpener
        kit={kit}
        number={ch.number}
        title={ch.title}
        epigraph={ch.epigraph}
        photo={ch.openerPhoto}
        placeholder={!!design.opener.photo && !!onTarget}
        style={{ width: pageW, height: format.heightMm * px }}
        tp={tp}
        target={{ kind: "opener", chapterKey: ch.key }}
        label={tp?.openerAria(ch.title) ?? ""}
        onTarget={design.opener.photo ? onTarget : undefined}
      />
      )}
      {Array.from({ length: pages }, (_, k) => (
        <LazyPage key={k} root={scroll} pageId={`${ch.key}:${k}`} className={`relative overflow-hidden bg-white ${PAGE_SHADOW}`} style={{ width: pageW, height: format.heightMm * px }} onClick={onPageClick}>
          {() => (
            <>
              {/* Первая полоса текста — напротив начальной: правая, если та слева (как в PDF), иначе левая. */}
              <RunningHead kit={kit} bookTitle={bookTitle} chapterTitle={ch.title} recto={k % 2 === (openersLeft || start ? 0 : 1)} />
              {/* Соседние колонки — за краем листа (его обрезает сама страница). */}
              <div className="absolute" style={{ left: side * px, top: m.marginTop * px, width: textW, height: textH }}>
                {textFlow(k)}
              </div>
              {pagePhotos.filter((x) => photoPages[x.item.p.id] === k).map(pagePhoto)}
              {/* Номера страниц нет: здесь вёрстка браузера, а номер в книге — у полосы макета (растр PDF). */}
            </>
          )}
        </LazyPage>
      ))}
      {/* Страницы фото после главы — как в PDF: после всего текста главы. */}
      {ch.photoPages?.length ? (
        <PreviewPhotoPages
          kit={kit}
          pages={ch.photoPages}
          pageW={pageW}
          pageH={format.heightMm * px}
          scroll={scroll}
          idPrefix={ch.key}
          tp={tp}
          target={(group) => ({ kind: "photo", chapterKey: ch.key, ...(group.length === 1 ? { photoId: group[0].id } : {}) })}
          label={tp?.photoPageAria ?? ""}
          chip={onTarget ? tp?.afterChip(ch.photoPages.flat().length) : undefined}
          onTarget={onTarget}
        />
      ) : null}
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
