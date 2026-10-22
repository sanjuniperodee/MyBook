"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, LoaderCircle, PhoneOff, PhoneMissed, X } from "lucide-react";
import { toast } from "@/components/ui/overlays";
import { finishWhatsappCallAction, whatsappCallAction } from "@/app/admin/crm-actions";
import { formatPhone } from "@/shared/domain/phone";
import { cn } from "@/lib/class-names";

type Target = { clientId?: string; dealId?: string; orderId?: string; callId?: string };

/** Значок WhatsApp (в lucide его нет). */
function WaIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12.04 2a9.9 9.9 0 0 0-8.43 15.09L2 22l5.05-1.32A9.9 9.9 0 1 0 12.04 2Zm0 18.1a8.2 8.2 0 0 1-4.18-1.14l-.3-.18-3 .78.8-2.92-.2-.3a8.2 8.2 0 1 1 6.88 3.76Zm4.5-6.13c-.25-.12-1.46-.72-1.69-.8-.22-.08-.39-.12-.55.12-.16.25-.63.8-.78.96-.14.16-.28.18-.53.06a6.7 6.7 0 0 1-3.3-2.88c-.25-.43.25-.4.72-1.33.08-.16.04-.3-.02-.42-.06-.12-.55-1.33-.76-1.82-.2-.48-.4-.41-.55-.42h-.47c-.16 0-.43.06-.65.3-.22.25-.86.84-.86 2.05s.88 2.38 1 2.55c.12.16 1.73 2.64 4.2 3.7 1.55.67 2.16.73 2.94.61.47-.07 1.46-.6 1.66-1.18.2-.58.2-1.07.14-1.18-.06-.1-.22-.16-.47-.28Z" />
    </svg>
  );
}

/**
 * «Позвонить в WhatsApp»: исходящих звонков WhatsApp через шлюз не бывает, поэтому кнопка записывает звонок в журнал и
 * открывает WhatsApp на чате клиента (на телефоне — приложение), где остаётся нажать на значок звонка. Итог менеджер
 * отмечает плашкой «Как прошёл звонок?» (WhatsappCallFollowUp).
 */
export function WhatsappCallButton({ target, className, label = "WhatsApp", plain = false }: { target: Target; className?: string; label?: string; plain?: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      className={cn(!plain && "btn btn-outline btn-sm", "inline-flex items-center gap-1", className)}
      disabled={pending}
      aria-label="Позвонить в WhatsApp"
      onClick={() =>
        start(async () => {
          const r = await whatsappCallAction(target);
          if (!r.ok || !r.url) return toast(r.ok ? "Не удалось открыть WhatsApp" : r.message, "error");
          // Всплывающее окно после ожидания браузер может заблокировать — тогда переходим в этой же вкладке.
          if (!window.open(r.url, "_blank", "noopener")) window.location.assign(r.url);
          router.refresh();
        })
      }
    >
      {pending ? <LoaderCircle className="size-4 animate-spin" /> : <WaIcon className="size-4 text-emerald-600" />} {label}
    </button>
  );
}

export interface PendingWhatsappCall {
  externalId: string;
  phone: string;
  startedAt: string;
}

/** Плашка над нижней панелью: как прошёл звонок в WhatsApp. Живёт, пока итог не отмечен (до 3 часов), и переживает перезагрузку. */
export function WhatsappCallFollowUp({ pending }: { pending: PendingWhatsappCall[] }) {
  const router = useRouter();
  const [hidden, setHidden] = useState<string[]>([]);
  const [busy, start] = useTransition();
  const [asking, setAsking] = useState(false);
  const [minutes, setMinutes] = useState("");
  const call = pending.find((p) => !hidden.includes(p.externalId));
  if (!call) return null;
  const save = (outcome: "answered" | "missed" | "failed") =>
    start(async () => {
      const r = await finishWhatsappCallAction(call.externalId, outcome, Number(minutes) || 0);
      if (!r.ok) return toast(r.message, "error");
      toast(r.message ?? "Звонок записан");
      setHidden((h) => [...h, call.externalId]);
      setAsking(false);
      setMinutes("");
      router.refresh();
    });
  return (
    <div
      role="dialog"
      aria-label="Как прошёл звонок в WhatsApp"
      className="fixed inset-x-3 bottom-[calc(var(--tabbar-h,0px)+0.75rem)] z-[60] rounded-3xl border border-line bg-white p-4 shadow-lift lg:right-4 lg:bottom-4 lg:left-auto lg:w-96"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
          <WaIcon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">Как прошёл звонок?</div>
          <div className="truncate text-sm text-muted tabular-nums">WhatsApp · {formatPhone(call.phone)}</div>
        </div>
        <button type="button" onClick={() => setHidden((h) => [...h, call.externalId])} className="-m-2 flex size-11 items-center justify-center rounded-full text-muted hover:text-ink" aria-label="Позже">
          <X className="size-5" />
        </button>
      </div>
      {asking ? (
        <div className="mt-3 flex items-center gap-2">
          <input value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, "").slice(0, 3))} inputMode="numeric" placeholder="Минут" aria-label="Сколько минут говорили" className="input h-11 w-28 text-center" autoFocus />
          <button type="button" className="btn btn-primary flex-1" disabled={busy} onClick={() => save("answered")}>
            {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />} Сохранить
          </button>
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-3 gap-2">
          <button type="button" className="btn btn-primary flex-col !h-auto gap-1 py-2.5 text-[13px]" disabled={busy} onClick={() => setAsking(true)}>
            <Check className="size-5" /> Дозвонился
          </button>
          <button type="button" className="btn btn-outline flex-col !h-auto gap-1 py-2.5 text-[13px]" disabled={busy} onClick={() => save("missed")}>
            <PhoneMissed className="size-5" /> Не ответил
          </button>
          <button type="button" className="btn btn-outline flex-col !h-auto gap-1 py-2.5 text-[13px]" disabled={busy} onClick={() => save("failed")}>
            <PhoneOff className="size-5" /> Не вышло
          </button>
        </div>
      )}
    </div>
  );
}
