"use client";

import { ask } from "@/components/ui/overlays";
import { useState, useTransition } from "react";
import { BellRing, LoaderCircle } from "lucide-react";
import { remindManyAction } from "../actions";

export function RemindAll({ clientIds }: { clientIds: string[] }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  if (!clientIds.length) return null;
  return (
    <div className="flex items-center gap-3">
      {msg ? <span className="text-sm text-muted">{msg}</span> : null}
      <button
        className="btn btn-primary btn-sm"
        disabled={pending}
        onClick={async () => {
          if (!(await ask(`Отправить напоминание ${clientIds.length} клиентам? Тем, кому писали менее 3 дней назад, письмо не уйдёт.`))) return;
          start(async () => {
            const r = await remindManyAction(clientIds);
            setMsg(`Отправлено: ${r.sent}, пропущено: ${r.skipped}`);
          });
        }}
      >
        {pending ? <LoaderCircle className="size-4 animate-spin" /> : <BellRing className="size-4" />} Напомнить всем на странице
      </button>
    </div>
  );
}
