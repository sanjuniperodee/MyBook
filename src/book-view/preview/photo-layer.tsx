"use client";

import { MoveVertical } from "lucide-react";
import type { Messages } from "@/i18n/messages";
import type { PreviewPhoto } from "@/lib/book/editor-model";
import type { InlinePhotoStyle } from "@/lib/book/inline-photo";
import type { PageKit } from "@/book-view/interior/kit";
import type { RowItem, RowPhotoBox, RowPhotoLayer } from "@/book-view/interior/entry";
import { MAX_WIDTH, MIN_WIDTH } from "./drag";
import type { usePhotoDrag } from "./usePhotoDrag";

type PhotoDrag = ReturnType<typeof usePhotoDrag>;

/** Уголок размера у выделенного фото: тянуть мышью или стрелками с клавиатуры (Shift — шаг 10 %). */
function ResizeHandle({ t, kit, box, p, style, drag, onChange }: { t: Messages["editor"]["preview"]; kit: PageKit; box: RowPhotoBox; p: PreviewPhoto; style: InlinePhotoStyle; drag: PhotoDrag; onChange?: (id: string, patch: Partial<InlinePhotoStyle>) => void }) {
  return (
    <>
      <span
        role="slider"
        aria-label={t.resizeAria}
        aria-valuemin={MIN_WIDTH}
        aria-valuemax={MAX_WIDTH}
        aria-valuenow={style.width}
        tabIndex={0}
        onPointerDown={(e) => drag.startResize(e, p.id, style)}
        onPointerMove={drag.onPointerMove}
        onPointerUp={(e) => drag.onPointerUp(e, p.id)}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 10 : 5;
          if (e.key === "ArrowRight" || e.key === "ArrowUp") onChange?.(p.id, { width: Math.min(MAX_WIDTH, style.width + step) });
          else if (e.key === "ArrowLeft" || e.key === "ArrowDown") onChange?.(p.id, { width: Math.max(MIN_WIDTH, style.width - step) });
          else return;
          e.preventDefault();
        }}
        className="absolute z-10 flex size-5 items-center justify-center rounded-full border-2 border-white bg-wine shadow-md"
        style={{
          top: `calc(${kit.u.mm(box.outerH)} - 10px)`,
          [style.align === "right" ? "left" : "right"]: -10,
          cursor: style.align === "right" ? "nesw-resize" : "nwse-resize",
          touchAction: "none",
        }}
      />
      {drag.drag?.kind === "resize" && drag.drag.id === p.id ? (
        <span className="absolute top-2 left-2 z-10 rounded-md bg-ink/80 px-1.5 py-0.5 text-[11px] font-medium text-white">{style.width}%</span>
      ) : null}
    </>
  );
}

/**
 * Ручка отступа над выделенным фото: тянуть вниз — фото опускается по странице (отступ над рядом), вверх — обратно;
 * с клавиатуры — стрелки (Shift — шаг 10 %). Над фото с отступом — пунктиром место отступа.
 */
function SpaceHandle({ t, kit, box, p, style, drag, onChange }: { t: Messages["editor"]["preview"]; kit: PageKit; box: RowPhotoBox; p: PreviewPhoto; style: InlinePhotoStyle; drag: PhotoDrag; onChange?: (id: string, patch: Partial<InlinePhotoStyle>) => void }) {
  const active = drag.drag?.kind === "space" && drag.drag.id === p.id;
  const share = active && drag.drag?.kind === "space" ? drag.drag.space : Math.min(style.spaceAbove ?? 0, box.spaceLimit);
  const percent = Math.round(share * 100);
  const setSpace = (v: number) => onChange?.(p.id, { spaceAbove: Math.max(0, Math.min(box.spaceLimit, v)) });
  return (
    <>
      {box.space > 0 ? (
        <span
          aria-hidden
          className="pointer-events-none absolute right-0 left-0 rounded-sm border border-dashed border-wine/60 bg-rose/40"
          style={{ top: `calc(-1 * ${kit.u.mm(box.space)})`, height: kit.u.mm(box.space) }}
        />
      ) : null}
      <span
        role="slider"
        aria-label={t.spaceAria}
        aria-valuemin={0}
        aria-valuemax={Math.round(box.spaceLimit * 100)}
        aria-valuenow={percent}
        aria-valuetext={t.spaceValue(percent)}
        tabIndex={0}
        onPointerDown={(e) => drag.startSpace(e, p.id, style, box.spaceLimit)}
        onPointerMove={drag.onPointerMove}
        onPointerUp={(e) => drag.onPointerUp(e, p.id)}
        onPointerCancel={drag.cancel}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 0.1 : 0.02;
          if (e.key === "ArrowDown") setSpace(share + step);
          else if (e.key === "ArrowUp") setSpace(share - step);
          else if (e.key === "Home" || e.key === "Delete" || e.key === "Backspace") setSpace(0);
          else return;
          e.preventDefault();
        }}
        title={t.spaceAria}
        className="absolute left-1/2 z-10 flex h-6 w-9 -translate-x-1/2 items-center justify-center rounded-full border-2 border-white bg-wine text-white shadow-md"
        style={{ top: -12, cursor: "ns-resize", touchAction: "none" }}
      >
        <MoveVertical className="size-3.5" aria-hidden />
      </span>
      {active ? <span className="absolute top-2 left-1/2 z-10 -translate-x-1/2 rounded-md bg-ink/80 px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap text-white">{t.spaceValue(percent)}</span> : null}
    </>
  );
}

/**
 * Интерактивный слой над фото ряда в превью (ряд рисует InlineRow — как в PDF): у фото текущего ответа —
 * выделение, перетаскивание (к другому абзацу и в другой ответ), уголок размера и ручка отступа сверху; у копии для замера — пустая подпись и пересчёт полос после загрузки.
 */
export function previewPhotoLayer({
  t,
  kit,
  live,
  isMeasure,
  measure,
  selectedId,
  drag,
  onChange,
}: {
  t: Messages["editor"]["preview"];
  kit: PageKit;
  /** Фото текущего ответа и превью интерактивно. */
  live: boolean;
  isMeasure: boolean;
  measure: () => void;
  selectedId: string | null;
  drag: PhotoDrag;
  onChange?: (id: string, patch: Partial<InlinePhotoStyle>) => void;
}) {
  return ({ p, style }: RowItem<PreviewPhoto>, box: RowPhotoBox): RowPhotoLayer => {
    const img = { alt: isMeasure ? "" : p.caption, onLoad: isMeasure ? measure : undefined };
    // Фото в превью не выделяются вместе с текстом — и у других ответов.
    if (!live) return { img, figure: { style: { userSelect: "none" } } };
    const selected = selectedId === p.id;
    const moving = drag.moving?.id === p.id;
    return {
      img,
      figure: {
        "data-photo": p.id,
        onPointerDown: (e) => drag.startMove(e, p.id),
        onPointerMove: drag.onPointerMove,
        onPointerUp: (e) => drag.onPointerUp(e, p.id),
        onPointerCancel: drag.cancel,
        style: { position: "relative", cursor: moving ? "grabbing" : "grab", touchAction: selected ? "none" : undefined, opacity: moving ? 0.35 : 1, userSelect: "none" },
      },
      frame: selected ? { outline: "2px solid var(--color-wine, #8b2c3c)", outlineOffset: 2 } : undefined,
      overlay: selected ? (
        <>
          <ResizeHandle t={t} kit={kit} box={box} p={p} style={style} drag={drag} onChange={onChange} />
          {style.page ? null : <SpaceHandle t={t} kit={kit} box={box} p={p} style={style} drag={drag} onChange={onChange} />}
        </>
      ) : null,
    };
  };
}
