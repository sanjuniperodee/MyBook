"use client";

import { ask } from "@/components/ui/overlays";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Receipt, Send, Upload } from "lucide-react";
import { cancelGiftAction, resendGiftAction } from "./actions";

/**
 * Действия с сертификатом: подтвердить оплату чеком, отправить получателю ещё раз, отменить; ссылка на чек, если он есть.
 * Отказ сервера — под кнопками.
 */
export function GiftActions({ id, status, canResend, receipt = null }: { id: string; status: string; canResend: boolean; receipt?: string | null }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const btn = "btn btn-outline btn-sm max-lg:flex-1";
  // Оплату переводом подтверждают только с чеком (analytics-d8): выбрали файл — спрашиваем и выпускаем код.
  const confirmPaid = async (picked: File | undefined) => {
    if (file.current) file.current.value = "";
    if (!picked || !(await ask(`Подтвердить оплату по чеку «${picked.name}» и выпустить код?`))) return;
    start(async () => {
      setError(null);
      const body = new FormData();
      body.set("file", picked);
      const res = await fetch(`/api/admin/gifts/${id}/receipt`, { method: "POST", body });
      const out = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok) setError(out.message ?? out.error ?? "Не удалось подтвердить оплату");
      router.refresh();
    });
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5 lg:justify-end">
      {pending ? <LoaderCircle className="size-4 animate-spin text-muted" aria-label="Выполняем" /> : null}
      {receipt ? (
        <a href={receipt} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">
          <Receipt className="size-4" aria-hidden /> Чек
        </a>
      ) : null}
      {status === "pending_payment" ? (
        <>
          <input ref={file} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => void confirmPaid(e.target.files?.[0])} />
          <button className="btn btn-dark btn-sm max-lg:flex-1" disabled={pending} title="Приложите чек перевода" onClick={() => file.current?.click()}>
            <Upload className="size-4" aria-hidden /> Оплачен, приложить чек
          </button>
        </>
      ) : null}
      {status === "paid" && canResend ? (
        <button className={btn} disabled={pending} onClick={() => start(() => resendGiftAction(id))}>
          <Send className="size-4" aria-hidden /> Отправить получателю
        </button>
      ) : null}
      {status !== "cancelled" ? (
        <button className="btn btn-ghost btn-sm text-danger hover:bg-danger-bg hover:text-danger" disabled={pending} onClick={async () => (await ask("Отменить сертификат? Код перестанет действовать.", true)) && start(() => cancelGiftAction(id))}>
          Отменить
        </button>
      ) : null}
      {error ? (
        <p className="w-full text-xs font-medium text-danger lg:text-right" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
