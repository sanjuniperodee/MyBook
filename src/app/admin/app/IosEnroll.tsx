"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { AlertTriangle, CheckCircle2, ChevronRight, Compass, Copy, Download, Lock, Settings, Smartphone } from "lucide-react";

type Device = { id: string; product: string; iosVersion: string; createdAt: string; ready: boolean };
type Status = { build: { version: string } | null; devices: Device[] };

/** Через сколько минут без ответа телефона показываем «что проверить». */
const WAIT_MIN = 4;
const STARTED_KEY = "crm:ios-enroll-started";

type Browser = "safari" | "other-ios" | "standalone" | "not-ios";

/** Где открыта страница: регистрация работает только в Safari на самом iPhone. На сервере — неизвестно (null). */
function readBrowser(): Browser {
  const ua = navigator.userAgent;
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true || matchMedia("(display-mode: standalone)").matches;
  if (!/iPhone|iPod/.test(ua)) return "not-ios";
  if (standalone) return "standalone";
  if (/CriOS|FxiOS|EdgiOS|YaBrowser|OPiOS|GSA\/|FBAN|FBAV|Instagram|WhatsApp|Telegram|Line\//.test(ua)) return "other-ios";
  return "safari";
}
const noSubscribe = () => () => {};
const useBrowser = () => useSyncExternalStore<Browser | null>(noSubscribe, readBrowser, () => null);

/** Когда нажали «Скачать профиль» (переживает переход в «Настройки» и обратно); телефон вернул на страницу — сброс. */
function readStarted(notice?: string): number | null {
  if (typeof window === "undefined") return null;
  if (notice === "registered") {
    localStorage.removeItem(STARTED_KEY);
    return null;
  }
  const v = Number(localStorage.getItem(STARTED_KEY));
  return v && Date.now() - v < 60 * 60_000 ? v : null;
}

/**
 * Регистрация iPhone по шагам: проверка, что открыт Safari; «Скачать профиль»; экран «теперь в Настройки» со схемами;
 * ожидание ответа телефона (опрос статуса) и подсказки, если он не пришёл за несколько минут.
 */
export function IosEnroll({ initial, notice }: { initial: Status; notice?: string }) {
  const browser = useBrowser();
  const [status, setStatus] = useState(initial);
  const [startedAt, setStarted] = useState<number | null>(() => readStarted(notice));
  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState(false);
  const known = initial.devices.length;

  const poll = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/ios-app/status", { cache: "no-store" });
      if (r.ok) {
        const next = (await r.json()) as Status;
        if (next.devices.length > known) localStorage.removeItem(STARTED_KEY);
        setStatus(next);
      }
    } catch {}
    setNow(Date.now());
  }, [known]);

  const arrived = status.devices.length > known;
  // Телефон пришёл — ожидание закончено.
  const started = arrived ? null : startedAt;

  // Пока ждём телефон или сборку — спрашиваем сервер каждые 5 секунд (и сразу при возврате на вкладку).
  const waiting = started !== null || (status.devices.length > 0 && !status.devices.some((d) => d.ready));
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(poll, 5000);
    const onVisible = () => document.visibilityState === "visible" && poll();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [waiting, poll]);

  const readyNow = status.devices.some((d) => d.ready);
  // Сервер подписал приложение под телефон — перезагружаем страницу: появится «Установить на iPhone».
  useEffect(() => {
    if (readyNow) window.location.reload();
  }, [readyNow]);

  const start = () => {
    const t = Date.now();
    localStorage.setItem(STARTED_KEY, String(t));
    setStarted(t);
    window.location.href = "/api/admin/ios-app/enroll";
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href.split("?")[0]);
      setCopied(true);
    } catch {}
  };

  const overdue = started !== null && now - started > WAIT_MIN * 60_000;

  if (browser === null) return null;

  if (browser === "not-ios")
    return (
      <Box tone="info" icon={<Smartphone className="size-5" />}>
        Регистрация делается <b>с самого iPhone</b>: откройте эту страницу (CRM → «Ещё» → «Приложение для iPhone и Android») в Safari на телефоне.
      </Box>
    );

  if (browser === "other-ios" || browser === "standalone")
    return (
      <Box tone="danger" icon={<Compass className="size-5" />}>
        <p className="font-medium">{browser === "standalone" ? "Сейчас CRM открыта с иконки на экране «Домой»." : "Сейчас страница открыта не в Safari."} Отсюда iPhone профиль не скачает.</p>
        <p className="mt-1">Откройте эту страницу в <b>Safari</b>: скопируйте ссылку и вставьте её в адресную строку Safari.</p>
        <button type="button" onClick={copyLink} className="btn btn-outline btn-sm mt-3">
          <Copy className="size-4" /> {copied ? "Ссылка скопирована" : "Скопировать ссылку"}
        </button>
      </Box>
    );

  return (
    <div className="space-y-4">
      <Box tone="danger" icon={<AlertTriangle className="size-5" />}>
        <p className="font-semibold">Не нажимайте «Вход в учётную запись учебного учреждения или организации».</p>
        <p className="mt-1">Эта кнопка есть в «Настройках» у всех iPhone и к CRM не относится — вход через неё не получится («Ваш Аккаунт Apple не поддерживает необходимые сервисы»). Нужна строка <b>«Профиль загружен»</b>.</p>
      </Box>

      {started === null ? (
        <>
          <ol className="space-y-2 text-sm">
            <Step n={1}>Нажмите «Скачать профиль» ниже. iPhone спросит «Разрешить загрузку профиля?» — нажмите <b>«Разрешить»</b>, затем «Закрыть».</Step>
            <Step n={2}>Откройте <b>«Настройки»</b> — первая строка под вашим именем: <b>«Профиль загружен»</b>.</Step>
            <Step n={3}>Нажмите <b>«Установить»</b> (справа вверху), введите код-пароль телефона, ещё раз «Установить».</Step>
            <Step n={4}>Телефон вернёт вас сюда, а через минуту появится «Установить на iPhone».</Step>
          </ol>
          <button type="button" onClick={start} className="btn btn-primary">
            <Download className="size-4" strokeWidth={1.8} aria-hidden /> Скачать профиль
          </button>
          <p className="text-xs text-muted">Профиль только сообщает CRM идентификатор телефона: ничего не устанавливает, не даёт управлять телефоном и удаляется сам.</p>
        </>
      ) : (
        <>
          <Box tone="info" icon={<Settings className="size-5" />}>
            <p className="font-semibold">Профиль скачан. Теперь откройте «Настройки» → «Профиль загружен» → «Установить».</p>
            <p className="mt-1 text-xs">Эта страница сама увидит телефон — возвращаться и обновлять её не нужно.</p>
          </Box>
          <div className="grid gap-3 sm:grid-cols-3">
            <SettingsMock />
            <ProfileMock />
            <DoneMock />
          </div>
          {overdue ? (
            <Box tone="warn" icon={<AlertTriangle className="size-5" />}>
              <p className="font-semibold">Телефон ещё не зарегистрирован. Проверьте:</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                <li>В «Настройках» есть строка «Профиль загружен»? Если нет — «Настройки» → «Основные» → «VPN и управление устройством» → «Загруженный профиль» → «Регистрация iPhone для приложения CRM».</li>
                <li>Нет ни там, ни там — профиль не скачался: нажмите «Скачать профиль ещё раз» и в окне iPhone выберите «Разрешить».</li>
                <li>Скачанный профиль iPhone удаляет через 8 минут, если его не установить, — тогда скачайте заново.</li>
                <li>Нажали «Вход в учётную запись учебного учреждения» — нажмите «Отменить», это не наш шаг.</li>
              </ul>
            </Box>
          ) : (
            <p className="text-sm text-muted">Ждём ответа телефона…</p>
          )}
          <button type="button" onClick={start} className="btn btn-outline btn-sm">
            <Download className="size-4" strokeWidth={1.8} aria-hidden /> Скачать профиль ещё раз
          </button>
        </>
      )}
    </div>
  );
}

function Box({ tone, icon, children }: { tone: "info" | "warn" | "danger"; icon: React.ReactNode; children: React.ReactNode }) {
  const cls = tone === "danger" ? "bg-danger-bg text-danger" : tone === "warn" ? "bg-warning-bg text-warning" : "bg-info-bg text-info";
  return (
    <div className={`flex gap-3 rounded-[10px] p-3 text-sm ${cls}`}>
      <span className="mt-0.5 shrink-0" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-semibold text-white">{n}</span>
      <span className="pt-0.5">{children}</span>
    </li>
  );
}

/** Схема экрана iPhone: рамка телефона с подписью шага. */
function Phone({ caption, children }: { caption: string; children: React.ReactNode }) {
  return (
    <figure className="space-y-1.5">
      <div className="overflow-hidden rounded-[22px] border-4 border-ink/80 bg-[#f2f2f7] p-2 text-[11px] text-black">{children}</div>
      <figcaption className="text-xs text-muted">{caption}</figcaption>
    </figure>
  );
}

function Row({ children, hl, muted }: { children: React.ReactNode; hl?: boolean; muted?: boolean }) {
  return (
    <div className={`flex items-center justify-between rounded-lg px-2 py-1.5 ${hl ? "bg-white ring-2 ring-wine" : "bg-white"} ${muted ? "opacity-50" : ""}`}>
      <span className="truncate">{children}</span>
      <ChevronRight className="size-3 shrink-0 text-black/30" />
    </div>
  );
}

function SettingsMock() {
  return (
    <Phone caption="1. «Настройки» → первая строка «Профиль загружен»">
      <div className="mb-1.5 text-[13px] font-bold">Настройки</div>
      <Row>Ваше имя · Аккаунт Apple</Row>
      <div className="h-1.5" />
      <Row hl>
        <b>Профиль загружен</b>
      </Row>
      <div className="h-1.5" />
      <Row muted>Авиарежим</Row>
      <Row muted>Wi-Fi</Row>
    </Phone>
  );
}

function ProfileMock() {
  return (
    <Phone caption="2. «Установить» справа вверху, затем код-пароль">
      <div className="mb-1.5 flex justify-between text-[11px]">
        <span className="text-[#007aff]">Отменить</span>
        <span className="font-semibold">Установка профиля</span>
        <span className="rounded px-1 font-semibold text-[#007aff] ring-2 ring-wine">Установить</span>
      </div>
      <div className="rounded-lg bg-white p-2">
        <div className="font-semibold">Регистрация iPhone для приложения CRM</div>
        <div className="text-black/50">MyBooks CRM · Не проверен</div>
      </div>
      <div className="mt-1.5 rounded-lg bg-white p-2 text-black/60">Телефон сообщит CRM свой идентификатор…</div>
    </Phone>
  );
}

function DoneMock() {
  return (
    <Phone caption="3. Safari откроет CRM: «iPhone зарегистрирован»">
      <div className="flex items-center gap-1.5 rounded-lg bg-white p-2">
        <Lock className="size-3 text-black/40" /> mybooks.kz/admin/app
      </div>
      <div className="mt-1.5 flex items-start gap-1.5 rounded-lg bg-[#e2f3ea] p-2 text-[#13703f]">
        <CheckCircle2 className="mt-0.5 size-3 shrink-0" /> iPhone зарегистрирован — через минуту «Установить на iPhone»
      </div>
    </Phone>
  );
}
