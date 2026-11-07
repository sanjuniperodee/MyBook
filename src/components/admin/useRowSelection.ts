"use client";

import { useState } from "react";

/** Выбранные id, которые есть среди строк на экране: остальные ушли с фильтром или страницей. */
export function keepVisible(selected: ReadonlySet<string>, rows: readonly { id: string }[]): ReadonlySet<string> {
  if (!selected.size) return selected;
  const shown = new Set(rows.map((r) => r.id));
  return [...selected].every((id) => shown.has(id)) ? selected : new Set([...selected].filter((id) => shown.has(id)));
}

/**
 * Выбор строк таблицы для массовых действий: отметить строку, все сразу, снять выделение. Сменились строки (фильтр,
 * страница, обновление с сервера) — выбор остаётся только на видимых: массовое действие не заденет скрытые строки.
 */
export function useRowSelection(rows: readonly { id: string }[]) {
  const [raw, setSelected] = useState<ReadonlySet<string>>(new Set());
  // Сравниваем набор id, а не массив: тот же список, собранный заново, выбор не трогает.
  const key = rows.map((r) => r.id).join(",");
  const [shownKey, setShownKey] = useState(key);
  if (shownKey !== key) {
    setShownKey(key);
    setSelected((s) => keepVisible(s, rows));
  }
  const selected = keepVisible(raw, rows);
  const all = rows.length > 0 && selected.size === rows.length;
  return {
    selected,
    all,
    /** id выбранных строк — для действия. */
    ids: () => [...selected],
    toggle: (id: string) => setSelected((s) => (s.has(id) ? new Set([...s].filter((x) => x !== id)) : new Set([...s, id]))),
    toggleAll: () => setSelected(all ? new Set() : new Set(rows.map((r) => r.id))),
    clear: () => setSelected(new Set()),
  };
}
