"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useMessages } from "@/i18n/client";
import { CROP_ZOOM_MAX, normalizeCrop, type PhotoCrop } from "@/lib/book/photo-crop";
import { PanFrame, type FrameShape } from "./PanFrame";

/** Приближение кадра: ползунок под рамкой. */
export function ZoomSlider({ value, onChange, onCommit, disabled }: { value: number; onChange: (zoom: number) => void; onCommit?: () => void; disabled?: boolean }) {
  const t = useMessages().editor.crop;
  return (
    <label className="block text-sm">
      <span className="flex justify-between font-medium">
        {t.zoom} <span className="tabular-nums text-muted">×{value.toFixed(1)}</span>
      </span>
      <input type="range" min={1} max={CROP_ZOOM_MAX} step={0.05} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} onPointerUp={onCommit} onKeyUp={onCommit} className="mt-2 w-full accent-wine" />
    </label>
  );
}

/**
 * Кадр фото: снимок двигают прямо внутри рамки места (shape — круг начала главы, страница и т. д.) и приближают
 * ползунком; рядом — как он сядет в другом месте. «Как было» — кадр по правилу места (null).
 */
export function CropDialog({
  photo,
  crop,
  shape = "circle",
  onSave,
  onClose,
}: {
  photo: { id: string; width: number; height: number };
  crop: PhotoCrop | null;
  shape?: FrameShape;
  onSave: (crop: PhotoCrop | null) => void;
  onClose: () => void;
}) {
  const t = useMessages().editor.crop;
  const [value, setValue] = useState<PhotoCrop>(crop ?? { x: 0.5, y: 0.3, zoom: 1 });
  const other: FrameShape = shape === "page" ? "circle" : "page";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white p-4 shadow-2xl sm:rounded-3xl sm:p-6" role="dialog" aria-modal="true" aria-label={t.title}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t.title}</h2>
          <button type="button" onClick={onClose} className="rounded-full p-2.5 text-muted hover:bg-cream hover:text-ink" aria-label={t.close}>
            <X className="size-4" />
          </button>
        </div>
        <p className="mt-1 text-sm text-muted">{t.hint}</p>
        <div className="mt-4 flex flex-wrap items-end justify-center gap-5">
          <div>
            <div className="mb-1.5 text-xs font-medium text-muted">{shape === "page" ? t.previewPage : t.previewCircle}</div>
            <PanFrame photo={photo} crop={value} shape={shape} width={shape === "page" ? 200 : 260} onChange={setValue} />
          </div>
          <div>
            <div className="mb-1.5 text-xs font-medium text-muted">{other === "page" ? t.previewPage : t.previewCircle}</div>
            <PanFrame photo={photo} crop={value} shape={other} width={other === "page" ? 110 : 120} onChange={setValue} />
          </div>
        </div>
        <div className="mt-4">
          <ZoomSlider value={value.zoom} onChange={(zoom) => setValue((v) => ({ ...v, zoom }))} />
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" className="h-10 rounded-full border border-line px-4 text-sm hover:bg-cream" onClick={() => onSave(null)}>
            {t.reset}
          </button>
          <button type="button" className="h-10 rounded-full bg-wine px-5 text-sm font-medium text-white hover:opacity-90" onClick={() => onSave(normalizeCrop(value))}>
            {t.save}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
