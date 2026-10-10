"use client";

import { useEffect, useRef, useState } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { DEFAULT_FRAME, isDefaultFrame, MAX_ZOOM, panFrame, zoomFrame, type PhotoFrame } from "@/lib/book/photo-frame";
import type { SlotBox } from "@/lib/book/photo-slots";
import { cn } from "@/lib/utils";

export interface FrameSlot extends SlotBox {
  /** Ключ кадра в книге: «cover:0», «back:1». */
  key: string;
  /** Размеры снимка, стоящего на месте, — по ним считается, на сколько его можно двигать. */
  photo: { width: number; height: number };
  frame: PhotoFrame;
}

const PAN_STEP = 0.04; // доля места за одно нажатие стрелки
const WHEEL_SPEED = 0.0016;

/**
 * Управление кадром фото прямо на превью обложки: перетаскивание двигает снимок в его месте, колёсико, ползунок
 * и клавиши +/− меняют масштаб, стрелки двигают. Слой кладётся поверх превью (родитель — position: relative);
 * сами снимки рисует превью — слой только ловит жесты и отдаёт новый кадр.
 */
export function FrameLayer({
  slots,
  selected,
  onSelect,
  onChange,
  ariaLabel,
}: {
  slots: FrameSlot[];
  selected: string | null;
  onSelect: (key: string) => void;
  onChange: (key: string, frame: PhotoFrame) => void;
  ariaLabel: (n: number) => string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const drag = useRef<{ key: string; x: number; y: number; frame: PhotoFrame } | null>(null);
  const latest = useRef({ slots, onChange, onSelect });
  useEffect(() => {
    latest.current = { slots, onChange, onSelect };
  });

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Колёсико — масштаб места под курсором. React вешает wheel пассивно, а страницу прокручивать при этом не нужно, поэтому слушатель свой.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>("[data-frame-key]");
      const key = target?.dataset.frameKey;
      const slot = latest.current.slots.find((s) => s.key === key);
      if (!slot) return;
      e.preventDefault();
      latest.current.onSelect(slot.key);
      latest.current.onChange(slot.key, zoomFrame(slot.frame, slot.frame.zoom * (1 - e.deltaY * WHEEL_SPEED)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const px = (s: SlotBox) => ({ w: s.w * size.w, h: s.h * size.h });

  /** Сдвиг пальца в пикселях экрана → в систему места (с учётом поворота карточки). */
  const toSlot = (s: SlotBox, dx: number, dy: number) => {
    const a = ((s.rotate ?? 0) * Math.PI) / 180;
    return { dx: dx * Math.cos(a) + dy * Math.sin(a), dy: -dx * Math.sin(a) + dy * Math.cos(a) };
  };

  return (
    <div ref={root} className="absolute inset-0">
      {slots.map((s, i) => {
        const isSel = s.key === selected;
        return (
          <div
            key={s.key}
            data-frame-key={s.key}
            role="group"
            tabIndex={0}
            aria-label={ariaLabel(i + 1)}
            className={cn("absolute cursor-grab touch-pan-y outline-offset-2 transition-shadow active:cursor-grabbing", isSel ? "shadow-[0_0_0_2px_#fff,0_0_0_4px_var(--color-wine,#8b2c3c)]" : "hover:shadow-[0_0_0_2px_rgba(255,255,255,.85)]")}
            style={{
              left: `${s.x * 100}%`,
              top: `${s.y * 100}%`,
              width: `${s.w * 100}%`,
              height: `${s.h * 100}%`,
              transform: s.rotate ? `rotate(${s.rotate}deg)` : undefined,
              transformOrigin: s.origin ? `${s.origin.x * 100}% ${s.origin.y * 100}%` : undefined,
              touchAction: isSel ? "none" : undefined,
            }}
            onFocus={() => onSelect(s.key)}
            onDoubleClick={() => onChange(s.key, DEFAULT_FRAME)}
            onPointerDown={(e) => {
              onSelect(s.key);
              // На сенсорном экране первое касание лишь выбирает место, чтобы не мешать прокрутке страницы.
              if (e.pointerType !== "mouse" && !isSel) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              drag.current = { key: s.key, x: e.clientX, y: e.clientY, frame: s.frame };
            }}
            onPointerMove={(e) => {
              const d = drag.current;
              if (!d || d.key !== s.key) return;
              const v = toSlot(s, e.clientX - d.x, e.clientY - d.y);
              onChange(s.key, panFrame(d.frame, px(s), s.photo, v.dx, v.dy));
            }}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
            onKeyDown={(e) => {
              const p = px(s);
              const step = { x: p.w * PAN_STEP, y: p.h * PAN_STEP };
              if (e.key === "ArrowLeft") onChange(s.key, panFrame(s.frame, p, s.photo, -step.x, 0));
              else if (e.key === "ArrowRight") onChange(s.key, panFrame(s.frame, p, s.photo, step.x, 0));
              else if (e.key === "ArrowUp") onChange(s.key, panFrame(s.frame, p, s.photo, 0, -step.y));
              else if (e.key === "ArrowDown") onChange(s.key, panFrame(s.frame, p, s.photo, 0, step.y));
              else if (e.key === "+" || e.key === "=") onChange(s.key, zoomFrame(s.frame, s.frame.zoom + 0.1));
              else if (e.key === "-" || e.key === "_") onChange(s.key, zoomFrame(s.frame, s.frame.zoom - 0.1));
              else if (e.key === "Escape" || e.key === "0") onChange(s.key, DEFAULT_FRAME);
              else return;
              e.preventDefault();
            }}
          />
        );
      })}
    </div>
  );
}

/** Панель под превью: какое место выбрано, масштаб ползунком и кнопками, сброс. */
export function FrameControls({
  slots,
  selected,
  onSelect,
  onChange,
  labels,
}: {
  slots: FrameSlot[];
  selected: string | null;
  onSelect: (key: string) => void;
  onChange: (key: string, frame: PhotoFrame) => void;
  labels: { hint: string; zoom: string; zoomIn: string; zoomOut: string; reset: string; slot: (n: number) => string };
}) {
  const current = slots.find((s) => s.key === selected) ?? slots[0];
  if (!current) return null;
  return (
    <div className="mt-4 space-y-3 rounded-2xl bg-white p-3.5 text-sm shadow-soft">
      {slots.length > 1 ? (
        <div className="flex flex-wrap gap-1.5">
          {slots.map((s, i) => (
            <button
              key={s.key}
              type="button"
              onClick={() => onSelect(s.key)}
              aria-pressed={s.key === current.key}
              className={cn("rounded-full px-3 py-1 text-xs transition", s.key === current.key ? "bg-ink text-white" : "bg-cream text-ink-soft hover:bg-cream/70")}
            >
              {labels.slot(i + 1)}
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        <button type="button" className="btn btn-ghost btn-sm size-8 shrink-0 px-0" aria-label={labels.zoomOut} onClick={() => onChange(current.key, zoomFrame(current.frame, current.frame.zoom - 0.25))}>
          <Minus className="size-4" />
        </button>
        <input
          type="range"
          min={1}
          max={MAX_ZOOM}
          step={0.05}
          value={current.frame.zoom}
          aria-label={labels.zoom}
          onChange={(e) => onChange(current.key, zoomFrame(current.frame, Number(e.target.value)))}
          className="h-2 min-w-0 flex-1 accent-wine"
        />
        <button type="button" className="btn btn-ghost btn-sm size-8 shrink-0 px-0" aria-label={labels.zoomIn} onClick={() => onChange(current.key, zoomFrame(current.frame, current.frame.zoom + 0.25))}>
          <Plus className="size-4" />
        </button>
        <button type="button" className="btn btn-ghost btn-sm shrink-0 gap-1 px-2" disabled={isDefaultFrame(current.frame)} onClick={() => onChange(current.key, DEFAULT_FRAME)}>
          <RotateCcw className="size-3.5" /> {labels.reset}
        </button>
      </div>
      <p className="text-xs text-muted">{labels.hint}</p>
    </div>
  );
}
