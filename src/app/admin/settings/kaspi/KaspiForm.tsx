"use client";

import { useState, useTransition } from "react";
import { LoaderCircle, RefreshCw, Smartphone } from "lucide-react";
import { Facts } from "@/components/ui/Facts";
import { CheckMessage, CopyField, Field, Group, Help, Note, Section, Toggle, type SheetStatus } from "../ui";
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

const statusOf = (s: KaspiStatusView): SheetStatus =>
  !s.reachable
    ? { tone: "bad", label: "сервис недоступен" }
    : s.active
      ? s.enabled
        ? { tone: "ok", label: "подключено" }
        : { tone: "warn", label: "кассир подключён, оплата выключена" }
      : s.connected
        ? { tone: "warn", label: "сессия не принимается" }
        : { tone: "off", label: "не подключено" };

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

  const check = () =>
    start(async () => {
      const s = await kaspiStatusAction();
      setStatus(s);
      setMessage(s.reachable ? (s.active ? { ok: true, text: "Сервис отвечает, кассир подключён" } : { ok: false, text: s.connected ? "Сервис отвечает, но Kaspi не принимает сессию кассира" : "Сервис отвечает, кассир не подключён" }) : { ok: false, text: "Сервис kaspi-pos не отвечает по указанному адресу" });
    });

  return (
    <Section
      id="kaspi"
      title="Kaspi Pay: оплата заказов"
      description="Клиент платит счётом в приложении Kaspi или по QR, заказ и сертификат подтверждаются сами"
      status={statusOf(status)}
      actions={
        <button type="button" className="btn btn-outline btn-sm" disabled={pending} onClick={check}>
          {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" strokeWidth={1.8} aria-hidden />} Проверить
        </button>
      }
    >
      <CheckMessage check={message ? { ok: message.ok, message: message.text } : null} />

      <div className="space-y-5">
        <Group title="Сервис" hint="Работает через kaspi-pos-automation на вашем сервере и аккаунт кассира Kaspi Pay.">
          <Field
            label="Адрес сервиса kaspi-pos"
            after={
              <button type="button" className="btn btn-outline" disabled={pending || !apiUrl.trim()} onClick={saveUrl}>
                Сохранить адрес
              </button>
            }
          >
            <input className="input" value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} placeholder="http://127.0.0.1:3010" />
          </Field>
        </Group>

        {status.connected ? (
          <Group title="Кассир" hint="Сайт проверяет кассира раз в 3 минуты.">
            <Facts
              items={[
                { label: "Организация", value: <b className="font-semibold">{status.orgName || "организация Kaspi Pay"}</b> },
                { label: "Телефон", value: status.phone || "—", hidden: !status.phone },
              ]}
            />
            {status.reachable && !status.active ? (
              <p className="rounded-[var(--r-ctl)] bg-warning-bg px-3 py-2 text-sm text-warning">
                {status.shared
                  ? "Kaspi не принимает общую сессию кассира. Войдите заново в том проекте, где её получали, и обновите KASPI_TOKEN_SN, KASPI_VTOKEN_SECRET и KASPI_PROFILE_ID на сервере — до этого клиентам показывается перевод по номеру."
                  : "Kaspi не принимает сессию кассира (вход с другого устройства или истёк срок). Подключите кассира заново — до этого клиентам показывается перевод по номеру."}
              </p>
            ) : null}
            <Toggle label="Принимать оплату через Kaspi" checked={status.enabled} disabled={pending} onChange={(on) => run(() => setKaspiEnabledAction(on))} />
            <Field
              label="Сообщать руководителям, если кассир не работает дольше, мин"
              hint="Уведомление в CRM и push приходит один раз, когда кассир отключился, и один раз, когда снова подключён; пока он отключён, менеджеры видят плашку в окне счёта и над полем ввода чата. 0 — сообщать сразу."
              after={
                <button
                  type="button"
                  className="btn btn-outline"
                  disabled={pending || !alertAfter.trim() || alertAfter.trim() === alertSaved}
                  onClick={() =>
                    start(async () => {
                      const r = await saveKaspiAlertAfterAction(Number(alertAfter));
                      if (r.ok) setAlertSaved(alertAfter.trim());
                      setAlertMessage(r.ok ? { ok: true, text: "Порог сохранён" } : { ok: false, text: r.error });
                    })
                  }
                >
                  Сохранить порог
                </button>
              }
            >
              <input className="input w-28" type="number" inputMode="numeric" min={0} max={240} step={1} value={alertAfter} onChange={(e) => setAlertAfter(e.target.value)} />
            </Field>
            {alertMessage ? <CheckMessage check={{ ok: alertMessage.ok, message: alertMessage.text }} /> : null}
          </Group>
        ) : null}

        {status.shared ? (
          <Note className="border-t border-line pt-5">
            <span data-testid="kaspi-shared">Сессия кассира общая с другим проектом на этом сервере и задана переменными окружения (KASPI_TOKEN_SN и др.). Вход по SMS здесь отключён: Kaspi держит одну сессию на кассира, и новый вход вытеснил бы её у другого проекта.</span>
          </Note>
        ) : (
          <Group title={status.connected ? "Подключить кассира заново" : "Подключить кассира"} hint="Kaspi пришлёт SMS-код на номер кассира: введите его здесь, и оплата включится.">
            {processId ? (
              <div className="flex flex-wrap items-end gap-2">
                <Field label="Код из SMS" className="w-40">
                  <input className="input" inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={(e) => setOtp(e.target.value)} />
                </Field>
                <button
                  className="btn btn-dark"
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
                <button className="btn btn-ghost" disabled={pending} onClick={() => setProcessId(null)}>
                  Другой номер
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-end gap-2">
                <Field label="Номер кассира Kaspi Pay" className="w-60">
                  <input className="input" inputMode="tel" placeholder="+7 7XX XXX XX XX" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </Field>
                <button
                  className="btn btn-dark"
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
          </Group>
        )}

        <Help title="Вебхук kaspi-pos (необязательно)">
          <p>
            Оплата подтверждается и без вебхука: сайт сам сверяет счёт с Kaspi каждые несколько секунд. Вебхук лишь ускоряет подтверждение. В docker compose он уже настроен; иначе укажите в webhooks.json сервиса адрес ниже, events: payment.success, payment.failed, payment.expired,
            payment.lost. С секретом уведомление применяется сразу, без секрета сайт перепроверяет его в Kaspi.
          </p>
          <CopyField label="Адрес" value={props.webhookUrl} />
          {props.webhookSecret ? <CopyField label="Секрет подписи" value={props.webhookSecret} /> : <p className="text-xs text-muted">Секрет задан переменной окружения KASPI_WEBHOOK_SECRET.</p>}
        </Help>

        {status.connected ? (
          <div className="border-t border-line pt-4">
            <button className="btn btn-ghost btn-sm text-danger hover:bg-danger-bg hover:text-danger" disabled={pending} onClick={() => run(disconnectKaspiAction, "Кассир отключён")}>
              Отключить кассира
            </button>
          </div>
        ) : null}
      </div>
    </Section>
  );
}
