"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { toast } from "@/components/ui/overlays";
import { saveStaffChatNamesAction } from "../actions";

/**
 * Как сотрудники называют себя в чатах (crm.staffChatNames): аккаунт может называться иначе («Margo»), а клиентам
 * сотрудник представляется своим именем («Марат») — по нему ИИ узнаёт, кто ведёт переписку с телефона магазина.
 */
export function StaffChatNames({ staff }: { staff: { id: string; name: string; chatNames: string[] }[] }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const [v, setV] = useState(() => Object.fromEntries(staff.map((s) => [s.id, s.chatNames.join(", ")])));
  const save = () =>
    start(async () => {
      const r = await saveStaffChatNamesAction(v);
      if (r.error) return toast(r.error, "error");
      toast("Сохранено", "success");
      router.refresh();
    });
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <p className="text-sm">
        <span className="font-medium">Как сотрудники представляются в чатах</span>
        <span className="block text-muted">Если имя аккаунта не то, которым сотрудник называет себя клиентам, впишите имя из чатов (через запятую, если их несколько). Пусто — ИИ узнаёт сотрудника по имени аккаунта.</span>
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {staff.map((s) => (
          <label key={s.id} className="flex items-center gap-2 text-sm">
            <span className="w-32 shrink-0 truncate text-ink-soft" title={s.name}>
              {s.name}
            </span>
            <input className="input" value={v[s.id] ?? ""} maxLength={200} placeholder={s.name} onChange={(e) => setV((cur) => ({ ...cur, [s.id]: e.target.value }))} />
          </label>
        ))}
      </div>
      <button type="submit" className="btn btn-outline btn-sm" disabled={pending}>
        {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null} Сохранить имена
      </button>
    </form>
  );
}
