"use client";

import { useRef, useState, type CSSProperties } from "react";
import type { PhotoCrop } from "@/lib/book/photo-crop";
import { photoUrl } from "@/lib/urls";
import { cn } from "@/lib/class-names";

export type FrameShape = "circle" | "arch" | "page" | "square";

/** Пропорции и форма рамки: как место снимка в книге (круг и арка — начало главы, страница — под обрез). */
const SHAPES: Record<FrameShape, { ratio: number; radius: string }> = {
  circle: { ratio: 1, radius: "9999px" },
  arch: { ratio: 1 / 1.3, radius: "50% 50% 0 0 / 38% 38% 0 0" },
  page: { ratio: 148 / 210, radius: "4px" },
  square: { ratio: 1, radius: "6px" },
};

/**
 * Снимок в рамке места, который двигают пальцем или мышью прямо внутри рамки (и приближают снаружи — zoom в crop).
 * Модель кадра — как в PDF (photo-crop.ts): снимок покрывает рамку с приближением, точка кадра (x, y) — доля «лишнего»
 * снимка слева и сверху. Сдвиг на dx пикселей меняет x на dx / (ширина снимка − ширина рамки).
 */
export function PanFrame({
  photo,
  crop,
  shape,
  width,
  onChange,
  onCommit,
  disabled,
  className,
}: {
  photo: { id: string; width: number; height: number };
  crop: PhotoCrop;
  shape: FrameShape;
  /** Ширина рамки, px. */
  width: number;
  onChange: (crop: PhotoCrop) => void;
  /** Отпустили — можно сохранять. */
  onCommit?: (crop: PhotoCrop) => void;
  disabled?: boolean;
  className?: string;
}) {
  const s = SHAPES[shape];
  const W = width;
  const H = Math.round(width / s.ratio);
  // Размер снимка в рамке: покрыть её (cover) и приблизить.
  const cover = Math.max(W / photo.width, H / photo.height) * crop.zoom;
  const DW = photo.width * cover;
  const DH = photo.height * cover;
  const left = -(DW - W) * crop.x;
  const top = -(DH - H) * crop.y;
  const start = useRef<{ px: number; py: number; crop: PhotoCrop } | null>(null);
  const [active, setActive] = useState(false);
  // Последний кадр за жест — для onCommit (пишется в обработчике, не при отрисовке).
  const last = useRef<PhotoCrop | null>(null);

  const move = (px: number, py: number) => {
    const s0 = start.current;
    if (!s0) return;
    const clamp = (v: number) => Math.min(1, Math.max(0, v));
    const next = {
      ...s0.crop,
      x: DW > W ? clamp(s0.crop.x - (px - s0.px) / (DW - W)) : s0.crop.x,
      y: DH > H ? clamp(s0.crop.y - (py - s0.py) / (DH - H)) : s0.crop.y,
    };
    const rounded = { ...next, x: Math.round(next.x * 1000) / 1000, y: Math.round(next.y * 1000) / 1000 };
    last.current = rounded;
    onChange(rounded);
  };

  const style: CSSProperties = { width: W, height: H, borderRadius: s.radius };
  return (
    <div
      className={cn("relative touch-none select-none overflow-hidden bg-cream ring-1 ring-line", disabled ? "cursor-default" : active ? "cursor-grabbing" : "cursor-grab", className)}
      style={style}
      onPointerDown={(e) => {
        if (disabled) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { px: e.clientX, py: e.clientY, crop };
        last.current = null;
        setActive(true);
      }}
      onPointerMove={(e) => move(e.clientX, e.clientY)}
      onPointerUp={() => {
        if (!start.current) return;
        start.current = null;
        setActive(false);
        if (last.current) onCommit?.(last.current);
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- фото клиента: двигается внутри рамки */}
      <img src={photoUrl(photo.id, "view")} alt="" draggable={false} className="pointer-events-none absolute max-w-none" style={{ left, top, width: DW, height: DH }} />
    </div>
  );
}
