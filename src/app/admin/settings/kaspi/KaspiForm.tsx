"use client";

import { useState, useTransition } from "react";
import { Copy, LoaderCircle, Smartphone } from "lucide-react";
import { toast } from "@/components/ui/overlays";
import { cn } from "@/lib/utils";
import { confirmKaspiCodeAction, disconnectKaspiAction, requestKaspiCodeAction, setKaspiEnabledAction } from "./actions";

export interface KaspiFormProps {
  enabled: boolean;
  connected: boolean;
  /** Kaspi принимает сессию кассира прямо сейчас. */
  active: boolean;
  orgName: string;
  phone: string;
  apiUrl: string;
  webhookUrl: string;
  /** Секрет для webhooks.json сервиса; null — задан переменной окружения KASPI_WEBHOOK_SECRET. */
  webhookSecret: string | null;
}

function Copyable({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-1 text-xs text-muted">{label}</div>
      <div className="flex gap-2">
        <input readOnly value={value} className="input h-9 min-w-0 flex-1 font-mono text-xs" onFocus={(e) => e.target.select()} />
        <button type="button" className="btn btn-outline btn-sm h-9" onClick={() => navigator.clipboard.writeText(value).then(() => toast("Скопировано"))} aria-label="Скопировать">
          <Copy className="size-4" />
        </button>
      </div>
    </div>
  );
}

/**
 * Kaspi Pay в «Интеграциях»: вход кассира по SMS-коду, включение оплаты, адрес и секрет вебхука для kaspi-pos-automation.
 * Пока кассир подключён и оплата включена, клиенты платят счётом в Kaspi или по QR, и заказ подтверждается сам.
 */
export function KaspiForm(props: KaspiFormProps) {
  const [pending, start] = useTransition();
  const [phone, setPhone] = useState("");
  const [processId, setProcessId] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const run = (work: () => Promise<{ ok: true } | { ok: false; error: string }>, done?: string) =>
    start(async () => {
      const r = await work();
      setMessage(r.ok ? (done ? { ok: true, text: done } : null) : { ok: false, text: r.error });
    });

  const badge = props.active ? "подключено" : props.connected ? "сессия не принимается" : "не подключено";
  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <div className="mb-4 flex items-center gap-3">
        <h2 className="font-semibold">Kaspi Pay — оплата заказов</h2>
        <span className={cn("rounded-full px-2.5 py-0.5 text-xs", props.active ? "bg-emerald-100 text-emerald-800" : props.connected ? "bg-amber-100 text-amber-900" : "bg-cream text-muted")}>{badge}</span>
      </div>
      <p className="text-sm text-muted">
        Клиент получает счёт в приложение Kaspi по номеру телефона или платит по QR, заказ и сертификат подтверждаются сами — менять статус вручную не нужно. Работает через сервис kaspi-pos-automation ({props.apiUrl}) и аккаунт кассира Kaspi Pay.
      </p>

      {props.connected ? (
        <div className="mt-4 space-y-3">
          <div className="text-sm">
            Кассир: <b>{props.orgName || "организация Kaspi Pay"}</b>
            {props.phone ? <span className="text-muted"> · {props.phone}</span> : null}
          </div>
          {!props.active ? <p className="text-sm text-amber-800">Kaspi не принимает сессию кассира (вход с другого устройства или истёк срок). Подключите кассира заново — до этого клиентам показывается перевод по номеру.</p> : null}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="accent-wine" checked={props.enabled} disabled={pending} onChange={(e) => run(() => setKaspiEnabledAction(e.target.checked))} />
            Принимать оплату через Kaspi
          </label>
        </div>
      ) : null}

      <div className="mt-4 space-y-3 border-t border-line pt-4">
        <div className="text-sm font-medium">{props.connected ? "Подключить кассира заново" : "Подключить кассира"}</div>
        {processId ? (
          <div className="flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="mb-1 block text-xs text-muted">Код из SMS</span>
              <input className="input h-10 w-32 text-sm" inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={(e) => setOtp(e.target.value)} />
            </label>
            <button className="btn btn-primary btn-sm h-10" disabled={pending || !otp.trim()} onClick={() => run(async () => {
              const r = await confirmKaspiCodeAction(processId, otp);
              if (r.ok) setProcessId(null);
              return r;
            }, "Кассир подключён, оплата через Kaspi включена")}>
              {pending ? <LoaderCircle className="size-4 animate-spin" /> : null} Подтвердить
            </button>
            <button className="btn btn-ghost btn-sm h-10" disabled={pending} onClick={() => setProcessId(null)}>
              Другой номер
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="mb-1 block text-xs text-muted">Номер кассира Kaspi Pay</span>
              <input className="input h-10 w-56 text-sm" inputMode="tel" placeholder="+7 7XX XXX XX XX" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </label>
            <button className="btn btn-outline btn-sm h-10" disabled={pending || !phone.trim()} onClick={() => run(async () => {
              const r = await requestKaspiCodeAction(phone);
              if (r.ok) setProcessId(r.processId);
              return r;
            }, "Код отправлен по SMS")}>
              {pending ? <LoaderCircle className="size-4 animate-spin" /> : <Smartphone className="size-4" />} Получить код
            </button>
          </div>
        )}
        {message ? <p className={cn("text-xs", message.ok ? "text-emerald-700" : "text-red-700")}>{message.text}</p> : null}
      </div>

      <div className="mt-4 space-y-3 border-t border-line pt-4">
        <div className="text-sm font-medium">Вебхук для kaspi-pos-automation</div>
        <p className="text-xs text-muted">Укажите в webhooks.json сервиса: url — адрес ниже, events — payment.success, payment.failed, payment.expired, payment.lost, secret — секрет ниже. Без вебхука оплата всё равно подтвердится сверкой статуса за несколько секунд.</p>
        <Copyable label="Адрес" value={props.webhookUrl} />
        {props.webhookSecret ? <Copyable label="Секрет подписи" value={props.webhookSecret} /> : <p className="text-xs text-muted">Секрет задан переменной окружения KASPI_WEBHOOK_SECRET.</p>}
      </div>

      {props.connected ? (
        <button className="mt-4 text-sm text-muted underline underline-offset-4 hover:text-red-700" disabled={pending} onClick={() => run(disconnectKaspiAction, "Кассир отключён")}>
          Отключить кассира
        </button>
      ) : null}
    </section>
  );
}
