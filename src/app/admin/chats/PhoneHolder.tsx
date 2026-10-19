"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { LoaderCircle, Smartphone } from "lucide-react";
import { toast, toastError } from "@/components/ui/overlays";
import { cn } from "@/lib/class-names";
import { setPhoneHolderAction } from "./actions";

/**
 * «Телефон WhatsApp у …»: кто сейчас отвечает клиентам с телефона магазина. Его ответы с телефона забирают новую заявку
 * и чат на него (даже если круг отдал их другому). Руководитель выбирает любого, остальные — «у меня».
 */
export function PhoneHolder({ holder, me, staff, canPickAnyone }: { holder: { id: string; name: string } | null; me: string; staff: { id: string; label: string }[]; canPickAnyone: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const set = (id: string | null) =>
    start(async () => {
      try {
        const r = await setPhoneHolderAction(id);
        if (r.error) return toast(r.error, "error");
        router.refresh();
      } catch (e) {
        toastError(e);
      }
    });
  const mine = holder?.id === me;
  return (
    <div className={cn("flex items-center gap-2 rounded-xl px-3 py-2 text-[13px]", holder ? "bg-emerald-50 text-emerald-900" : "bg-[#f3efe9] text-ink-soft")} title="Ответы с телефона магазина (мимо CRM) забирают новые заявки на этого сотрудника">
      {pending ? <LoaderCircle className="size-4 shrink-0 animate-spin" /> : <Smartphone className="size-4 shrink-0" />}
      <span className="shrink-0">Телефон WhatsApp:</span>
      {canPickAnyone ? (
        <select value={holder?.id ?? ""} onChange={(e) => set(e.target.value || null)} disabled={pending} className="min-w-0 flex-1 cursor-pointer truncate bg-transparent font-semibold outline-none" aria-label="У кого телефон WhatsApp">
          <option value="">не указан</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
              {s.id === me ? " (я)" : ""}
            </option>
          ))}
        </select>
      ) : (
        <>
          <span className="min-w-0 flex-1 truncate font-semibold">{holder ? (mine ? "у меня" : holder.name) : "не указан"}</span>
          {!mine ? (
            <button type="button" disabled={pending} onClick={() => set(me)} className="shrink-0 rounded-lg bg-white px-2 py-1 text-xs font-medium shadow-sm hover:bg-cream">
              Телефон у меня
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
