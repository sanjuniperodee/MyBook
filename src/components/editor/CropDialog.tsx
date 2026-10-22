"use client";

import { useState } from "react";
import { useMessages } from "@/i18n/client";
import { getFormat } from "@/lib/book/formats";
import { CROP_ZOOM_MAX, normalizeCrop, PAGE_FOCUS, type PhotoCrop } from "@/lib/book/photo-crop";
import { OPENER_FOCUS, pageFrame, type PlaceFrame } from "@/lib/book/photo-pages";
import { PanFrame } from "./PanFrame";
import { Sheet } from "./photos/Sheet";

/** Приближение кадра: ползунок под рамкой. */
export function ZoomSlider({ value, onChange, onCommit, disabled }: { value: number; onChange: (zoom: number) => void; onCommit?: () => void; disabled?: boolean }) {
  const t = useMessages().editor.crop;
  return (
    <label className="block text-sm">
      <span className="flex justify-between font-medium">
        {t.zoom} <span className="tabular-nums text-muted">×{value.toFixed(1)}</span>
      </span>
      <input type="range" min={1} max={CROP_ZOOM_MAX} step={0.05} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} onPointerUp={onCommit} onKeyUp={onCommit} className="mt-2 h-11 w-full accent-wine" />
    </label>
  );
}

/** Какое место повторяет рамка: фото главы, весь лист (под обрез) или клетка сетки. */
export const frameLabelKey = (frame: Pick<PlaceFrame, "kind">): "opener" | "page" | "cell" => (frame.kind === "page" ? "page" : frame.kind === "grid" ? "cell" : "opener");

/**
 * Ширина рамки на экране: во всю ширину листа (с полями), но не выше половины экрана — ползунок и кнопки
 * остаются видны на телефоне. max — предел на широком экране.
 */
export function frameWidth(ratio: number, max = 360, viewport?: { w: number; h: number }) {
  const vp = viewport ?? (typeof window === "undefined" ? { w: 400, h: 800 } : { w: window.innerWidth, h: window.innerHeight });
  return Math.round(Math.max(120, Math.min(max, vp.w - 64, vp.h * 0.5 * ratio)));
}

/**
 * Кадр фото — одна рамка, как место фото в книге сейчас (frame: openerFrame / pageFrame / gridCellFrame из
 * photo-pages.ts по текущим оформлению и формату): снимок двигают прямо в ней и приближают ползунком.
 * Что внутри рамки — то и напечатается. «Как было» — кадр по правилу места (null).
 */
export function CropDialog({
  photo,
  crop,
  frame = pageFrame(getFormat("a5")),
  onSave,
  onClose,
}: {
  photo: { id: string; width: number; height: number };
  crop: PhotoCrop | null;
  /** Рамка места фото; нет — лист под обрез (фото на всю страницу). */
  frame?: PlaceFrame;
  onSave: (crop: PhotoCrop | null) => void;
  onClose: () => void;
}) {
  const t = useMessages().editor.crop;
  const focus = frame.kind === "page" || frame.kind === "grid" ? PAGE_FOCUS : OPENER_FOCUS;
  const [value, setValue] = useState<PhotoCrop>(crop ?? { ...focus, zoom: 1 });
  const [width] = useState(() => frameWidth(frame.ratio));

  return (
    <Sheet
      title={t.title}
      onClose={onClose}
      closeLabel={t.close}
      layer="z-[95]"
      footer={
        <div className="flex gap-2">
          <button type="button" className="btn btn-outline flex-1 sm:flex-none" onClick={() => onSave(null)}>
            {t.reset}
          </button>
          <button type="button" className="btn btn-primary flex-1" onClick={() => onSave(normalizeCrop(value))}>
            {t.save}
          </button>
        </div>
      }
    >
      <p className="text-sm text-muted">{t.hint}</p>
      <div className="mt-4 flex flex-col items-center">
        <div className="mb-2 text-xs font-medium text-muted">{t.frameLabel[frameLabelKey(frame)]}</div>
        <PanFrame photo={photo} crop={value} ratio={frame.ratio} mask={frame.mask} card={frame.card} width={width} onChange={setValue} />
      </div>
      <div className="mx-auto mt-4 max-w-sm">
        <ZoomSlider value={value.zoom} onChange={(zoom) => setValue((v) => ({ ...v, zoom }))} />
      </div>
    </Sheet>
  );
}
