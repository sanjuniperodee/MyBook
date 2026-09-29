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

/**
 * HTML-копия страниц книги с теми же шрифтами, кеглем и полями, что в PDF.
 * Текст раскладывается по страницам через CSS-колонки размером с текстовую область:
 * каждая колонка — отдельная страница, страницы листаются вертикально.
 *
 * Если передан onChange, фото интерактивны: щелчок выделяет, уголок меняет размер,
 * перетаскивание переносит фото в другое место текста.
 */
export function PagePreview({
  format,
  typography,
  heading,
  answer,
  photos = [],
  selectedId = null,
  onSelect,
  onChange,
}: {
  format: BookFormat;
  typography: Typography;
  heading: string | null;
  answer: string;
  photos?: PreviewPhoto[];
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  onChange?: (id: string, patch: Partial<InlinePhotoStyle>) => void;
}) {
  const m = interiorMetrics[format.id];
  const W = format.widthMm;
  const H = format.heightMm;
  const side = (m.marginInner + m.marginOuter) / 2;
  const wrap = useRef<HTMLDivElement>(null);
  const firstFlow = useRef<HTMLDivElement>(null);
  const [pageW, setPageW] = useState(0);
  const [pages, setPages] = useState(1);
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
    const el = firstFlow.current;
    if (!el || !textW) return;
    const n = Math.max(1, Math.round((el.scrollWidth + gap) / (textW + gap)));
    setPages((p) => (p === n ? p : n));
  }, [textW, gap]);

  const paragraphs = splitParagraphs(answer);
  const items = photos.map((p) => {
    const style = normalizeStyle(p.inline);
    if (drag?.kind === "resize" && drag.id === p.id) style.width = drag.width;
    return { p, style };
  });
  const layout = layoutInline(items, paragraphs.length);
  const liveKey = items.map((x) => `${x.p.id}:${x.style.width}:${x.style.anchor}:${x.style.aspect}:${x.style.frame}`).join("|");

  useEffect(() => {
    measure();
  }, [measure, heading, answer, liveKey, pageW]);

  // ── Перетаскивание ──
  /** undefined — под курсором нет места для вставки. */
  const dropTarget = (x: number, y: number): number | null | undefined => {
    for (const el of document.elementsFromPoint(x, y)) {
      const node = el as HTMLElement;
      const rowAnchor = node.dataset?.rowAnchor;
      if (rowAnchor !== undefined) return rowAnchor === "end" ? null : Number(rowAnchor);
      const para = node.dataset?.para;
      if (para === undefined) continue;
      const i = Number(para);
      if (i < 0) return -1;
      const rect = [...node.getClientRects()].find((r) => y >= r.top && y <= r.bottom && x >= r.left - 4 && x <= r.right + 4) ?? node.getBoundingClientRect();
      const after = y > rect.top + rect.height / 2 ? i : i - 1;
      return after >= paragraphs.length - 1 ? null : after;
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
      const current = items.find((x) => x.p.id === id)?.style.anchor ?? null;
      if (anchor !== current) onChange?.(id, { anchor });
    } else {
      onSelect?.(selectedId === id ? null : id);
    }
    setDrag(null);
  };

  const moving = drag?.kind === "move" && drag.active ? drag : null;
  const hint = (i: number) => {
    if (!moving) return undefined;
    const t = moving.target === null ? paragraphs.length - 1 : moving.target;
    if (t === i) return "inset 0 -2px 0 var(--color-wine, #8b2c3c)";
    if (t === i - 1 && i === 0) return "inset 0 2px 0 var(--color-wine, #8b2c3c)";
    return undefined;
  };

  const renderRows = (anchor: number) =>
    (layout.get(anchor) ?? []).map((row, r) => {
      const align = row[0].style.align;
      return (
        <div
          key={`${anchor}-${r}`}
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
            const selected = interactive && selectedId === p.id;
            const polaroid = style.frame === "polaroid";
            return (
              <figure
                key={p.id}
                data-photo={p.id}
                onPointerDown={(e) => startMove(e, p.id)}
                onPointerMove={onPointerMove}
                onPointerUp={(e) => onPointerUp(e, p.id)}
                onPointerCancel={() => setDrag(null)}
                style={{
                  position: "relative",
                  width: box.outerW,
                  margin: 0,
                  cursor: interactive ? (moving?.id === p.id ? "grabbing" : "grab") : undefined,
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
                    alt={p.caption}
                    draggable={false}
                    onLoad={measure}
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

  const flow = (k: number) => (
    <div
      ref={k === 0 ? firstFlow : undefined}
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
      {heading ? (
        <div
          data-para={-1}
          style={{
            fontFamily: cssFont(typography.heading),
            fontWeight: typography.headingWeight,
            fontStyle: typography.headingItalic ? "italic" : "normal",
            fontSize: bodyPx * 1.55,
            lineHeight: 1.22,
            marginBottom: 8 * m.scale * PT_TO_MM * px,
            breakAfter: "avoid",
            boxShadow: moving && moving.target === -1 && paragraphs.length ? "inset 0 -2px 0 var(--color-wine, #8b2c3c)" : undefined,
          }}
        >
          {heading}
        </div>
      ) : null}
      {paragraphs.length ? renderRows(-1) : null}
      {paragraphs.length ? (
        paragraphs.map((p, i) => (
          <Fragment key={i}>
            <p data-para={i} style={{ ...paraStyle, boxShadow: hint(i) }}>
              {p}
            </p>
            {i < paragraphs.length - 1 ? renderRows(i) : null}
          </Fragment>
        ))
      ) : photos.length ? null : (
        <p style={{ fontFamily: cssFont(typography.body), fontSize: bodyPx, lineHeight: typography.lineHeight, color: "#b4a99e", fontStyle: "italic" }}>Здесь появится ваш ответ…</p>
      )}
      {renderRows(END)}
    </div>
  );

  const dragged = moving ? photos.find((p) => p.id === moving.id) : null;

  return (
    <div ref={wrap} className="space-y-4">
      {pageW
        ? Array.from({ length: pages }, (_, k) => (
            <div
              key={k}
              className="relative bg-white shadow-[0_1px_3px_rgba(0,0,0,.06),0_20px_40px_-20px_rgba(0,0,0,.25)]"
              style={{ width: pageW, height: H * px }}
              onClick={(e) => {
                if (interactive && selectedId && !(e.target as HTMLElement).closest("[data-photo]")) onSelect?.(null);
              }}
            >
              <div className="absolute overflow-clip" style={{ left: side * px, top: m.marginTop * px, width: textW, height: textH }}>
                {flow(k)}
              </div>
              <div className="absolute inset-x-0 text-center text-muted" style={{ bottom: (m.marginBottom / 2 - 3) * px, fontSize: 2.8 * px, fontFamily: cssFont(typography.body) }}>
                {pages > 1 ? `${k + 1} / ${pages}` : ""}
              </div>
            </div>
          ))
        : <div className="bg-white" style={{ aspectRatio: `${W} / ${H}` }} />}
      {dragged && moving ? (
        <div className="pointer-events-none fixed z-50 flex items-center gap-2 rounded-xl bg-ink/90 p-1.5 pr-3 text-xs text-white shadow-xl" style={{ left: moving.x + 12, top: moving.y + 12 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={dragged.url} alt="" className="size-10 rounded-lg object-cover" />
          {anchorLabel(moving.target, paragraphs.length)}
        </div>
      ) : null}
    </div>
  );
}
