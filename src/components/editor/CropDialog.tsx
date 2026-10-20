"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useMessages } from "@/i18n/client";
import { CROP_ZOOM_MAX, normalizeCrop, type PhotoCrop } from "@/lib/book/photo-crop";
import { photoUrl } from "@/lib/urls";

/** Снимок с кадром — как в книге: object-fit cover, точка кадра и приближение от неё (photo-crop.ts, PageImage). */
function Framed({ id, crop, className, style }: { id: string; crop: PhotoCrop; className?: string; style?: React.CSSProperties }) {
  const origin = `${crop.x * 100}% ${crop.y * 100}%`;
  return (
    <div className={`overflow-hidden bg-cream ${className ?? ""}`} style={style}>
      {/* eslint-disable-next-line @next/next/no-img-element -- фото клиента в предпросмотре кадра */}
      <img src={photoUrl(id, "view")} alt="" draggable={false} className="block size-full object-cover" style={{ objectPosition: origin, transform: `scale(${crop.zoom})`, transformOrigin: origin }} />
    </div>
  );
}

/**
 * Кадр фото: точка, которая остаётся в кадре (нажать или потянуть по снимку), и приближение. Справа — как снимок сядет
 * в круг начала главы и на страницу. «Как было» — кадр по правилу места (null).
 */
export function CropDialog({ photo, crop, onSave, onClose }: { photo: { id: string; width: number; height: number }; crop: PhotoCrop | null; onSave: (crop: PhotoCrop | null) => void; onClose: () => void }) {
  const t = useMessages().editor.crop;
  const [value, setValue] = useState<PhotoCrop>(crop ?? { x: 0.5, y: 0.3, zoom: 1 });
  const area = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const pick = (e: ReactPointerEvent<HTMLDivElement>) => {
    const r = area.current?.getBoundingClientRect();
    if (!r) return;
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    setValue((v) => ({ ...v, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 }));
  };

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="max-h-[92dvh] w-full max-w-3xl overflow-y-auto rounded-t-3xl bg-white p-4 shadow-2xl sm:rounded-3xl sm:p-6" role="dialog" aria-modal="true" aria-label={t.title}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t.title}</h2>
          <button type="button" onClick={onClose} className="rounded-full p-2.5 text-muted hover:bg-cream hover:text-ink" aria-label={t.close}>
            <X className="size-4" />
          </button>
        </div>
        <p className="mt-1 text-sm text-muted">{t.hint}</p>
        <div className="mt-4 grid gap-5 sm:grid-cols-[minmax(0,1fr)_14rem]">
          <div>
            <div
              ref={area}
              className="relative mx-auto max-h-[55dvh] cursor-crosshair touch-none select-none overflow-hidden rounded-2xl bg-cream"
              style={{ aspectRatio: `${photo.width} / ${photo.height}` }}
              onPointerDown={(e) => {
                dragging.current = true;
                e.currentTarget.setPointerCapture(e.pointerId);
                pick(e);
              }}
              onPointerMove={(e) => dragging.current && pick(e)}
              onPointerUp={() => (dragging.current = false)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- фото клиента: выбор точки кадра */}
              <img src={photoUrl(photo.id, "view")} alt="" draggable={false} className="block size-full object-contain" />
              <span className="pointer-events-none absolute size-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_2px_rgba(0,0,0,.35)]" style={{ left: `${value.x * 100}%`, top: `${value.y * 100}%` }} />
            </div>
            <label className="mt-4 block text-sm">
              <span className="flex justify-between font-medium">
                {t.zoom} <span className="tabular-nums text-muted">×{value.zoom.toFixed(1)}</span>
              </span>
              <input type="range" min={1} max={CROP_ZOOM_MAX} step={0.05} value={value.zoom} onChange={(e) => setValue((v) => ({ ...v, zoom: Number(e.target.value) }))} className="mt-2 w-full accent-wine" />
            </label>
          </div>
          <div className="space-y-4">
            <div>
              <div className="mb-1.5 text-xs font-medium text-muted">{t.previewCircle}</div>
              <Framed id={photo.id} crop={value} className="mx-auto aspect-square w-40 rounded-full ring-1 ring-line" />
            </div>
            <div>
              <div className="mb-1.5 text-xs font-medium text-muted">{t.previewPage}</div>
              <Framed id={photo.id} crop={value} className="mx-auto w-32 rounded-sm ring-1 ring-line" style={{ aspectRatio: "148 / 210" }} />
            </div>
          </div>
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
