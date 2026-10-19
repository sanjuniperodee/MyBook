"use client";

import { useState } from "react";

/** Выбор строк таблицы для массовых действий: отметить строку, все сразу, снять выделение. */
export function useRowSelection(rows: readonly { id: string }[]) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
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
