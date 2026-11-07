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
    <div className={cn("flex min-h-10 items-center gap-2 rounded-[10px] px-3 py-1.5 text-[13px]", holder ? "bg-success-bg text-success" : "bg-sunken text-ink-soft")} title="Ответы с телефона магазина (мимо CRM) забирают новые заявки на этого сотрудника">
      {pending ? <LoaderCircle className="size-4 shrink-0 animate-spin" /> : <Smartphone className="size-4 shrink-0" strokeWidth={1.8} aria-hidden />}
      <span className="shrink-0">Телефон WhatsApp:</span>
      {canPickAnyone ? (
        <select value={holder?.id ?? ""} onChange={(e) => set(e.target.value || null)} disabled={pending} className="min-h-9 min-w-0 flex-1 cursor-pointer truncate bg-transparent font-semibold outline-none max-lg:min-h-11" aria-label="У кого телефон WhatsApp">
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
            <button type="button" disabled={pending} onClick={() => set(me)} className="btn btn-outline btn-sm h-8 shrink-0 px-2.5 text-xs">
              Телефон у меня
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
