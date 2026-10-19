"use client";

import { useState, useTransition } from "react";
import { LoaderCircle, RefreshCw, Smartphone } from "lucide-react";
import { CopyField } from "../ui";
import { cn } from "@/lib/class-names";
import { confirmKaspiCodeAction, disconnectKaspiAction, kaspiStatusAction, requestKaspiCodeAction, saveKaspiAlertAfterAction, saveKaspiApiUrlAction, setKaspiEnabledAction } from "./actions";

interface KaspiStatusView {
  enabled: boolean;
  /** Сервис kaspi-pos отвечает по указанному адресу. */
  reachable: boolean;
  connected: boolean;
  /** Сессия кассира общая с другим проектом и задана на сервере: вход по SMS здесь вытеснил бы её там. */
  shared: boolean;
  /** Kaspi принимает сессию кассира прямо сейчас. */
  active: boolean;
  orgName: string;
  phone: string;
  apiUrl: string;
}

interface KaspiFormProps extends KaspiStatusView {
  webhookUrl: string;
  /** Секрет для webhooks.json сервиса; null — задан переменной окружения KASPI_WEBHOOK_SECRET. */
  webhookSecret: string | null;
  /** Сигнал «кассир Kaspi отключён»: через сколько минут подряд без кассира сообщать руководителям. */
  alertAfterMinutes: number;
}

const badge = (s: KaspiStatusView) =>
  !s.reachable ? { text: "сервис недоступен", tone: "bg-red-50 text-red-800" } : s.active ? { text: "подключено", tone: "bg-emerald-100 text-emerald-800" } : s.connected ? { text: "сессия не принимается", tone: "bg-amber-100 text-amber-900" } : { text: "не подключено", tone: "bg-cream text-muted" };

/**
 * Kaspi Pay в «Интеграциях»: адрес сервиса kaspi-pos-automation, вход кассира по SMS-коду, включение оплаты и
 * необязательный вебхук. Пока кассир подключён и оплата включена, клиенты платят счётом в Kaspi или по QR, и заказ
 * подтверждается сам.
 */
export function KaspiForm(props: KaspiFormProps) {
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<KaspiStatusView>(props);
  const [apiUrl, setApiUrl] = useState(props.apiUrl);
  const [phone, setPhone] = useState("");
  const [processId, setProcessId] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [alertAfter, setAlertAfter] = useState(String(props.alertAfterMinutes));
  const [alertSaved, setAlertSaved] = useState(String(props.alertAfterMinutes));
  const [alertMessage, setAlertMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const run = (work: () => Promise<{ ok: true } | { ok: false; error: string }>, done?: string) =>
    start(async () => {
      const r = await work();
      setMessage(r.ok ? (done ? { ok: true, text: done } : null) : { ok: false, text: r.error });
      setStatus(await kaspiStatusAction());
    });

  const saveUrl = () =>
    start(async () => {
      const r = await saveKaspiApiUrlAction(apiUrl);
      if (!r.ok) return setMessage({ ok: false, text: r.error });
      setMessage(r.reachable ? { ok: true, text: "Сервис kaspi-pos отвечает" } : { ok: false, text: "Адрес сохранён, но сервис по нему не отвечает — проверьте, что kaspi-pos запущен" });
      setStatus(await kaspiStatusAction());
    });

  const b = badge(status);
  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <div className="mb-4 flex items-center gap-3">
        <h2 className="font-semibold">Kaspi Pay — оплата заказов</h2>
        <span className={cn("rounded-full px-2.5 py-0.5 text-xs", b.tone)}>{b.text}</span>
      </div>
      <p className="text-sm text-muted">
        Клиент получает счёт в приложение Kaspi по номеру телефона или платит по QR, заказ и сертификат подтверждаются сами — менять статус вручную не нужно. Работает через сервис kaspi-pos-automation на вашем сервере и аккаунт кассира Kaspi Pay.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <label className="block min-w-0 flex-1">
          <span className="mb-1 block text-xs text-muted">Адрес сервиса kaspi-pos</span>
          <input className="input h-10 text-sm" value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} placeholder="http://127.0.0.1:3010" />
        </label>
        <button className="btn btn-outline btn-sm h-10" disabled={pending || !apiUrl.trim()} onClick={saveUrl}>
          {pending ? <LoaderCircle className="size-4 animate-spin" /> : null} Сохранить
        </button>
        <button className="btn btn-ghost btn-sm h-10" disabled={pending} onClick={() => start(async () => setStatus(await kaspiStatusAction()))} aria-label="Проверить связь">
          <RefreshCw className="size-4" />
        </button>
      </div>

      {status.connected ? (
        <div className="mt-4 space-y-3 border-t border-line pt-4">
          <div className="text-sm">
            Кассир: <b>{status.orgName || "организация Kaspi Pay"}</b>
            {status.phone ? <span className="text-muted"> · {status.phone}</span> : null}
          </div>
          {status.reachable && !status.active ? (
            <p className="text-sm text-amber-800">
              {status.shared
                ? "Kaspi не принимает общую сессию кассира. Войдите заново в том проекте, где её получали, и обновите KASPI_TOKEN_SN, KASPI_VTOKEN_SECRET и KASPI_PROFILE_ID на сервере — до этого клиентам показывается перевод по номеру."
                : "Kaspi не принимает сессию кассира (вход с другого устройства или истёк срок). Подключите кассира заново — до этого клиентам показывается перевод по номеру."}
            </p>
          ) : null}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="accent-wine" checked={status.enabled} disabled={pending} onChange={(e) => run(() => setKaspiEnabledAction(e.target.checked))} />
            Принимать оплату через Kaspi
          </label>
          <div className="flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="mb-1 block text-xs text-muted">Сообщать руководителям, если кассир не работает дольше, мин</span>
              <input className="input h-10 w-24 text-sm" type="number" inputMode="numeric" min={0} max={240} step={1} value={alertAfter} onChange={(e) => setAlertAfter(e.target.value)} aria-label="Порог тревоги, минут" />
            </label>
            <button
              className="btn btn-outline btn-sm h-10"
              disabled={pending || !alertAfter.trim() || alertAfter.trim() === alertSaved}
              onClick={() =>
                start(async () => {
                  const r = await saveKaspiAlertAfterAction(Number(alertAfter));
                  if (r.ok) setAlertSaved(alertAfter.trim());
                  setAlertMessage(r.ok ? { ok: true, text: "Порог сохранён" } : { ok: false, text: r.error });
                })
              }
            >
              Сохранить
            </button>
          </div>
          <p className="text-[11px] text-muted">
            Сайт проверяет кассира раз в 3 минуты. Уведомление в CRM и push приходит один раз, когда кассир отключился, и один раз, когда снова подключён; пока он отключён, менеджеры видят плашку в окне счёта и над полем ввода чата. 0 — сообщать сразу.
          </p>
          {alertMessage ? <p className={cn("text-xs", alertMessage.ok ? "text-emerald-700" : "text-red-700")}>{alertMessage.text}</p> : null}
        </div>
      ) : null}

      {status.shared ? (
        <p className="mt-4 border-t border-line pt-4 text-xs text-muted" data-testid="kaspi-shared">
          Сессия кассира общая с другим проектом на этом сервере и задана переменными окружения (KASPI_TOKEN_SN и др.). Вход по SMS здесь отключён: Kaspi держит одну сессию на кассира, и новый вход вытеснил бы её у другого проекта.
        </p>
      ) : (
      <div className="mt-4 space-y-3 border-t border-line pt-4">
        <div className="text-sm font-medium">{status.connected ? "Подключить кассира заново" : "Подключить кассира"}</div>
        {processId ? (
          <div className="flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="mb-1 block text-xs text-muted">Код из SMS</span>
              <input className="input h-10 w-32 text-sm" inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={(e) => setOtp(e.target.value)} />
            </label>
            <button
              className="btn btn-primary btn-sm h-10"
              disabled={pending || !otp.trim()}
              onClick={() =>
                run(async () => {
                  const r = await confirmKaspiCodeAction(processId, otp);
                  if (r.ok) setProcessId(null);
                  return r;
                }, "Кассир подключён, оплата через Kaspi включена")
              }
            >
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
            <button
              className="btn btn-outline btn-sm h-10"
              disabled={pending || !phone.trim() || !status.reachable}
              onClick={() =>
                run(async () => {
                  const r = await requestKaspiCodeAction(phone);
                  if (r.ok) setProcessId(r.processId);
                  return r;
                }, "Код отправлен по SMS")
              }
            >
              {pending ? <LoaderCircle className="size-4 animate-spin" /> : <Smartphone className="size-4" />} Получить код
            </button>
          </div>
        )}
        {message ? <p className={cn("text-xs", message.ok ? "text-emerald-700" : "text-red-700")}>{message.text}</p> : null}
      </div>
      )}

      <details className="mt-4 border-t border-line pt-4">
        <summary className="cursor-pointer text-sm font-medium">Вебхук kaspi-pos — необязательно</summary>
        <div className="mt-3 space-y-3">
          <p className="text-xs text-muted">
            Оплата подтверждается и без вебхука: сайт сам сверяет счёт с Kaspi каждые несколько секунд. Вебхук лишь ускоряет подтверждение. В docker compose он уже настроен; иначе укажите в webhooks.json сервиса адрес ниже, events — payment.success, payment.failed, payment.expired, payment.lost. С секретом уведомление применяется сразу, без секрета — сайт перепроверяет его в Kaspi.
          </p>
          <CopyField label="Адрес" value={props.webhookUrl} />
          {props.webhookSecret ? <CopyField label="Секрет подписи" value={props.webhookSecret} /> : <p className="text-xs text-muted">Секрет задан переменной окружения KASPI_WEBHOOK_SECRET.</p>}
        </div>
      </details>

      {status.connected ? (
        <button className="mt-4 text-sm text-muted underline underline-offset-4 hover:text-red-700" disabled={pending} onClick={() => run(disconnectKaspiAction, "Кассир отключён")}>
          Отключить кассира
        </button>
      ) : null}
    </section>
  );
}
