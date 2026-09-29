"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { cssFont, type Typography } from "@/lib/book/fonts";
import type { BookFormat } from "@/lib/book/formats";
import { interiorMetrics } from "@/lib/book/layout";
import { framedBox, layoutInline, normalizeStyle, objectPosition, polaroidFontSize, ROW_GAP, splitParagraphs } from "@/lib/book/inline-photo";
import type { InlinePhotoStyle } from "@/lib/db/schema";

const PT_TO_MM = 25.4 / 72;
const END = Number.POSITIVE_INFINITY;

export interface PreviewPhoto {
  id: string;
  url: string;
  width: number;
  height: number;
  caption: string;
  inline?: InlinePhotoStyle | null;
}

type Drag =
  | { kind: "resize"; id: string; startX: number; startWidth: number; factor: number; width: number }
  | { kind: "move"; id: string; startX: number; startY: number; x: number; y: number; active: boolean; target: number | null };

/** Место вставки в тексте → подпись для подсказки. */
export function anchorLabel(anchor: number | null, paragraphs: number) {
  if (anchor === null || anchor >= paragraphs - 1) return "в конце ответа";
  if (anchor < 0) return "перед текстом";
  return `после ${anchor + 1}-го абзаца`;
}

export interface PreviewEntry {
  id: string;
  heading: string | null;
  answer: string;
  photos: PreviewPhoto[];
}

export interface PreviewChapter {
  key: string;
  number: number;
  title: string;
  entries: PreviewEntry[];
}

/** Страница, содержимое которой строится только рядом с видимой областью прокрутки. */
function LazyPage({ root, pageId, className, style, onClick, children }: { root: React.RefObject<HTMLDivElement | null>; pageId: string; className?: string; style: React.CSSProperties; onClick?: (e: React.MouseEvent) => void; children: () => React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setShow(e.isIntersecting), { root: root.current, rootMargin: "1200px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [root]);
  return (
    <div ref={ref} data-page={pageId} className={className} style={style} onClick={onClick}>
      {show ? children() : null}
    </div>
  );
}

/**
 * HTML-копия книги с теми же шрифтами, кеглем и полями, что в PDF: все главы и ответы подряд.
 * Текст главы раскладывается по страницам через CSS-колонки размером с текстовую область:
 * каждая колонка — отдельная страница, страницы листаются вертикально. Страницы вне экрана
 * не отрисовываются, а при смене `currentId` список прокручивается к началу этого ответа.
 *
 * Если передан onChange, фото текущего ответа интерактивны: щелчок выделяет, уголок меняет размер,
 * перетаскивание переносит фото в другое место текста.
 */
export function PagePreview({
  format,
  typography,
  chapters,
  currentId,
  selectedId = null,
  onSelect,
  onChange,
  className,
}: {
  format: BookFormat;
  typography: Typography;
  chapters: PreviewChapter[];
  currentId: string;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  onChange?: (id: string, patch: Partial<InlinePhotoStyle>) => void;
  className?: string;
}) {
  const m = interiorMetrics[format.id];
  const W = format.widthMm;
  const H = format.heightMm;
  const side = (m.marginInner + m.marginOuter) / 2;
  const scroll = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const measureRefs = useRef(new Map<string, HTMLDivElement>());
  const [pageW, setPageW] = useState(0);
  const [pagesBy, setPagesBy] = useState<Record<string, number>>({});
  const [drag, setDrag] = useState<Drag | null>(null);
  const interactive = !!onChange;

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const update = () => setPageW(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const px = pageW / W; // пикселей на миллиметр
  const textW = (W - side * 2) * px;
  const textH = (H - m.marginTop - m.marginBottom) * px;
  const gap = side * 2 * px;
  const bodyPx = typography.bodySize * m.scale * PT_TO_MM * px;

  const measure = useCallback(() => {
    if (!textW) return;
    setPagesBy((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const [key, el] of measureRefs.current) {
        const n = Math.max(1, Math.round((el.scrollWidth + gap) / (textW + gap)));
        if (next[key] !== n) {
          next[key] = n;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [textW, gap]);

  type Item = { p: PreviewPhoto; style: InlinePhotoStyle };
  const info = new Map<string, { paragraphs: string[]; items: Item[]; layout: Map<number, Item[][]>; live: boolean }>();
  for (const ch of chapters)
    for (const e of ch.entries) {
      const paragraphs = splitParagraphs(e.answer);
      const items = e.photos.map((p) => {
        const style = normalizeStyle(p.inline);
        if (drag?.kind === "resize" && drag.id === p.id) style.width = drag.width;
        return { p, style };
      });
      info.set(e.id, { paragraphs, items, layout: layoutInline(items, paragraphs.length), live: e.id === currentId });
    }
  const current = info.get(currentId);
  const curParas = current?.paragraphs.length ?? 0;
  const liveKey = chapters
    .map((ch) => ch.key + ch.entries.map((e) => `${e.id}:${e.heading}:${e.answer}:` + e.photos.map((p) => `${p.id}:${p.url}:${p.caption}:` + JSON.stringify(normalizeStyle(p.inline))).join(",")).join("|"))
    .join("#");

  const resizeWidth = drag?.kind === "resize" ? drag.width : 0;
  useEffect(() => {
    measure();
  }, [measure, liveKey, pageW, resizeWidth]);

  useEffect(() => {
    void document.fonts?.ready.then(measure);
  }, [measure]);

  // ── Прокрутка к текущему ответу ──
  const settleUntil = useRef(0);
  const scrolledOnce = useRef(false);
  const scrollToCurrent = useCallback(
    (behavior: ScrollBehavior) => {
      const root = scroll.current;
      const ch = chapters.find((c) => c.entries.some((e) => e.id === currentId));
      const flowEl = ch ? measureRefs.current.get(ch.key) : null;
      const marker = flowEl?.querySelector<HTMLElement>(`[data-marker="${CSS.escape(currentId)}"]`);
      if (!root || !ch || !flowEl || !marker || !textW) return false;
      const fr = flowEl.getBoundingClientRect();
      const mr = marker.getBoundingClientRect();
      const k = Math.min((pagesBy[ch.key] ?? 1) - 1, Math.max(0, Math.floor((mr.left - fr.left + 1) / (textW + gap))));
      const pageEl = root.querySelector<HTMLElement>(`[data-page="${CSS.escape(ch.key)}:${k}"]`);
      if (!pageEl) return false;
      const top = root.scrollTop + pageEl.getBoundingClientRect().top - root.getBoundingClientRect().top + m.marginTop * px + (mr.top - fr.top) - 16;
      root.scrollTo({ top: Math.max(0, top), behavior });
      return true;
    },
    [chapters, currentId, textW, gap, pagesBy, m.marginTop, px],
  );
  useEffect(() => {
    settleUntil.current = Date.now() + 1500;
    if (scrollToCurrent(scrolledOnce.current ? "smooth" : "auto")) scrolledOnce.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId]);
  useEffect(() => {
    // страницы ещё дорисовываются: подправляем позицию, пока раскладка не устоялась
    if (Date.now() < settleUntil.current || !scrolledOnce.current) if (scrollToCurrent("auto")) scrolledOnce.current = true;
  }, [pagesBy, scrollToCurrent]);

  // ── Перетаскивание ──
  /** undefined — под курсором нет места для вставки. */
  const dropTarget = (x: number, y: number): number | null | undefined => {
    for (const el of document.elementsFromPoint(x, y)) {
      const node = el as HTMLElement;
      if (node.dataset?.entry !== currentId) continue; // переносить можно только в пределах текущего ответа
      const rowAnchor = node.dataset?.rowAnchor;
      if (rowAnchor !== undefined) return rowAnchor === "end" ? null : Number(rowAnchor);
      const para = node.dataset?.para;
      if (para === undefined) continue;
      const i = Number(para);
      if (i < 0) return -1;
      const rect = [...node.getClientRects()].find((r) => y >= r.top && y <= r.bottom && x >= r.left - 4 && x <= r.right + 4) ?? node.getBoundingClientRect();
      const after = y > rect.top + rect.height / 2 ? i : i - 1;
      return after >= curParas - 1 ? null : after;
    }
    return undefined;
  };

  const startResize = (e: ReactPointerEvent, id: string, style: InlinePhotoStyle) => {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const factor = (style.align === "center" ? 2 : 1) * (style.align === "right" ? -1 : 1);
    setDrag({ kind: "resize", id, startX: e.clientX, startWidth: style.width, factor, width: style.width });
    onSelect?.(id);
  };

  const startMove = (e: ReactPointerEvent, id: string) => {
    if (!interactive) return;
    if (e.pointerType !== "mouse" && selectedId !== id) return; // на тач-экране сначала выделяем, чтобы не мешать прокрутке
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ kind: "move", id, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, active: false, target: null });
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (!drag) return;
    if (drag.kind === "resize") {
      const dx = e.clientX - drag.startX;
      const width = Math.min(100, Math.max(25, Math.round(drag.startWidth + (dx * drag.factor * 100) / textW)));
      if (width !== drag.width) setDrag({ ...drag, width });
      return;
    }
    const active = drag.active || Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 6;
    const target = active ? dropTarget(e.clientX, e.clientY) : null;
    setDrag({ ...drag, x: e.clientX, y: e.clientY, active, target: target === undefined ? drag.target : target });
  };

  const onPointerUp = (e: ReactPointerEvent, id: string) => {
    if (!drag) return;
    e.stopPropagation();
    if (drag.kind === "resize") {
      if (drag.width !== drag.startWidth) onChange?.(id, { width: drag.width });
    } else if (drag.active) {
      const target = dropTarget(e.clientX, e.clientY);
      const anchor = target === undefined ? drag.target : target;
      const currentAnchor = current?.items.find((x) => x.p.id === id)?.style.anchor ?? null;
      if (anchor !== currentAnchor) onChange?.(id, { anchor });
    } else {
      onSelect?.(selectedId === id ? null : id);
    }
    setDrag(null);
  };

  const moving = drag?.kind === "move" && drag.active ? drag : null;
  const hint = (i: number) => {
    if (!moving) return undefined;
    const t = moving.target === null ? curParas - 1 : moving.target;
    if (t === i) return "inset 0 -2px 0 var(--color-wine, #8b2c3c)";
    if (t === i - 1 && i === 0) return "inset 0 2px 0 var(--color-wine, #8b2c3c)";
    return undefined;
  };

  const renderRows = (entry: PreviewEntry, anchor: number, isMeasure: boolean) => {
    const d = info.get(entry.id)!;
    const live = d.live && interactive;
    return (d.layout.get(anchor) ?? []).map((row, r) => {
      const align = row[0].style.align;
      return (
        <div
          key={`${anchor}-${r}`}
          data-entry={entry.id}
          data-row-anchor={anchor === END ? "end" : anchor}
          style={{
            display: "flex",
            justifyContent: align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center",
            alignItems: "flex-start",
            gap: textW * ROW_GAP,
            breakInside: "avoid",
            margin: `${bodyPx * 0.5}px 0 ${bodyPx}px`,
          }}
        >
          {row.map(({ p, style }) => {
            const box = framedBox(p, style, textW, textH, row.length);
            const selected = live && selectedId === p.id;
            const polaroid = style.frame === "polaroid";
            return (
              <figure
                key={p.id}
                data-photo={live ? p.id : undefined}
                onPointerDown={live ? (e) => startMove(e, p.id) : undefined}
                onPointerMove={live ? onPointerMove : undefined}
                onPointerUp={live ? (e) => onPointerUp(e, p.id) : undefined}
                onPointerCancel={live ? () => setDrag(null) : undefined}
                style={{
                  position: "relative",
                  width: box.outerW,
                  margin: 0,
                  cursor: live ? (moving?.id === p.id ? "grabbing" : "grab") : undefined,
                  touchAction: selected ? "none" : undefined,
                  opacity: moving?.id === p.id ? 0.35 : 1,
                  userSelect: "none",
                }}
              >
                <div
                  style={{
                    width: box.outerW,
                    height: box.outerH,
                    padding: polaroid ? `${box.pad}px ${box.pad}px ${box.padBottom}px` : 0,
                    boxSizing: "border-box",
                    background: polaroid ? "#fff" : undefined,
                    border: polaroid ? "1px solid #ddd6ce" : style.frame === "line" ? `${Math.max(1, 0.35 * px)}px solid #1f1a17` : undefined,
                    boxShadow: polaroid ? "0 1px 2px rgba(0,0,0,.08)" : undefined,
                    borderRadius: box.radius,
                    overflow: "hidden",
                    position: "relative",
                    outline: selected ? "2px solid var(--color-wine, #8b2c3c)" : undefined,
                    outlineOffset: 2,
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.url}
                    alt={isMeasure ? "" : p.caption}
                    draggable={false}
                    onLoad={isMeasure ? measure : undefined}
                    style={{ width: box.imgW, height: box.imgH, objectFit: "cover", objectPosition: objectPosition(p, style), display: "block", borderRadius: box.radius }}
                  />
                  {polaroid && p.caption ? (
                    <div
                      style={{
                        position: "absolute",
                        left: box.pad,
                        right: box.pad,
                        bottom: 0,
                        height: box.padBottom,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontFamily: cssFont("caveat"),
                        fontSize: polaroidFontSize(box, p.caption, bodyPx),
                        color: "#3a332e",
                        overflow: "hidden",
                        whiteSpace: "nowrap",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {p.caption}
                    </div>
                  ) : null}
                </div>
                {!polaroid && p.caption ? (
                  <figcaption style={{ fontFamily: cssFont(typography.body), fontStyle: "italic", fontSize: bodyPx * 0.86, lineHeight: 1.3, color: "#7a7068", marginTop: bodyPx * 0.5, textAlign: "center" }}>
                    {p.caption}
                  </figcaption>
                ) : null}
                {selected ? (
                  <>
                    <span
                      role="slider"
                      aria-label="Размер фото"
                      aria-valuemin={25}
                      aria-valuemax={100}
                      aria-valuenow={style.width}
                      tabIndex={0}
                      onPointerDown={(e) => startResize(e, p.id, style)}
                      onPointerMove={onPointerMove}
                      onPointerUp={(e) => onPointerUp(e, p.id)}
                      onKeyDown={(e) => {
                        const step = e.shiftKey ? 10 : 5;
                        if (e.key === "ArrowRight" || e.key === "ArrowUp") onChange?.(p.id, { width: Math.min(100, style.width + step) });
                        else if (e.key === "ArrowLeft" || e.key === "ArrowDown") onChange?.(p.id, { width: Math.max(25, style.width - step) });
                        else return;
                        e.preventDefault();
                      }}
                      className="absolute z-10 flex size-5 items-center justify-center rounded-full border-2 border-white bg-wine shadow-md"
                      style={{
                        top: box.outerH - 10,
                        [style.align === "right" ? "left" : "right"]: -10,
                        cursor: style.align === "right" ? "nesw-resize" : "nwse-resize",
                        touchAction: "none",
                      }}
                    />
                    {drag?.kind === "resize" && drag.id === p.id ? (
                      <span className="absolute top-2 left-2 z-10 rounded-md bg-ink/80 px-1.5 py-0.5 text-[11px] font-medium text-white">{style.width}%</span>
                    ) : null}
                  </>
                ) : null}
              </figure>
            );
          })}
        </div>
      );
    });
  };

  const paraStyle = {
    fontFamily: cssFont(typography.body),
    fontSize: bodyPx,
    lineHeight: typography.lineHeight,
    marginBottom: bodyPx * 0.45,
    textAlign: "justify" as const,
    hyphens: "auto" as const,
    orphans: 2,
    widows: 2,
  };

  const renderEntry = (entry: PreviewEntry, first: boolean, isMeasure: boolean) => {
    const d = info.get(entry.id)!;
    const paragraphs = d.paragraphs;
    return (
      <Fragment key={entry.id}>
        <span data-marker={entry.id} style={{ display: "block", height: 1, breakAfter: "avoid" }} />
        {entry.heading ? (
          <div
            data-entry={entry.id}
            data-para={-1}
            style={{
              fontFamily: cssFont(typography.heading),
              fontWeight: typography.headingWeight,
              fontStyle: typography.headingItalic ? "italic" : "normal",
              fontSize: bodyPx * 1.55,
              lineHeight: 1.22,
              marginTop: first ? 0 : bodyPx * 1.4,
              marginBottom: 8 * m.scale * PT_TO_MM * px,
              breakAfter: "avoid",
              boxShadow: d.live && moving && moving.target === -1 && paragraphs.length ? "inset 0 -2px 0 var(--color-wine, #8b2c3c)" : undefined,
            }}
          >
            {entry.heading}
          </div>
        ) : first ? null : (
          <div style={{ height: bodyPx * 1.4 }} />
        )}
        {paragraphs.length ? renderRows(entry, -1, isMeasure) : null}
        {paragraphs.length ? (
          paragraphs.map((text, i) => (
            <Fragment key={i}>
              <p data-entry={entry.id} data-para={i} style={{ ...paraStyle, boxShadow: d.live ? hint(i) : undefined }}>
                {text}
              </p>
              {i < paragraphs.length - 1 ? renderRows(entry, i, isMeasure) : null}
            </Fragment>
          ))
        ) : entry.photos.length ? null : (
          <p style={{ fontFamily: cssFont(typography.body), fontSize: bodyPx, lineHeight: typography.lineHeight, color: "#b4a99e", fontStyle: "italic" }}>Здесь появится ваш ответ…</p>
        )}
        {renderRows(entry, END, isMeasure)}
      </Fragment>
    );
  };

  const flow = (ch: PreviewChapter, k: number) => (
    <div
      lang="ru"
      style={{
        width: textW,
        height: textH,
        columnWidth: textW,
        columnGap: gap,
        columnFill: "auto",
        transform: k ? `translateX(${-k * (textW + gap)}px)` : undefined,
        color: "#1f1a17",
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
                      lang="ru"
                      style={{ position: "relative", width: textW, height: textH, columnWidth: textW, columnGap: gap, columnFill: "auto" }}
                    >
                      {ch.entries.map((e, i) => renderEntry(e, i === 0, true))}
                    </div>
                  </div>
                  <div className={`relative flex flex-col items-center justify-center bg-white text-center ${pageShadow}`} style={{ width: pageW, height: H * px }}>
                    <div style={{ fontFamily: cssFont(typography.body), fontSize: bodyPx * 0.8, letterSpacing: "0.2em", textTransform: "uppercase", color: "#8a7f75" }}>Глава {ch.number}</div>
                    <div
                      style={{
                        fontFamily: cssFont(typography.heading),
                        fontWeight: typography.headingWeight,
                        fontStyle: typography.headingItalic ? "italic" : "normal",
                        fontSize: bodyPx * 2.2,
                        lineHeight: 1.15,
                        marginTop: bodyPx * 0.8,
                        padding: `0 ${side * px}px`,
                        color: "#1f1a17",
                      }}
                    >
                      {ch.title}
                    </div>
                  </div>
                  {Array.from({ length: pages }, (_, k) => (
                    <LazyPage
                      key={k}
                      root={scroll}
                      pageId={`${ch.key}:${k}`}
                      className={`relative bg-white ${pageShadow}`}
                      style={{ width: pageW, height: H * px }}
                      onClick={(e) => {
                        if (interactive && selectedId && !(e.target as HTMLElement).closest("[data-photo]")) onSelect?.(null);
                      }}
                    >
                      {() => (
                        <>
                          <div className="absolute overflow-clip" style={{ left: side * px, top: m.marginTop * px, width: textW, height: textH }}>
                            {flow(ch, k)}
                          </div>
                          <div className="absolute inset-x-0 text-center text-muted" style={{ bottom: (m.marginBottom / 2 - 3) * px, fontSize: 2.8 * px, fontFamily: cssFont(typography.body) }}>
                            {pages > 1 ? `${k + 1} / ${pages}` : ""}
                          </div>
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
            {anchorLabel(moving.target, curParas)}
          </div>
        ) : null}
      </div>
    </div>
  );
}
