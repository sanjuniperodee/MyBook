"use client";

import { useState } from "react";
import { CalendarView } from "../boards/CalendarView";
import { CardDialog } from "../boards/CardDialog";
import type { Staff } from "../boards/client";

/** Общий календарь: карточки со сроком со всех видимых досок; «Только мои» — где я исполнитель. */
export function CalendarPage({ staff, me }: { staff: Staff[]; me: string }) {
  const [mine, setMine] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1.5">
        <button type="button" className="chip" aria-pressed={mine} onClick={() => setMine(true)}>
          Только мои
        </button>
        <button type="button" className="chip" aria-pressed={!mine} onClick={() => setMine(false)}>
          Все доски
        </button>
      </div>
      <CalendarView boardId={null} mine={mine} staff={new Map(staff.map((s) => [s.id, s.label]))} onOpen={setOpen} />
      {open ? <CardDialog id={open} staff={staff} me={me} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}
