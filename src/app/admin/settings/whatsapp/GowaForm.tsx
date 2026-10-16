"use client";

import { useEffect, useState, useTransition } from "react";
import { LoaderCircle, QrCode, RefreshCw } from "lucide-react";
import { cn } from "@/lib/class-names";
import type { GowaStatus } from "@/modules/messaging";
import { gowaImportHistoryAction, gowaLogoutAction, gowaPairCodeAction, gowaQrAction, gowaStatusAction, saveWhatsappSettingsAction } from "./actions";

interface GowaFormProps {
  provider: "wazzup" | "gowa";
  baseUrl: string;
  /** «••••abcd», если логин:пароль шлюза сохранён. */
  authSaved: string;
  status: GowaStatus;
  /** Свой адрес для событий шлюза; пусто — адрес по умолчанию (callbackDefault). */
  callbackUrl: string;
  callbackDefault: string;
}

const statusLabel = (s: GowaStatus) =>
  !s.reachable ? "шлюз недоступен" : s.problem ? "ошибка подключения" : s.loggedIn ? `номер привязан${s.phone ? ` · +${s.phone}` : ""}` : s.registered ? "номер не привязан" : "не подключён";

/**
 * WhatsApp через свой шлюз GOWA (go-whatsapp-web-multidevice) вместо Wazzup: номер магазина привязывается по QR,
 * переписка идёт в единый инбокс в реальном времени, менеджеры отвечают из CRM. Всё настраивается здесь: сайт сам
 * заводит в шлюзе устройство магазина и направляет его события на себя.
 */
export function GowaForm(props: GowaFormProps) {
  const [pending, start] = useTransition();
  const [provider, setProvider] = useState(props.provider);
  const [baseUrl, setBaseUrl] = useState(props.baseUrl);
  const [auth, setAuth] = useState("");
  const [callbackUrl, setCallbackUrl] = useState(props.callbackUrl);
  const [status, setStatus] = useState(props.status);
  const [qr, setQr] = useState<{ image: string; until: number } | null>(null);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // Пока показан QR — следим, не привязали ли номер, и обновляем картинку, когда она истекает.
  useEffect(() => {
    if (!qr) return;
    const timer = setInterval(async () => {
      const s = await gowaStatusAction();
      setStatus(s);
      if (s.loggedIn) {
        setQr(null);
        setMessage({ ok: true, text: "Номер привязан — переписка WhatsApp идёт в CRM" });
        return;
      }
      if (Date.now() > qr.until) {
        const r = await gowaQrAction();
        if (r.ok) setQr({ image: r.image, until: Date.now() + r.seconds * 1000 });
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [qr]);

  const save = () =>
    start(async () => {
      const r = await saveWhatsappSettingsAction({ provider, baseUrl, basicAuth: auth, clearAuth: false, callbackUrl });
      setMessage(!r.ok ? { ok: false, text: r.error } : r.warning ? { ok: false, text: `Сохранено, но шлюз не подключён: ${r.warning}` } : { ok: true, text: provider === "gowa" ? "Сохранено, шлюз подключён" : "Сохранено" });
      if (r.ok) {
        setAuth("");
        setStatus(await gowaStatusAction());
      }
    });

  const showQr = () =>
    start(async () => {
      setCode(null);
      const r = await gowaQrAction();
      if (r.ok) setQr({ image: r.image, until: Date.now() + r.seconds * 1000 });
      else setMessage({ ok: false, text: r.error });
    });

  const pairCode = () =>
    start(async () => {
      setQr(null);
      const r = await gowaPairCodeAction(phone);
      if (r.ok) setCode(r.code);
      else setMessage({ ok: false, text: r.error });
    });

  const importHistory = () =>
    start(async () => {
      const r = await gowaImportHistoryAction();
      setMessage(r.ok ? { ok: true, text: `История загружена: ${r.imported} сообщений в ${r.withClients} диалогах с клиентами (чатов в WhatsApp — ${r.chats}, незнакомые номера пропущены)` } : { ok: false, text: r.error });
    });

  const logout = () =>
    start(async () => {
      const r = await gowaLogoutAction();
      setMessage(r.ok ? { ok: true, text: "Номер отвязан" } : { ok: false, text: r.error });
      setStatus(await gowaStatusAction());
    });

  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <div className="mb-4 flex items-center gap-3">
        <h2 className="font-semibold">WhatsApp — свой шлюз</h2>
        <span className={cn("rounded-full px-2.5 py-0.5 text-xs", status.loggedIn ? "bg-emerald-100 text-emerald-800" : status.reachable ? "bg-amber-100 text-amber-900" : "bg-cream text-muted")}>{statusLabel(status)}</span>
      </div>
      <p className="text-sm text-muted">
        Вместо Wazzup — бесплатный шлюз GOWA на вашем сервере: номер магазина привязывается по QR как «связанное устройство», входящие и ответы с телефона приходят в инбокс сразу, менеджеры отвечают из CRM. Instagram и Telegram по-прежнему идут через Wazzup.
      </p>

      <fieldset className="mt-4 space-y-2">
        <legend className="mb-1 text-xs text-muted">WhatsApp работает через</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="provider" className="accent-wine" checked={provider === "wazzup"} onChange={() => setProvider("wazzup")} /> Wazzup
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="provider" className="accent-wine" checked={provider === "gowa"} onChange={() => setProvider("gowa")} /> Свой шлюз GOWA
        </label>
      </fieldset>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs text-muted">Адрес шлюза</span>
          <input className="input h-10 text-sm" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="http://127.0.0.1:3020" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted">Логин:пароль шлюза (APP_BASIC_AUTH)</span>
          <input
            className="input h-10 text-sm"
            type="password"
            autoComplete="off"
            value={auth}
            onChange={(e) => setAuth(e.target.value)}
            placeholder={props.authSaved ? `сохранён ${props.authSaved} — оставьте пустым, чтобы не менять` : "admin:пароль"}
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs text-muted">Куда шлюз отправляет входящие (адрес сайта, доступный шлюзу)</span>
          <input className="input h-10 text-sm" value={callbackUrl} onChange={(e) => setCallbackUrl(e.target.value)} placeholder={props.callbackDefault} />
        </label>
      </div>
      <button className="btn btn-primary btn-sm mt-3" disabled={pending} onClick={save}>
        {pending ? <LoaderCircle className="size-4 animate-spin" /> : null} Сохранить
      </button>

      <div className="mt-4 space-y-3 border-t border-line pt-4">
        <div className="text-sm font-medium">Номер магазина</div>
        {status.loggedIn ? (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            Привязан {status.phone ? <b>+{status.phone}</b> : null}
            <button className="btn btn-outline btn-sm" disabled={pending} onClick={importHistory} title="Переписка с клиентами и сделками из WhatsApp — задним числом, без уведомлений и новых заявок">
              {pending ? <LoaderCircle className="size-4 animate-spin" /> : null} Загрузить историю переписки
            </button>
            <button className="text-muted underline underline-offset-4 hover:text-red-700" disabled={pending} onClick={logout}>
              Отвязать
            </button>
          </div>
        ) : (
          <>
            <p className="text-xs text-muted">На телефоне магазина: WhatsApp → Настройки → Связанные устройства → Привязать устройство — и отсканируйте QR. Или получите код и введите его там же («Привязать по номеру телефона»).</p>
            <div className="flex flex-wrap items-end gap-2">
              <button className="btn btn-outline btn-sm h-10" disabled={pending || !status.reachable} onClick={showQr}>
                <QrCode className="size-4" /> Показать QR
              </button>
              <input className="input h-10 w-48 text-sm" inputMode="tel" placeholder="+7 7XX XXX XX XX" value={phone} onChange={(e) => setPhone(e.target.value)} />
              <button className="btn btn-ghost btn-sm h-10" disabled={pending || !status.reachable || !phone.trim()} onClick={pairCode}>
                Код вместо QR
              </button>
              <button className="btn btn-ghost btn-sm h-10" disabled={pending} onClick={() => start(async () => setStatus(await gowaStatusAction()))} aria-label="Обновить состояние">
                <RefreshCw className="size-4" />
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element -- QR от шлюза: data-URL, оптимизатор не нужен */}
            {qr ? <img src={qr.image} alt="QR для привязки WhatsApp" className="size-56 rounded-xl border border-line" /> : null}
            {code ? (
              <p className="text-sm">
                Код привязки: <b className="font-mono text-lg tracking-widest">{code}</b>
              </p>
            ) : null}
          </>
        )}
        {status.problem ? <p className="text-xs text-red-700">{status.problem}</p> : null}
        {message ? <p className={cn("text-xs", message.ok ? "text-emerald-700" : "text-red-700")}>{message.text}</p> : null}
      </div>
    </section>
  );
}
