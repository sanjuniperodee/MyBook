"use client";

import { useState, useTransition } from "react";
import { Check, Copy, RefreshCw, Send } from "lucide-react";
import { Field } from "@/components/ui/Field";
import { isClosedStatus, SUPPORT_STATUS_LABELS, SUPPORT_STATUSES, type SupportStatus } from "@/shared/domain/support";
import { RESOLUTION_SLOT } from "../labels";
import { notifyTicketAction, reprocessTicketAction, updateTicketAction } from "../actions";

interface Props {
  id: string;
  number: number;
  status: SupportStatus;
  resolution: string;
  devNote: string;
  notifyPhone: string;
  canEdit: boolean;
  /** Текст уведомления по статусам с RESOLUTION_SLOT вместо «что сделали». */
  notifyPreview: Record<SupportStatus, string>;
}

/** Статус, «что сделали» (уходит в уведомлении), заметка разработчика, уведомление вручную и повтор расшифровки. */
export function TicketControls(props: Props) {
  const [status, setStatus] = useState(props.status);
  const [resolution, setResolution] = useState(props.resolution);
  const [devNote, setDevNote] = useState(props.devNote);
  // null — как по умолчанию: при закрытии пишем, иначе нет; отметку можно снять (отклоняем мусор — не пишем).
  const [notify, setNotify] = useState<boolean | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const closing = status !== props.status && isClosedStatus(status);
  const willNotify = notify ?? closing;

  const report = (r: { ok: true; notified: boolean | null } | { ok: false; error: string }, done: string) =>
    setMessage(r.ok ? { ok: r.notified !== false, text: r.notified === false ? `${done}, но уведомление не ушло — проверьте WhatsApp в «Интеграциях»` : r.notified ? `${done}, уведомление отправлено` : done } : { ok: false, text: r.error });

  const save = () =>
    start(async () => {
      setMessage(null);
      report(await updateTicketAction(props.number, { id: props.id, status, resolution, devNote, notify: willNotify }), "Сохранено");
      setNotify(null);
    });

  if (!props.canEdit) return <p className="text-sm text-muted">Менять обращения могут сотрудники с правом «Настройки CRM».</p>;

  // Текст уведомления строится как на сервере: подставляем «что сделали» в шаблон выбранного статуса.
  const preview = props.notifyPreview[status].replace(`\n\n${RESOLUTION_SLOT}`, resolution.trim() ? `\n\n${resolution.trim()}` : "");

  return (
    <div className="space-y-4">
      <Field label="Статус">
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value as SupportStatus)} disabled={pending}>
          {SUPPORT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {SUPPORT_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Что сделали" optional hint="Уйдёт человеку в WhatsApp. Просто, без технических слов: «Исправили: текст главы больше не стирается на телефоне».">
        <textarea className="input min-h-24" value={resolution} onChange={(e) => setResolution(e.target.value)} maxLength={4000} disabled={pending} />
      </Field>
      <Field label="Заметка разработчика" optional hint="Только для CRM: причина, что проверить, ссылки">
        <textarea className="input min-h-20" value={devNote} onChange={(e) => setDevNote(e.target.value)} maxLength={10000} disabled={pending} />
      </Field>
      {props.notifyPhone ? (
        <label className="flex min-h-11 items-start gap-3 text-sm text-ink-soft">
          <input type="checkbox" className="mt-0.5 size-4 accent-wine" checked={willNotify} disabled={pending} onChange={(e) => setNotify(e.target.checked)} />
          <span>
            Написать в WhatsApp на +{props.notifyPhone}
            {closing && willNotify ? " — человек узнает, что обращение закрыто" : ""}
          </span>
        </label>
      ) : null}
      {willNotify && props.notifyPhone ? <pre className="rounded-[10px] bg-sunken px-3 py-2.5 font-sans text-sm whitespace-pre-wrap text-ink-soft">{preview}</pre> : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" onClick={save} disabled={pending}>
          <Check className="size-4" aria-hidden /> Сохранить
        </button>
        {props.notifyPhone ? (
          <button
            type="button"
            className="btn btn-outline"
            disabled={pending || status !== props.status || resolution !== props.resolution}
            title={status !== props.status || resolution !== props.resolution ? "Сначала сохраните изменения" : undefined}
            onClick={() => start(async () => report(await notifyTicketAction(props.number, props.id), "Готово"))}
          >
            <Send className="size-4" aria-hidden /> Написать сейчас
          </button>
        ) : null}
        <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => start(async () => report(await reprocessTicketAction(props.number, props.id), "Голосовые расшифрованы заново"))}>
          <RefreshCw className="size-4" aria-hidden /> Расшифровать заново
        </button>
      </div>
      {pending ? <p className="text-sm text-muted">Работаем… расшифровка может занять минуту.</p> : null}
      {message ? (
        <p className={message.ok ? "text-sm text-success" : "field-error text-sm"} role="status">
          {message.text}
        </p>
      ) : null}
    </div>
  );
}

/** Кнопка «скопировать»: номер обращения для чата с Claude. */
export function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-outline"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />} {copied ? "Скопировано" : label}
    </button>
  );
}
