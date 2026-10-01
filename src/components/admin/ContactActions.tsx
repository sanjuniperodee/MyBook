"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { LoaderCircle, Mail, MessageCircle, PhoneOutgoing } from "lucide-react";
import { toast, toastError } from "@/components/ui/overlays";
import { callAction, openChatAction, sendEmailAction } from "@/app/admin/crm-actions";
import { cn } from "@/lib/utils";

type Target = { clientId?: string; dealId?: string; orderId?: string; callId?: string };

/** «Позвонить» через АТС и «Написать» в WhatsApp из CRM. Номер не нужен в браузере — сервер найдёт его сам. */
export function ContactActions({ target, canCall, canChat, canEmail = false, className }: { target: Target; canCall: boolean; canChat: boolean; canEmail?: boolean; className?: string }) {
  const [calling, startCall] = useTransition();
  const [opening, startChat] = useTransition();
  const [mailing, startMail] = useTransition();
  const [mail, setMail] = useState<{ subject: string; text: string } | null>(null);
  const router = useRouter();
  if (!canCall && !canChat && !canEmail) return null;
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {canCall ? (
        <button
          type="button"
          className="btn btn-outline btn-sm flex-1"
          disabled={calling}
          onClick={() =>
            startCall(async () => {
              const r = await callAction(target);
              toast(r.message ?? "Звоним", r.ok ? "success" : "error");
            })
          }
        >
          {calling ? <LoaderCircle className="size-4 animate-spin" /> : <PhoneOutgoing className="size-4" />} Позвонить
        </button>
      ) : null}
      {canChat ? (
        <button
          type="button"
          className="btn btn-outline btn-sm flex-1"
          disabled={opening}
          onClick={() =>
            startChat(async () => {
              const r = await openChatAction(target);
              if (r.ok && r.id) router.push(`/admin/chats?c=${r.id}`);
              else toast(r.ok ? "Готово" : r.message, r.ok ? "success" : "error");
            })
          }
        >
          {opening ? <LoaderCircle className="size-4 animate-spin" /> : <MessageCircle className="size-4" />} Написать
        </button>
      ) : null}
      {canEmail ? (
        <button type="button" className="btn btn-outline btn-sm flex-1" onClick={() => setMail((m) => (m ? null : { subject: "", text: "" }))} aria-expanded={!!mail}>
          <Mail className="size-4" /> Письмо
        </button>
      ) : null}
      {mail ? (
        <div className="w-full space-y-2 rounded-xl border border-line bg-[#fbf9f5] p-3" data-testid="email-form">
          <input className="input h-9 text-sm" placeholder="Тема письма" value={mail.subject} maxLength={200} onChange={(e) => setMail({ ...mail, subject: e.target.value })} aria-label="Тема письма" />
          <textarea className="input min-h-28 py-2 text-sm" placeholder="Текст письма" value={mail.text} maxLength={20000} onChange={(e) => setMail({ ...mail, text: e.target.value })} aria-label="Текст письма" />
          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-sm"
              disabled={mailing || !mail.text.trim()}
              onClick={() =>
                startMail(async () => {
                  try {
                    const r = await sendEmailAction(target, mail.subject, mail.text);
                    toast(r.ok ? (r.message ?? "Отправлено") : r.message, r.ok ? "success" : "error");
                    if (r.ok) {
                      setMail(null);
                      router.refresh();
                    }
                  } catch (err) {
                    toastError(err);
                  }
                })
              }
            >
              {mailing ? <LoaderCircle className="size-4 animate-spin" /> : <Mail className="size-4" />} Отправить
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMail(null)}>
              Отмена
            </button>
          </div>
          <p className="text-[11px] text-muted">Ответ клиента придёт в «Чаты», если подключён входящий ящик.</p>
        </div>
      ) : null}
    </div>
  );
}

export function ManagerSelect({ value, options, disabled, onChange }: { value: string | null; options: { id: string; label: string }[]; disabled?: boolean; onChange: (v: string | null) => Promise<unknown> }) {
  const [pending, start] = useTransition();
  return (
    <select
      className="input h-9 text-sm"
      value={value ?? ""}
      disabled={disabled || pending}
      aria-label="Ответственный"
      onChange={(e) =>
        start(async () => {
          const r = (await onChange(e.target.value || null)) as { ok?: boolean; message?: string } | undefined;
          if (r && r.ok === false) toast(r.message ?? "Не удалось", "error");
        })
      }
    >
      <option value="">Не назначен</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
