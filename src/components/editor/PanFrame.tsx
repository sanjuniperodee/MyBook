"use client";

import { useRef, useState, type CSSProperties } from "react";
import type { PhotoCrop } from "@/lib/book/photo-crop";
import { photoUrl } from "@/lib/urls";
import { cn } from "@/lib/class-names";

/** Форма окна рамки: прямоугольник, круг или арка (скруглённый верх радиусом в половину ширины — как в PDF). */
export type FrameMask = "rect" | "circle" | "arch";

/** Прежние формы рамки (лист «Фото главы» на вкладке «Страницы»): пропорции и окно — по таблице ниже. */
export type FrameShape = "circle" | "arch" | "page" | "square";

const LEGACY: Record<FrameShape, { ratio: number; mask: FrameMask }> = {
  circle: { ratio: 1, mask: "circle" },
  arch: { ratio: 1 / 1.3, mask: "arch" },
  page: { ratio: 148 / 210, mask: "rect" },
  square: { ratio: 1, mask: "rect" },
};

/** Поля карточки полароида вокруг снимка — доли ширины снимка, как у начальной полосы (openerPhotoPlan). */
const CARD = { side: 0.0556, bottom: 0.1667 };

/**
 * Снимок в рамке места, который двигают пальцем или мышью прямо внутри рамки (и приближают снаружи — zoom в crop).
 * Рамка — как место в книге: пропорции ratio, окно mask, у полароида — белая карточка вокруг (card). Их дают
 * openerFrame / pageFrame / gridCellFrame (photo-pages.ts) по текущим оформлению и формату.
 * Модель кадра — как в PDF (photo-crop.ts): снимок покрывает рамку с приближением, точка кадра (x, y) — доля «лишнего»
 * снимка слева и сверху. Сдвиг на dx пикселей меняет x на dx / (ширина снимка − ширина рамки).
 */
export function PanFrame({
  photo,
  crop,
  ratio: ratioProp,
  mask: maskProp,
  card = false,
  shape,
  width,
  onChange,
  onCommit,
  disabled,
  className,
}: {
  photo: { id: string; width: number; height: number };
  crop: PhotoCrop;
  /** Пропорции окна: ширина к высоте. */
  ratio?: number;
  mask?: FrameMask | null;
  /** Снимок в карточке полароида. */
  card?: boolean;
  /** Прежняя форма вместо ratio и mask — пока лист вкладки «Страницы» не заменён. */
  shape?: FrameShape;
  /** Ширина окна, px. */
  width: number;
  onChange: (crop: PhotoCrop) => void;
  /** Отпустили — можно сохранять. */
  onCommit?: (crop: PhotoCrop) => void;
  disabled?: boolean;
  className?: string;
}) {
  const ratio = ratioProp ?? (shape ? LEGACY[shape].ratio : 1);
  const mask = maskProp ?? (shape ? LEGACY[shape].mask : "rect");
  const W = width;
  const H = Math.round(width / ratio);
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
  const end = () => {
    if (!start.current) return;
    start.current = null;
    setActive(false);
    if (last.current) onCommit?.(last.current);
  };

  const radius = mask === "circle" ? "9999px" : mask === "arch" ? `${W / 2}px ${W / 2}px 0 0` : card ? "0" : "4px";
  const style: CSSProperties = { width: W, height: H, borderRadius: radius };
  const pane = (
    <div
      className={cn("relative touch-none select-none overflow-hidden bg-cream", !card && "ring-1 ring-line", disabled ? "cursor-default" : active ? "cursor-grabbing" : "cursor-grab", !card && className)}
      style={style}
      data-frame={mask}
      onPointerDown={(e) => {
        if (disabled) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { px: e.clientX, py: e.clientY, crop };
        last.current = null;
        setActive(true);
      }}
      onPointerMove={(e) => move(e.clientX, e.clientY)}
      onPointerUp={end}
      onPointerCancel={end}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- фото клиента: двигается внутри рамки */}
      <img src={photoUrl(photo.id, "view")} alt="" draggable={false} className="pointer-events-none absolute max-w-none" style={{ left, top, width: DW, height: DH }} />
    </div>
  );
  if (!card) return pane;
  // Полароид: белая карточка с широким нижним полем, двигается только снимок в окне.
  return (
    <div className={cn("w-fit bg-white shadow-[0_2px_10px_rgb(0_0_0/0.12)] ring-1 ring-line/60", className)} style={{ padding: `${W * CARD.side}px ${W * CARD.side}px ${W * CARD.bottom}px` }}>
      {pane}
    </div>
  );
}
