"use client";

import { ask } from "@/components/ui/overlays";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { cancelGiftAction, resendGiftAction } from "./actions";

export function GiftActions({ id, status, canResend }: { id: string; status: string; canResend: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const btn = "rounded-lg border border-line px-2.5 py-1 text-xs hover:bg-cream disabled:opacity-50 max-lg:min-h-11 max-lg:flex-1 max-lg:px-3 max-lg:text-sm";
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
    <div className="flex flex-wrap justify-end gap-1.5">
      {pending ? <LoaderCircle className="size-4 animate-spin text-muted" /> : null}
      {status === "pending_payment" ? (
        <>
          <input ref={file} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => void confirmPaid(e.target.files?.[0])} />
          <button className={btn} disabled={pending} title="Приложите чек перевода" onClick={() => file.current?.click()}>
            Оплачен — приложить чек
          </button>
        </>
      ) : null}
      {status === "paid" && canResend ? (
        <button className={btn} disabled={pending} onClick={() => start(() => resendGiftAction(id))}>
          Отправить получателю
        </button>
      ) : null}
      {status !== "cancelled" ? (
        <button className={`${btn} text-red-700`} disabled={pending} onClick={async () => (await ask("Отменить сертификат? Код перестанет действовать.", true)) && start(() => cancelGiftAction(id))}>
          Отменить
        </button>
      ) : null}
      {error ? <p className="w-full text-right text-xs text-red-700" role="alert">{error}</p> : null}
    </div>
  );
}
