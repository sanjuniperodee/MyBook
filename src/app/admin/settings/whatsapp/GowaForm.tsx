"use client";

import { useEffect, useState, useTransition } from "react";
import { LoaderCircle, QrCode, RefreshCw } from "lucide-react";
import type { GowaStatus } from "@/modules/messaging";
import { Facts } from "@/components/ui/Facts";
import { CheckMessage, Choice, Field, Group, Help, InlineActions, Section, type SheetStatus } from "../ui";
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

const statusOf = (s: GowaStatus, provider: "wazzup" | "gowa"): SheetStatus =>
  s.loggedIn
    ? { tone: "ok", label: `номер привязан${s.phone ? ` · +${s.phone}` : ""}` }
    : s.problem
      ? { tone: "bad", label: "ошибка подключения" }
      : !s.reachable
        ? { tone: provider === "gowa" ? "bad" : "off", label: "шлюз недоступен" }
        : s.registered
          ? { tone: "warn", label: "номер не привязан" }
          : { tone: "off", label: "не подключён" };

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
        setMessage({ ok: true, text: "Номер привязан — переписка WhatsApp идёт в CRM. Загружаем историю с клиентами…" });
        // История приходит в шлюз в первые минуты после привязки: сразу берём что есть, остальное догрузит планировщик.
        const h = await gowaImportHistoryAction();
        setMessage({ ok: true, text: h.ok ? `Номер привязан. История с клиентами: ${h.imported} сообщений в ${h.withClients} диалогах; то, что WhatsApp догрузит позже, подтянется само` : "Номер привязан — переписка WhatsApp идёт в CRM" });
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

  const st = statusOf(status, provider);
  const refresh = () => start(async () => setStatus(await gowaStatusAction()));
  return (
    <Section
      id="gowa"
      title="WhatsApp: свой шлюз"
      description="Бесплатный шлюз GOWA на вашем сервере вместо Wazzup: номер магазина привязывается по QR как «связанное устройство»"
      status={st}
      actions={
        <>
          <button type="button" className="btn btn-ghost btn-icon btn-sm" disabled={pending} onClick={refresh} aria-label="Обновить состояние" title="Обновить состояние">
            <RefreshCw className="size-4" strokeWidth={1.8} />
          </button>
          {!status.loggedIn ? (
            <button type="button" className="btn btn-dark btn-sm" disabled={pending || !status.reachable} onClick={showQr}>
              <QrCode className="size-4" strokeWidth={1.8} aria-hidden /> Привязать номер
            </button>
          ) : null}
        </>
      }
    >
      <CheckMessage check={message ? { ok: message.ok, message: message.text } : null} wrap />
      {status.problem ? <CheckMessage check={{ ok: false, message: status.problem }} wrap /> : null}

      <div className="space-y-5">
        <Help title="Как это работает" open={!status.loggedIn}>
          <p>
            Входящие и ответы с телефона приходят в инбокс сразу, менеджеры отвечают из CRM. Сайт сам заводит в шлюзе устройство магазина и направляет его события на себя. Instagram и Telegram по-прежнему идут через Wazzup.
          </p>
        </Help>

        <Group title="Номер магазина" hint={status.loggedIn ? "Номер привязан: переписка WhatsApp идёт в CRM." : "На телефоне магазина: WhatsApp, Настройки, Связанные устройства, Привязать устройство, и отсканируйте QR."}>
          {status.loggedIn ? (
            <>
              <Facts items={[{ label: "Номер", value: status.phone ? <b className="font-semibold">+{status.phone}</b> : "привязан" }]} />
              <InlineActions>
                <button className="btn btn-outline" disabled={pending} onClick={importHistory} title="Переписка с клиентами и сделками из WhatsApp — задним числом, без уведомлений и новых заявок">
                  {pending ? <LoaderCircle className="size-4 animate-spin" /> : null} Загрузить историю переписки
                </button>
                <button className="btn btn-ghost text-danger hover:bg-danger-bg hover:text-danger" disabled={pending} onClick={logout}>
                  Отвязать номер
                </button>
              </InlineActions>
            </>
          ) : (
            <>
              <InlineActions>
                <button className="btn btn-outline" disabled={pending || !status.reachable} onClick={showQr}>
                  <QrCode className="size-4" /> Показать QR
                </button>
              </InlineActions>
              <Field label="Или код вместо QR" hint="Введите номер: получите код и введите его на телефоне («Привязать по номеру телефона»).">
                <div className="flex gap-2">
                  <input className="input min-w-0 flex-1" inputMode="tel" placeholder="+7 7XX XXX XX XX" value={phone} onChange={(e) => setPhone(e.target.value)} />
                  <button className="btn btn-outline" disabled={pending || !status.reachable || !phone.trim()} onClick={pairCode}>
                    Получить код
                  </button>
                </div>
              </Field>
              {/* eslint-disable-next-line @next/next/no-img-element -- QR от шлюза: data-URL, оптимизатор не нужен */}
              {qr ? <img src={qr.image} alt="QR для привязки WhatsApp" className="size-56 rounded-[var(--r-ctl)] border border-line" /> : null}
              {code ? (
                <p className="text-sm">
                  Код привязки: <b className="font-mono text-lg tracking-widest">{code}</b>
                </p>
              ) : null}
            </>
          )}
        </Group>

        <Group title="Канал" hint="WhatsApp работает через выбранный сервис; переключиться можно в любой момент.">
          <div className="flex flex-wrap gap-2">
            <Choice active={provider === "wazzup"}>
              <input type="radio" name="provider" className="accent-wine" checked={provider === "wazzup"} onChange={() => setProvider("wazzup")} /> Wazzup
            </Choice>
            <Choice active={provider === "gowa"}>
              <input type="radio" name="provider" className="accent-wine" checked={provider === "gowa"} onChange={() => setProvider("gowa")} /> Свой шлюз GOWA
            </Choice>
          </div>
        </Group>

        <Group title="Шлюз" hint="Адрес и доступ к вашему серверу GOWA.">
          <Field label="Адрес шлюза">
            <input className="input" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="http://127.0.0.1:3020" />
          </Field>
          <Field label="Логин:пароль шлюза (APP_BASIC_AUTH)" hint={props.authSaved ? `Сохранён ${props.authSaved}. Оставьте пустым, чтобы не менять.` : undefined}>
            <input className="input" type="password" autoComplete="off" value={auth} onChange={(e) => setAuth(e.target.value)} placeholder={props.authSaved ? "оставьте пустым, чтобы не менять" : "admin:пароль"} />
          </Field>
          <Field label="Куда шлюз отправляет входящие" hint="Адрес сайта, доступный шлюзу. Пусто — адрес по умолчанию.">
            <input className="input" value={callbackUrl} onChange={(e) => setCallbackUrl(e.target.value)} placeholder={props.callbackDefault} />
          </Field>
          <InlineActions>
            <button className="btn btn-dark" disabled={pending} onClick={save}>
              {pending ? <LoaderCircle className="size-4 animate-spin" /> : null} Сохранить
            </button>
          </InlineActions>
        </Group>
      </div>
    </Section>
  );
}
