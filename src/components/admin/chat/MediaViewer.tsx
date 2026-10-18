"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Download, X, ZoomIn, ZoomOut } from "lucide-react";
import { cn } from "@/lib/class-names";

export interface ViewerItem {
  id: string;
  type: "image" | "video";
  src: string;
  caption: string;
  meta: string;
  /** Файл с нашего адреса — можно скачать атрибутом download. */
  download: boolean;
}

/**
 * Просмотр фото и видео чата во весь экран: листание всех вложений диалога (стрелки, ←/→, свайп), увеличение фото,
 * скачивание, подпись и кто/когда отправил. Esc или клик по фону — закрыть.
 */
export function MediaViewer({ items, index, onIndex, onClose }: { items: ViewerItem[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const [zoom, setZoom] = useState(false);
  const [touchX, setTouchX] = useState<number | null>(null);
  const item = items[index];
  const go = useCallback(
    (d: number) => {
      if (!items.length) return;
      setZoom(false);
      onIndex((index + d + items.length) % items.length);
    },
    [index, items.length, onIndex],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [go, onClose]);

  if (!item) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black/90 text-white"
      role="dialog"
      aria-modal="true"
      aria-label="Просмотр вложения"
      onTouchStart={(e) => setTouchX(e.touches[0]?.clientX ?? null)}
      onTouchEnd={(e) => {
        const x = e.changedTouches[0]?.clientX;
        if (touchX !== null && x !== undefined && Math.abs(x - touchX) > 60 && !zoom) go(x < touchX ? 1 : -1);
        setTouchX(null);
      }}
    >
      <div className="flex h-14 shrink-0 items-center gap-3 px-4 text-sm">
        <span className="text-white/70 tabular-nums">
          {index + 1} / {items.length}
        </span>
        <span className="min-w-0 flex-1 truncate text-white/80">{item.meta}</span>
        {item.type === "image" ? (
          <button type="button" className="rounded-full p-2 hover:bg-white/10" onClick={() => setZoom((z) => !z)} aria-label={zoom ? "Уменьшить" : "Увеличить"}>
            {zoom ? <ZoomOut className="size-5" /> : <ZoomIn className="size-5" />}
          </button>
        ) : null}
        <a href={item.src} {...(item.download ? { download: true } : { target: "_blank", rel: "noopener noreferrer" })} className="rounded-full p-2 hover:bg-white/10" aria-label="Скачать">
          <Download className="size-5" />
        </a>
        <button type="button" className="rounded-full p-2 hover:bg-white/10" onClick={onClose} aria-label="Закрыть">
          <X className="size-6" />
        </button>
      </div>
      <div className={cn("relative flex min-h-0 flex-1 items-center justify-center", zoom ? "overflow-auto" : "overflow-hidden")} onClick={(e) => e.target === e.currentTarget && onClose()}>
        {items.length > 1 ? (
          <button type="button" className="absolute left-2 z-10 rounded-full bg-black/40 p-2 hover:bg-white/15" onClick={() => go(-1)} aria-label="Предыдущее">
            <ChevronLeft className="size-7" />
          </button>
        ) : null}
        {item.type === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={item.id}
            src={item.src}
            alt={item.caption}
            onClick={() => setZoom((z) => !z)}
            className={cn("select-none", zoom ? "max-w-none cursor-zoom-out" : "max-h-full max-w-full cursor-zoom-in object-contain")}
          />
        ) : (
          <video key={item.id} src={item.src} controls autoPlay playsInline className="max-h-full max-w-full" />
        )}
        {items.length > 1 ? (
          <button type="button" className="absolute right-2 z-10 rounded-full bg-black/40 p-2 hover:bg-white/15" onClick={() => go(1)} aria-label="Следующее">
            <ChevronRight className="size-7" />
          </button>
        ) : null}
      </div>
      {item.caption ? <p className="mx-auto max-w-3xl shrink-0 px-4 py-3 text-center text-sm whitespace-pre-wrap text-white/90">{item.caption}</p> : null}
      {items.length > 1 ? (
        <div className="no-scrollbar flex shrink-0 justify-center gap-1.5 overflow-x-auto px-4 pb-4">
          {items.map((it, i) => (
            <button key={it.id} type="button" onClick={() => (setZoom(false), onIndex(i))} className={cn("size-12 shrink-0 overflow-hidden rounded-md border-2", i === index ? "border-white" : "border-transparent opacity-60 hover:opacity-100")} aria-label={`Вложение ${i + 1}`}>
              {it.type === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={it.src} alt="" className="size-full object-cover" loading="lazy" />
              ) : (
                <span className="flex size-full items-center justify-center bg-white/10 text-[10px]">видео</span>
              )}
            </button>
          ))}
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
