"use client";

import { useEffect, useState, useTransition } from "react";
import { Copy, LoaderCircle, QrCode, RefreshCw } from "lucide-react";
import { toast } from "@/components/ui/overlays";
import { cn } from "@/lib/utils";
import type { GowaStatus } from "@/modules/messaging";
import { gowaLogoutAction, gowaPairCodeAction, gowaQrAction, gowaStatusAction, saveWhatsappSettingsAction } from "./actions";

export interface GowaFormProps {
  provider: "wazzup" | "gowa";
  providerFromEnv: boolean;
  baseUrl: string;
  baseUrlFromEnv: boolean;
  /** «••••abcd», если логин:пароль шлюза сохранён. */
  authSaved: string;
  authFromEnv: boolean;
  status: GowaStatus;
  webhookUrl: string;
  /** Секрет для WHATSAPP_WEBHOOK_SECRET шлюза; null — задан переменной окружения GOWA_WEBHOOK_SECRET. */
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

const statusLabel = (s: GowaStatus) => (!s.reachable ? "шлюз недоступен" : s.loggedIn ? `номер привязан${s.phone ? ` · +${s.phone}` : ""}` : "номер не привязан");

/**
 * WhatsApp через свой шлюз GOWA (go-whatsapp-web-multidevice) вместо Wazzup: номер магазина привязывается по QR,
 * переписка идёт в единый инбокс в реальном времени, менеджеры отвечают из CRM.
 */
export function GowaForm(props: GowaFormProps) {
  const [pending, start] = useTransition();
  const [provider, setProvider] = useState(props.provider);
  const [baseUrl, setBaseUrl] = useState(props.baseUrl);
  const [auth, setAuth] = useState("");
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
      const r = await saveWhatsappSettingsAction({ provider, baseUrl, basicAuth: auth, clearAuth: false });
      setMessage(r.ok ? { ok: true, text: "Сохранено" } : { ok: false, text: r.error });
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

      <fieldset className="mt-4 space-y-2" disabled={props.providerFromEnv}>
        <legend className="mb-1 text-xs text-muted">WhatsApp работает через{props.providerFromEnv ? " (задано в WHATSAPP_PROVIDER)" : ""}</legend>
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
          <input className="input h-10 text-sm" value={baseUrl} disabled={props.baseUrlFromEnv} onChange={(e) => setBaseUrl(e.target.value)} placeholder="http://gowa:3000" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted">Логин:пароль шлюза (APP_BASIC_AUTH)</span>
          <input
            className="input h-10 text-sm"
            type="password"
            autoComplete="off"
            value={auth}
            disabled={props.authFromEnv}
            onChange={(e) => setAuth(e.target.value)}
            placeholder={props.authFromEnv ? "задан в переменных окружения" : props.authSaved ? `сохранён ${props.authSaved} — оставьте пустым, чтобы не менять` : "admin:пароль"}
          />
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
        {message ? <p className={cn("text-xs", message.ok ? "text-emerald-700" : "text-red-700")}>{message.text}</p> : null}
      </div>

      <div className="mt-4 space-y-3 border-t border-line pt-4">
        <div className="text-sm font-medium">Вебхук шлюза</div>
        <p className="text-xs text-muted">В настройках шлюза: WHATSAPP_WEBHOOK — адрес ниже, WHATSAPP_WEBHOOK_SECRET — секрет ниже, WHATSAPP_WEBHOOK_IGNORE_JIDS=@g.us (группы в CRM не нужны). В docker compose это уже настроено.</p>
        <Copyable label="Адрес" value={props.webhookUrl} />
        {props.webhookSecret ? <Copyable label="Секрет подписи" value={props.webhookSecret} /> : <p className="text-xs text-muted">Секрет задан переменной окружения GOWA_WEBHOOK_SECRET.</p>}
      </div>
    </section>
  );
}
