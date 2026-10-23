"use client";

import { duePresets, parseWorkHours, type DuePresetKey, type WorkHours } from "@/shared/domain/schedule";

const LABELS: [DuePresetKey, string][] = [
  ["hour", "Через час"],
  ["morning", "Завтра утром"],
  ["days3", "Через 3 дня"],
  ["week", "Через неделю"],
];

/**
 * Срок задачи одной кнопкой (tasks-3): «через час» в рабочем времени, «завтра утром» — начало ближайшей смены, «через
 * 3 дня» и «через неделю» — начало смены в рабочий день. Время — магазина: «ГГГГ-ММ-ДДTЧЧ:ММ». Без графика — 09:00–21:00.
 */
export function DuePresets({ hours, onPick, className }: { hours?: WorkHours; onPick: (local: string) => void; className?: string }) {
  return (
    <div className={className ?? "flex flex-wrap gap-1.5"} data-testid="due-presets">
      {LABELS.map(([key, label]) => (
        <button
          key={key}
          type="button"
          className="rounded-full border border-line bg-white px-2.5 py-1 text-xs text-ink-soft hover:border-wine/40 hover:text-wine"
          onClick={() => onPick(duePresets(new Date(), hours ?? parseWorkHours(null))[key])}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
