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
import type { FlowDecisions } from "@/lib/book/flow-decisions";
import { framedBox, layoutInline, normalizeStyle, placedByAuthor, splitParagraphsDetailed, type InlinePhotoStyle } from "@/lib/book/inline-photo";
import { flowMinLead } from "@/lib/book/typesetting";
import { interiorMetrics, pageSide, textArea } from "@/lib/book/page-geometry";
import { AnswerBlockView } from "@/components/interior/answer-block";
import { ChapterTail, Divider, InlineRow, keepWithNext, MediaCard, QuestionHeading } from "@/components/interior/entry";
import { gapAbove } from "@/components/interior/entry-gap";
import { flowMark, NO_FLOW } from "@/components/interior/flow-measure";
import { breakBefore } from "@/components/interior/breaks";
import { paginateChapter, type ChapterPagination, type Measured, type TreeEntry } from "./pdf-tree";
import { Folio, folioText, RunningHead } from "@/components/interior/folio";
import { PAPER } from "@/lib/book/interiors";
import { ChapterHead } from "@/components/interior/pages";
import type { PageKit } from "@/components/interior/kit";
import { LazyPage } from "./LazyPage";
import { PAGE_SHADOW, PreviewOpener, PreviewPhotoPages } from "./book-pages";
import { fillFocus } from "@/lib/book/photo-crop";
import { previewPhotoLayer } from "./photo-layer";
import { NO_PHOTO_PAGES, type ChapterLayout, type PhotoPages } from "./layout-hooks";
import type { OnPreviewTarget } from "./targets";
import type { usePhotoDrag } from "./usePhotoDrag";

const END = Number.POSITIVE_INFINITY;

/** Запас высоты колонки, мм, когда полосы ставит разбивка, как у PDF: доли пикселя не переносят строку раньше. */
const FLOW_SLACK = 12;

/** Замер неделимых блоков копии для замера (пометки data-flow и data-pid): высота и поля внутри, pt. */
function measureLeaves(root: HTMLElement, ptPx: number): Map<string, Measured> {
  const out = new Map<string, Measured>();
  for (const el of root.querySelectorAll<HTMLElement>("[data-flow], [data-pid]")) {
    const id = el.getAttribute("data-pid") ?? el.getAttribute("data-flow")!;
    const cs = getComputedStyle(el);
    // Блок, разбитый колонками копии, — сумма кусков (у браузера кусок тянется до конца колонки — берём строки).
    const rects = [...el.getClientRects()];
    const height = rects.length > 1 ? contentHeight(el) : (rects[0]?.height ?? 0);
    out.set(id, { height: height / ptPx, padTop: parseFloat(cs.paddingTop) / ptPx, padBottom: parseFloat(cs.paddingBottom) / ptPx });
  }
  return out;
}

/** Высота содержимого блока, разбитого на колонки: по строкам текста в каждой колонке. */
function contentHeight(el: HTMLElement) {
  const range = document.createRange();
  range.selectNodeContents(el);
  const cols = new Map<number, { top: number; bottom: number }>();
  for (const r of range.getClientRects()) {
    if (r.height <= 0) continue;
    const c = cols.get(Math.round(r.left)) ?? { top: Infinity, bottom: -Infinity };
    cols.set(Math.round(r.left), { top: Math.min(c.top, r.top), bottom: Math.max(c.bottom, r.bottom) });
  }
  const cs = getComputedStyle(el);
  return [...cols.values()].reduce((a, c) => a + c.bottom - c.top, 0) + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
}

/** Полосы главы для превью: число, места фото на всю страницу и начала ответов (первый кусок ответа, верх в px). */
function chapterLayout(res: ChapterPagination, entries: readonly PreviewEntry[], ptPx: number): ChapterLayout {
  const markers: ChapterLayout["markers"] = {};
  const ids = new Set(entries.map((e) => e.id));
  for (const p of res.pieces) {
    const item = p.id.split(":")[1];
    if (ids.has(item) && !markers[item]) markers[item] = { page: p.page, top: (p.top - p.marginTop) * ptPx };
  }
  return { pages: res.pages, photos: Object.keys(res.photos).length ? res.photos : NO_PHOTO_PAGES, markers };
}


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
  /** Номер первой полосы текста главы в книге — колонцифры и стороны полос; нет — без номеров. */
  firstPage?: number;
  /** Перед начальной полосой — пустая (начальная полоса слева, а выпала бы справа). */
  blankBefore?: boolean;
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
  /** Полосы главы по разбивке, как у PDF (null — снова колонками браузера). */
  report?: (key: string, layout: ChapterLayout | null) => void;
  onPageClick: (e: MouseEvent) => void;
}

/** Начальная полоса главы, полосы текста и невидимая копия главы для замера. */
function ChapterPagesView({ chapter: ch, contentKey, kit, pageW, px, bookTitle, language, t, tp, onTarget, pages, openersLeft = false, firstPage, blankBefore = false, start, photoPages, currentId, selectedId, interactive, drag, onChange, scroll, setMeasureRef, measure, report, onPageClick }: ChapterPagesProps) {
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

  // Полосы и доводка вёрстки — как у PDF: дерево главы (pdf-tree.ts) по замеру неделимых блоков копии для замера,
  // разбивка на полосы по правилам react-pdf (lib/book/paginate.ts) и решения доводки тем же кодом (flow-decisions) —
  // проходами, пока есть что решать. Считается заново, когда меняется содержимое главы, ширина полосы, набор (шрифты
  // догрузились); пока фото тянут за уголок или ручку отступа — остаются прежние. Разрывы полос ставят сами блоки
  // (visibleKit.breaks), браузер колонки не ломает. Дерева нет (строки ещё не готовы) — полосы ставит браузер.
  const measureEl = useRef<HTMLDivElement | null>(null);
  const [fontsTick, setFontsTick] = useState(0);
  useEffect(() => {
    let live = true;
    void document.fonts?.ready.then(() => live && setFontsTick((n) => n + 1));
    return () => {
      live = false;
    };
  }, []);
  const flowKey = `${contentKey}|${px}|${start ?? ""}|${fontsTick}|${kit.breaker ? 1 : 0}|${kit.version ?? 0}`;
  const [pdf, setPdf] = useState<{ key: string; res: ChapterPagination | null }>({ key: "", res: null });
  const dragging = !!(resizing || spacing);
  const res = pdf.key === flowKey || dragging ? pdf.res : null;
  const flow = res?.flow ?? NO_FLOW;
  const visibleKit = useMemo(() => (res ? { ...kit, breaks: res.breaks, dropSplit: res.flow.dropSplit } : kit), [kit, res]);
  const hasText = ch.entries.some((e) => e.answer || e.photos.length || e.media.length);
  useLayoutEffect(() => {
    const root = measureEl.current;
    if (!root || !textW || dragging || pdf.key === flowKey) return;
    const ptPx = PT_TO_MM * px;
    const entries: TreeEntry[] = ch.entries.map((e) => {
      const d = info.get(e.id)!;
      return { id: e.id, heading: e.heading, pageBreak: e.pageBreak, blocks: d.blocks, rows: d.layout, pages: d.pages, media: d.media };
    });
    const next = paginateChapter({ kit, chapterKey: ch.key, entries, start, measured: measureLeaves(root, ptPx), hasText, rowHeights, minLead: flowMinLead(design, S), pageHeight: area.h * MM_TO_PT });
    setPdf({ key: flowKey, res: next });
    const layout = next ? chapterLayout(next, ch.entries, ptPx) : null;
    report?.(ch.key, layout);
    // Разбивка — и в разметке копии: по ней сверяют превью с PDF (scripts/visual/parity.ts).
    if (layout && next) {
      const first = new Map<string, [number, number, number]>();
      for (const p of next.pieces) if (!first.has(p.id)) first.set(p.id, [p.page, Math.round(p.top * 10) / 10, Math.round(p.bottom * 10) / 10]);
      root.dataset.pdfLayout = JSON.stringify({ chapter: ch.key, pages: layout.pages, markers: Object.fromEntries(Object.entries(layout.markers).map(([k, v]) => [k, v.page])), blocks: [...first] });
    }
    else delete root.dataset.pdfLayout;
  }, [flowKey, pdf.key, dragging, textW, px, ch.key, ch.entries, info, kit, start, hasText, rowHeights, design, S, area.h, report]);

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

  /** Разметка главы набором k с решениями доводки f: копия для замера — без решений и разрывов, полосы — с ними. */
  const render = (k: PageKit, f: FlowDecisions) => {
  /**
     * Ряды фото, фото на всю страницу и QR-коды в одном месте ответа. fresh — ответ стоит в начале текста главы без
     * заголовка: его первый ряд и так в верху полосы («с новой страницы» разрыва не делает).
     */
    const renderRows = (entry: PreviewEntry, key: number, isMeasure: boolean, fresh = false) => {
      const d = info.get(entry.id)!;
      const lead = d.blocks.length ? -1 : END;
      // Место вставки в тексте — номер абзаца, после которого встаёт ряд (последний абзац блока).
      const anchor = key === END || key < 0 ? key : d.blocks[key].to;
      // Ряд и фото рисует вёрстка книги (InlineRow — как в PDF и на разворотах), превью добавляет поверх только интерактивность.
      const layer = previewPhotoLayer({ t, kit, live: entry.id === currentId && interactive && !!drag, isMeasure, measure: measureThis, selectedId, drag: drag!, onChange });
      return [
        ...(d.layout.get(key) ?? []).map((row, r) => {
          const freshRow = fresh && key === lead && r === 0;
          // Ряд «с новой страницы» начинается с полосы без отбивки сверху; ряд, поставленный автором, — вид f (как в PDF).
          const mark = `${placedByAuthor(row[0].style) ? "f" : "r"}:${entry.id}:${key}:${r}`;
          return (
            <InlineRow
              key={`${anchor}-${r}`}
              kit={k}
              row={row}
              layer={layer}
              fresh={freshRow}
              scale={f.rowScale.get(mark)}
              offset={f.rowOffset.get(mark)}
              style={breakBefore(k, mark)}
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
        ...(d.media.get(key) ?? []).map((m) => <MediaCard key={`${anchor}-m-${m.id}`} kit={k} media={m} style={breakBefore(k, `b:${entry.id}:m${key}:${m.id}`)} {...flowMark(`b:${entry.id}:m${key}:${m.id}`)} data-entry={entry.id} data-media={m.id} />),
      ];
    };
    const renderEntry = (entry: PreviewEntry, first: boolean, isMeasure: boolean) => {
      const d = info.get(entry.id)!;
      const paragraphs = d.paragraphs;
      // Отбивки — как в PDF: перед заголовком больше, перед ответом без заголовка — разделитель.
      // Именно margin (а не распорка): на переносе в новую колонку-страницу браузер его отбрасывает.
      // «С новой страницы» — разрыв колонки перед историей и без отбивки сверху, как в PDF (Entry: break и marginTop 0).
      const breaks = !first && (!!entry.pageBreak || f.breakBefore.has(entry.id));
      const gapBefore = first || breaks ? 0 : entry.heading ? S.beforeHeading : S.beforeHeadless;
      // Первый ответ главы без заголовка (и без названия главы над текстом) — в самом верху полосы. Ответ не первый —
      // над ним заголовок или разделитель, как в PDF.
      const fresh = first && !entry.heading && start !== "inline";
      // Отбивка перед заголовком или разделителем — полем внутри (gapAbove), как у react-pdf: на новой полосе остаётся.
      const gap = gapAbove(gapBefore, k.u.pt);
      return (
        <Fragment key={entry.id}>
          {/* Метка начала ответа — без высоты: не отделяет отбивку заголовка от разрыва и не добавляет пиксель, как в PDF. */}
          {/* Разрывы по разбивке, как у PDF (k.breaks), ставят сами блоки — тогда у метки своего разрыва нет. */}
          <span data-marker={entry.id} style={{ display: "block", height: 0, ...keepWithNext(k), ...(breaks && !k.breaks ? { breakBefore: "column" as const } : {}) }} />
          {entry.heading ? (
            <QuestionHeading
              kit={k}
              {...flowMark(`h:${entry.id}`)}
              data-entry={entry.id}
              data-para={-1}
              {...gap.attrs}
              style={{ ...gap.style, ...breakBefore(k, `h:${entry.id}`), boxShadow: moving?.target.entry === entry.id && moving.target.anchor === -1 && paragraphs.length ? drag?.belowShadow : undefined }}
            >
              {entry.heading}
            </QuestionHeading>
          ) : first ? null : (
            <Divider kit={k} {...flowMark(`h:${entry.id}`)} {...gap.attrs} style={{ ...gap.style, ...breakBefore(k, `h:${entry.id}`) }} />
          )}
          {paragraphs.length ? renderRows(entry, -1, isMeasure, fresh) : null}
          {paragraphs.length ? (
            d.blocks.map((b, i) => (
              <Fragment key={i}>
                <AnswerBlockView
                  kit={k}
                  block={b}
                  leadIn={design.leadIn && first && i === 0}
                  // Как в PDF (TextBlock): буквица — в начале главы, красная строка — по первому блоку ответа (indentFirst).
                  dropCap={first && i === 0}
                  first={i === 0}
                  {...flowMark(`${b.kind === "lede" ? "k" : "b"}:${entry.id}:${i}`)}
                  data-entry={entry.id}
                  data-para={b.to}
                  data-para-from={b.from}
                  style={{ boxShadow: hint(entry.id, b.to) ?? (b.from > 0 ? undefined : hint(entry.id, 0)) }}
                />
                {i < d.blocks.length - 1 ? renderRows(entry, i, isMeasure) : null}
              </Fragment>
            ))
          ) : entry.photos.length || entry.media.length ? null : (
            <p style={{ fontFamily: cssFont(design.type.body), fontSize: bodyPx, lineHeight: design.type.lineHeight, color: P.rule, fontStyle: "italic" }}>{t.empty}</p>
          )}
          {renderRows(entry, END, isMeasure, fresh)}
        </Fragment>
      );
    };

    // Глава без начальной полосы (inline): номер и название — в начале её текста (как в PDF); чистый лист — без них.
    const head =
      start === "inline" ? (
        <div data-pid={`c:${ch.key}`} style={breakBefore(k, `c:${ch.key}`)}>
          <ChapterHead kit={k} number={ch.number} title={ch.title} epigraph={ch.epigraph} />
        </div>
      ) : null;
    // Концовка главы — виньетка после текста, как в PDF (ChapterBody); у главы без текста её нет.
    const tail = ch.entries.some((e) => e.answer || e.photos.length || e.media.length) && !f.noTail.has(ch.key) ? <ChapterTail kit={k} style={breakBefore(k, `t:${ch.key}`)} {...flowMark(`t:${ch.key}`)} /> : null;

    return { renderEntry, head, tail };
  };
  const shown = render(visibleKit, flow);
  const measured = render(kit, NO_FLOW);

  const textFlow = (k: number) => (
    <div
      lang={language}
      style={{
        width: textW,
        // Полосы по разбивке, как у PDF: разрывы ставят блоки, колонка с запасом — браузер сам не ломает.
        height: res ? textH + FLOW_SLACK * px : textH,
        columnWidth: textW,
        columnGap: gap,
        columnFill: "auto",
        transform: k ? `translateX(${-k * (textW + gap)}px)` : undefined,
        color: P.ink,
      }}
    >
      {shown.head}
      {ch.entries.map((e, i) => shown.renderEntry(e, i === 0, false))}
      {shown.tail}
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
          {measured.head}
          {ch.entries.map((e, i) => measured.renderEntry(e, i === 0, true))}
          {measured.tail}
        </div>
      </div>
      {/* Начальная полоса: фото главы, как в печати, — или полоса с названием и пунктирное место фото (только здесь). */}
      {/* Пустая полоса перед начальной (она всегда слева, как у PDF: content.openersLeft). */}
      {blankBefore ? <div aria-hidden className={`relative ${PAGE_SHADOW}`} style={{ width: pageW, height: format.heightMm * px, background: design.paper ?? PAPER }} /> : null}
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
        <LazyPage key={k} root={scroll} pageId={`${ch.key}:${k}`} className={`relative overflow-hidden ${PAGE_SHADOW}`} style={{ width: pageW, height: format.heightMm * px, background: design.paper ?? PAPER }} onClick={onPageClick}>
          {() => (
            <>
              {/* Первая полоса текста — напротив начальной: правая, если та слева (как в PDF), иначе левая. */}
              {/* Сторона полосы — по её номеру в книге (как у PDF), а без номера — напротив начальной полосы. */}
              <RunningHead kit={kit} bookTitle={bookTitle} chapterTitle={ch.title} recto={firstPage !== undefined ? (firstPage + k) % 2 === 1 : k % 2 === (openersLeft || start ? 0 : 1)} />
              {/* Соседние колонки — за краем листа (его обрезает сама страница). */}
              <div className="absolute" style={{ left: side * px, top: m.marginTop * px, width: textW, height: textH }}>
                {textFlow(k)}
              </div>
              {pagePhotos.filter((x) => photoPages[x.item.p.id] === k).map(pagePhoto)}
              {/* Колонцифра — номер полосы в книге: полосы раскладываются, как у PDF (полосы глав до неё — тоже). */}
              {firstPage !== undefined ? (
                <Folio kit={kit} recto={(firstPage + k) % 2 === 1}>
                  {folioText(design, firstPage + k)}
                </Folio>
              ) : null}
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
