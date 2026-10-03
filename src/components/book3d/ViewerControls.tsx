"use client";

import { ChevronLeft, ChevronRight, Maximize2, Minimize2, Minus, Pause, Play, Plus, RotateCcw } from "lucide-react";
import { useMessages } from "@/i18n/client";
import { cn } from "@/lib/utils";

export const VIEW_IDS = ["front", "spine", "back", "edge", "top", "bottom"] as const;
export type ViewId = (typeof VIEW_IDS)[number];

export interface ViewerControlsProps {
  /** Листов всего (0, пока текст не измерен) и номер текущей позиции. */
  count: number;
  slot: number;
  /** Подпись текущего разворота. */
  label: string;
  /** Подсвеченный ракурс: сторона, «read» или null. */
  active: string | null;
  auto: boolean;
  canFull: boolean;
  full: boolean;
  dimsText: string;
  onPrev: () => void;
  onNext: () => void;
  onSeek: (n: number) => void;
  onView: (id: ViewId) => void;
  onRead: () => void;
  onZoom: (factor: number) => void;
  onAuto: () => void;
  onReset: () => void;
  onFull: () => void;
}

/** Общая панель управления объёмной книгой: листание, ракурсы, масштаб, автоповорот и полный экран. */
export function ViewerControls(p: ViewerControlsProps) {
  const m = useMessages().books.preview;
  const f = m.flip;
  const mm = m.model;
  const step = 1.25;
  return (
    <>
      <div className="flex w-full max-w-3xl items-center gap-3">
        <button type="button" className="btn btn-outline btn-sm" aria-label={f.prev} disabled={!p.count || p.slot <= 0} onClick={p.onPrev}>
          <ChevronLeft className="size-4" />
        </button>
        <input
          type="range"
          aria-label={f.slider}
          min={0}
          max={Math.max(0, p.count - 1)}
          step={1}
          value={p.slot}
          disabled={!p.count}
          onChange={(e) => p.onSeek(Number(e.target.value))}
          className="min-w-0 flex-1 accent-wine"
        />
        <button type="button" className="btn btn-outline btn-sm" aria-label={f.next} disabled={!p.count || p.slot >= p.count - 1} onClick={p.onNext}>
          <ChevronRight className="size-4" />
        </button>
      </div>
      <p aria-live="polite" className="text-sm font-medium text-ink-soft">
        {p.label}
      </p>

      <div role="toolbar" aria-label={mm.group} className="flex max-w-3xl flex-wrap items-center justify-center gap-2">
        {VIEW_IDS.map((id) => (
          <button key={id} type="button" aria-pressed={p.active === id} onClick={() => p.onView(id)} className={cn("btn btn-sm", p.active === id ? "btn-primary" : "btn-outline")}>
            {mm.views[id]}
          </button>
        ))}
        <button type="button" aria-pressed={p.active === "read"} onClick={p.onRead} className={cn("btn btn-sm", p.active === "read" ? "btn-primary" : "btn-outline")}>
          {mm.views.read}
        </button>
        <span className="mx-1 h-5 w-px bg-line" aria-hidden />
        <button type="button" className="btn btn-outline btn-sm" aria-label={mm.zoomOut} title={mm.zoomOut} onClick={() => p.onZoom(1 / step)}>
          <Minus className="size-4" />
        </button>
        <button type="button" className="btn btn-outline btn-sm" aria-label={mm.zoomIn} title={mm.zoomIn} onClick={() => p.onZoom(step)}>
          <Plus className="size-4" />
        </button>
        <button type="button" className="btn btn-outline btn-sm" aria-pressed={p.auto} aria-label={p.auto ? mm.autoOff : mm.autoOn} title={p.auto ? mm.autoOff : mm.autoOn} onClick={p.onAuto}>
          {p.auto ? <Pause className="size-4" /> : <Play className="size-4" />}
        </button>
        <button type="button" className="btn btn-outline btn-sm" aria-label={mm.reset} title={mm.reset} onClick={p.onReset}>
          <RotateCcw className="size-4" />
        </button>
        {p.canFull ? (
          <button type="button" className="btn btn-outline btn-sm" aria-label={p.full ? f.exitFullscreen : f.fullscreen} title={p.full ? f.exitFullscreen : f.fullscreen} onClick={p.onFull}>
            {p.full ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </button>
        ) : null}
      </div>
      <p className="text-sm font-medium text-ink-soft">{p.dimsText}</p>
      <p className="max-w-xl text-center text-xs text-muted">
        {mm.hint} {mm.note}
      </p>
    </>
  );
}
