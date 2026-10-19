"use client";

import type { Messages } from "@/i18n/messages";
import type { PreviewPhoto } from "@/lib/book/editor-model";
import type { InlinePhotoStyle } from "@/lib/book/inline-photo";
import type { PageKit } from "@/components/interior/kit";
import type { RowItem, RowPhotoBox, RowPhotoLayer } from "@/components/interior/entry";
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
 * Интерактивный слой над фото ряда в превью (ряд рисует InlineRow — как в PDF): у фото текущего ответа —
 * выделение, перетаскивание и уголок размера; у копии для замера — пустая подпись и пересчёт полос после загрузки.
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
      overlay: selected ? <ResizeHandle t={t} kit={kit} box={box} p={p} style={style} drag={drag} onChange={onChange} /> : null,
    };
  };
}
