"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AlarmClock, AtSign, Bell, BellRing, CheckCheck, MessageCircle, Phone, PhoneIncoming, TriangleAlert, Handshake, ListTodo, Volume2, VolumeX, X } from "lucide-react";
import { apiFetch } from "@/lib/client-api";
import { toast } from "@/components/ui/overlays";
import { coalesce, iosNeedsInstall, liveChannel, soundFor } from "./liveRules";
import { playSound, setSoundMuted, soundMuted, unlockAudio } from "./sound";
import type { LiveState } from "@/modules/reporting";
import { cn } from "@/lib/class-names";
import { EmptyState } from "@/components/ui/EmptyState";
import { useWhatsappRing, WaIcon, WhatsappIncomingActions } from "./WhatsappCall";
import { myNotifyPrefsAction, saveMyNotifyPrefsAction } from "@/app/admin/notify-actions";
import type { NotifyPrefs } from "@/modules/workspace/domain/notifyPrefs";

const POLL_MS = 8_000;
/** При живом SSE-соединении опрос нужен только как страховка. */
const POLL_MS_LIVE = 45_000;
/** События склеиваются: сообщение, статусы доставки и уведомление подряд — одно-два обновления, а не пять. */
const REFRESH_GAP_MS = 400;
/** Звук не чаще: серия сообщений клиента («Здравствуйте» / «Сколько стоит?» / фото) — один сигнал. */
const SOUND_GAP_MS = 2_500;

/** Где сотрудник сейчас: открытый на странице чатов диалог и видна ли вкладка. */
function screen() {
  const open = window.location.pathname === "/admin/chats" ? new URLSearchParams(window.location.search).get("c") : null;
  return { focused: document.visibilityState === "visible" && document.hasFocus(), openConversation: open };
}

const LiveContext = createContext<{ live: LiveState; refresh: () => void } | null>(null);

export function useLive() {
  const ctx = useContext(LiveContext);
  if (!ctx) throw new Error("useLive вне CrmLiveProvider");
  return ctx;
}

/**
 * Живое состояние CRM: бейджи меню, колокольчик и входящие звонки без перезагрузки страницы. События приходят по SSE,
 * опрос /api/admin/live — страховка. Свежее уведомление о сообщении клиента или упоминании — со звуком.
 */
export function CrmLiveProvider({ initial, children }: { initial: LiveState; children: React.ReactNode }) {
  const [live, setLive] = useState(initial);
  const seen = useRef(new Set(initial.notifications.map((n) => n.id)));
  const lastSound = useRef(0);
  const baseTitle = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await apiFetch<LiveState>("/api/admin/live", { cache: "no-store" });
      const fresh = next.notifications.filter((n) => !n.read && !seen.current.has(n.id));
      for (const n of next.notifications) seen.current.add(n.id);
      const sound = soundFor(fresh, { muted: soundMuted(), ...screen() });
      if (sound && (sound === "reminder" || Date.now() - lastSound.current > SOUND_GAP_MS)) {
        lastSound.current = Date.now();
        playSound(sound);
      }
      if (fresh.length) {
        const n = fresh.find((x) => x.kind === "reminder") ?? fresh[0];
        if (document.visibilityState === "visible") toast(fresh.length > 1 ? `${n.title} и ещё ${fresh.length - 1}` : n.title, "info");
        else if ("Notification" in window && Notification.permission === "granted") {
          const note = new Notification(n.title, { body: n.body, tag: n.id });
          note.onclick = () => {
            window.focus();
            if (n.link) window.location.assign(n.link);
          };
        }
      }
      setLive(next);
    } catch {
      // сеть моргнула — следующий опрос повторит
    }
  }, []);
  // Событие во время загрузки не теряется: после неё — ещё одна загрузка.
  const coalesced = useRef<(() => Promise<void>) | null>(null);
  useEffect(() => {
    coalesced.current = coalesce(load, REFRESH_GAP_MS);
  }, [load]);
  const refresh = useCallback(() => void coalesced.current?.(), []);

  // Браузер разрешает звук после первого действия на странице.
  useEffect(() => {
    const unlock = () => {
      if (unlockAudio()) remove();
    };
    const remove = () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock);
    return remove;
  }, []);

  const [live$, setLive$] = useState(false);
  useEffect(() => {
    // Мгновенные события: уведомления, сообщения, звонки. Переподключение — средствами EventSource.
    if (typeof EventSource === "undefined") return;
    const es = new EventSource("/api/admin/live/stream");
    let opened = false;
    es.onopen = () => {
      setLive$(true);
      liveChannel.set(true);
      // Переподключились (сеть, перезапуск сайта): события за время обрыва не придут — догружаем счётчики и чаты сами.
      // Первое открытие — нет: страница только что загрузилась.
      if (opened) {
        void refresh();
        window.dispatchEvent(new CustomEvent("crm:live", { detail: { type: "chat", conversationId: null } }));
      }
      opened = true;
    };
    es.onerror = () => (setLive$(false), liveChannel.set(false));
    es.onmessage = (msg) => {
      let data: { type?: string; conversationId?: string | null } = {};
      try {
        data = JSON.parse(msg.data);
      } catch {}
      void refresh();
      window.dispatchEvent(new CustomEvent("crm:live", { detail: data }));
    };
    return () => {
      es.close();
      liveChannel.set(false);
    };
  }, [refresh]);

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/crm-sw.js", { scope: "/admin" }).catch(() => {});
  }, []);

  // Иконка установленного приложения показывает число чатов с новыми сообщениями (iOS 16.4+, Android, десктоп Chrome).
  useEffect(() => {
    const nav = navigator as Navigator & { setAppBadge?: (count: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    const chats = live.counters.chats;
    const badge = chats > 0 ? nav.setAppBadge?.(chats) : nav.clearAppBadge?.();
    badge?.catch(() => {});
  }, [live.counters.chats]);

  useEffect(() => {
    const tick = () => document.visibilityState === "visible" && void refresh();
    const id = window.setInterval(tick, live$ ? POLL_MS_LIVE : POLL_MS);
    const onVis = () => tick();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    window.addEventListener("crm:refresh", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
      window.removeEventListener("crm:refresh", onVis);
    };
  }, [refresh, live$]);

  // Счётчик непрочитанного во вкладке браузера.
  useEffect(() => {
    if (baseTitle.current === null || !document.title.startsWith("(")) baseTitle.current = document.title.replace(/^\(\d+\+?\)\s*/, "");
    const n = live.unread;
    document.title = n ? `(${n > 99 ? "99+" : n}) ${baseTitle.current}` : baseTitle.current;
  });

  return <LiveContext.Provider value={{ live, refresh }}>{children}</LiveContext.Provider>;
}

const kindIcon = { message: MessageCircle, call: Phone, task: ListTodo, reminder: AlarmClock, deal: Handshake, sla: TriangleAlert, system: Bell, mention: AtSign } as const;

function ago(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "сейчас";
  if (m < 60) return `${m} мин`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} ч` : `${Math.round(h / 24)} дн`;
}

/** Тон значка уведомления: срочное (норматив, звонок, напоминание) — красным, про клиента — винным, остальное — нейтрально. */
const kindTone = (kind: string) => (kind === "sla" || kind === "call" || kind === "reminder" ? "bg-danger-bg text-danger" : kind === "message" || kind === "mention" ? "bg-rose text-wine" : "bg-sunken text-ink-soft");

export function NotificationBell() {
  const { live, refresh } = useLive();
  const [open, setOpen] = useState(false);
  // Меню с этой кнопкой открывается только по клику, поэтому расхождения с серверной разметкой нет.
  const [perm, setPerm] = useState<string>(() => (typeof window !== "undefined" && "Notification" in window ? Notification.permission : "default"));
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const markRead = async (id?: string) => {
    await apiFetch("/api/admin/notifications", { method: "POST", json: id ? { id } : {} }).catch(() => {});
    void refresh();
  };

  return (
    <div className="relative" ref={ref}>
      <button className={cn("btn btn-ghost btn-icon btn-sm relative", open && "bg-ink/[0.06] text-ink")} onClick={() => setOpen((v) => !v)} aria-label={live.unread ? `Уведомления, непрочитанных: ${live.unread}` : "Уведомления"} aria-expanded={open}>
        {live.unread ? <BellRing className="size-[18px] text-wine" strokeWidth={1.8} /> : <Bell className="size-[18px]" strokeWidth={1.8} />}
        {live.unread ? (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] rounded-full bg-wine px-1 text-center text-xs leading-[18px] font-semibold text-white tabular-nums ring-2 ring-canvas" data-testid="bell-count">
            {live.unread > 99 ? "99+" : live.unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          className="z-50 flex flex-col overflow-hidden rounded-[14px] border border-line bg-white shadow-soft max-lg:fixed max-lg:inset-x-2 max-lg:top-[calc(var(--topbar-h)+0.25rem)] max-lg:max-h-[calc(100dvh-var(--topbar-h)-var(--tabbar-h)-1rem)] lg:absolute lg:right-0 lg:mt-2 lg:max-h-[min(80vh,680px)] lg:w-[400px]"
          role="dialog"
          aria-label="Уведомления"
        >
          <div className="flex min-h-13 shrink-0 items-center justify-between gap-2 border-b border-line py-2 pr-2 pl-4">
            <span className="text-[15px] font-semibold">
              Уведомления {live.unread ? <span className="font-normal text-muted tabular-nums">{live.unread}</span> : null}
            </span>
            {live.unread ? (
              <button className="btn btn-ghost btn-sm h-8 px-2.5 text-[13px] max-lg:h-11" onClick={() => markRead()}>
                <CheckCheck className="size-4" /> Прочитать все
              </button>
            ) : null}
          </div>
          <div className="min-h-0 flex-1 divide-y divide-line overflow-y-auto overscroll-contain">
            {live.notifications.length === 0 ? (
              <EmptyState compact icon={Bell} title="Новых уведомлений нет">
                Сообщения клиентов, упоминания, задачи и пропущенные звонки появятся здесь.
              </EmptyState>
            ) : null}
            {live.notifications.map((n) => {
              const Icon = kindIcon[n.kind as keyof typeof kindIcon] ?? Bell;
              return (
                <button
                  key={n.id}
                  className={cn("flex min-h-14 w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-sunken/70", !n.read && "bg-rose/30")}
                  onClick={() => {
                    if (!n.read) void markRead(n.id);
                    setOpen(false);
                    if (n.link) router.push(n.link);
                  }}
                >
                  <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", kindTone(n.kind))}>
                    <Icon className="size-4" strokeWidth={1.8} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate text-sm", n.read ? "font-medium text-ink-soft" : "font-semibold text-ink")}>{n.title}</span>
                    {n.body ? <span className="mt-0.5 line-clamp-2 text-[13px] text-muted">{n.body}</span> : null}
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1.5 pt-0.5">
                    <span className="text-xs text-muted tabular-nums">{ago(n.at)}</span>
                    {!n.read ? <span className="size-2 rounded-full bg-wine" aria-label="не прочитано" /> : null}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="shrink-0 border-t border-line bg-sunken/40 px-4 pt-2.5 pb-1">
            <p className="text-xs font-medium text-muted">На этом устройстве</p>
            <SoundToggle />
            <PushToggle perm={perm} onPerm={setPerm} />
            <PushPrefs />
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Переключатель-строка: подпись слева, «тумблер» справа (role=switch). */
function SwitchRow({ on, onChange, children, disabled, testId, hint }: { on: boolean; onChange: (v: boolean) => void; children: React.ReactNode; disabled?: boolean; testId?: string; hint?: React.ReactNode }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={disabled} onClick={() => onChange(!on)} className="flex min-h-10 w-full items-center gap-3 text-left text-[13px] text-ink disabled:opacity-50 max-lg:min-h-11" data-testid={testId}>
      <span className="min-w-0 flex-1">
        {children}
        {hint ? <span className="block text-xs text-muted">{hint}</span> : null}
      </span>
      <span className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors", on ? "bg-wine" : "bg-line-strong")} aria-hidden>
        <span className={cn("absolute top-0.5 size-4 rounded-full bg-white shadow-sm transition-[left]", on ? "left-[18px]" : "left-0.5")} />
      </span>
    </button>
  );
}

/**
 * Мои push (tasks-19, tasks-22): тихие часы — ночью push не будит (напоминания о задачах приходят всегда, колокольчик —
 * всё), и push о сообщениях клиентов — можно выключить, если WhatsApp и так на телефоне магазина. Для всех устройств.
 */
function PushPrefs() {
  const [p, setP] = useState<NotifyPrefs | null>(null);
  useEffect(() => {
    void myNotifyPrefsAction().then(setP, () => setP(null));
  }, []);
  if (!p) return null;
  const save = (next: NotifyPrefs) => {
    setP(next);
    void saveMyNotifyPrefsAction(next).then((r) => (r.ok ? undefined : toast(r.error, "error")));
  };
  return (
    <div className="border-t border-line/70" data-testid="push-prefs">
      <SwitchRow on={p.pushMessages} onChange={(v) => save({ ...p, pushMessages: v })}>
        Push о сообщениях клиентов
      </SwitchRow>
      <SwitchRow on={p.quiet} onChange={(v) => save({ ...p, quiet: v })} hint="ночью push не будит, напоминания о задачах приходят всегда">
        Тихие часы push
      </SwitchRow>
      {p.quiet ? (
        <div className="flex items-center gap-2 pb-2 text-[13px] text-ink-soft">
          с
          <input type="time" className="input h-8 w-28 px-2 text-sm" value={p.quietFrom} onChange={(e) => e.target.value && save({ ...p, quietFrom: e.target.value })} aria-label="Тихие часы с" />
          до
          <input type="time" className="input h-8 w-28 px-2 text-sm" value={p.quietTo} onChange={(e) => e.target.value && save({ ...p, quietTo: e.target.value })} aria-label="Тихие часы до" />
        </div>
      ) : null}
    </div>
  );
}

/** Звук новых сообщений и напоминаний на этом устройстве: выключить и включить (с пробным сигналом). */
function SoundToggle() {
  // Меню открывается только по клику (после гидрации) — localStorage здесь доступен.
  const [muted, setMuted] = useState(() => soundMuted());
  const toggle = () => {
    const next = !muted;
    setSoundMuted(next);
    setMuted(next);
    if (!next) {
      unlockAudio();
      playSound("message");
    }
  };
  return (
    <SwitchRow on={!muted} onChange={toggle} testId="sound-toggle">
      <span className="flex items-center gap-2">
        {muted ? <VolumeX className="size-4 text-muted" aria-hidden /> : <Volume2 className="size-4 text-ink-soft" aria-hidden />} Звук новых сообщений
      </span>
    </SwitchRow>
  );
}

/** Карточка входящего звонка поверх CRM: кто звонит, ответить (WhatsApp) и куда перейти — сделка или клиент. */
export function IncomingCall() {
  const { live } = useLive();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const calls = live.ringing.filter((c) => !hidden.has(c.id));
  useWhatsappRing(calls.filter((c) => c.whatsapp).map((c) => ({ id: c.id, title: c.name || c.phone })));
  if (!calls.length) return null;
  return (
    <div className="fixed inset-x-3 bottom-[calc(var(--tabbar-h,0px)+0.75rem)] z-50 flex flex-col gap-2 sm:inset-x-auto sm:right-4 sm:w-[360px] lg:bottom-4" role="status" aria-live="polite">
      {calls.map((c) => (
        <div key={c.id} className="animate-pop overflow-hidden rounded-[14px] border border-line bg-white shadow-lift" data-testid="incoming-call">
          <div className="flex items-start gap-3 p-4">
            <span className="relative flex size-11 shrink-0 items-center justify-center rounded-full bg-success-bg text-success">
              <span className="absolute inset-0 animate-ping rounded-full bg-success/20" aria-hidden />
              {c.whatsapp ? <WaIcon className="relative size-5" /> : <PhoneIncoming className="relative size-5" strokeWidth={1.8} />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-success">{c.whatsapp ? "Входящий в WhatsApp" : c.direction === "in" ? (c.mine ? "Звонят вам" : "Входящий звонок") : "Исходящий звонок"}</div>
              <div className="truncate text-[15px] font-semibold">{c.name || c.phone}</div>
              {c.name ? <div className="text-xs text-muted tabular-nums">{c.phone}</div> : <div className="text-xs text-muted">Новый номер — создадим сделку</div>}
            </div>
            <button className="btn btn-ghost btn-icon btn-sm -mt-1 -mr-1 max-lg:size-11" onClick={() => setHidden((s) => new Set(s).add(c.id))} aria-label="Скрыть карточку звонка">
              <X className="size-4" />
            </button>
          </div>
          {c.whatsapp ? (
            <div className="px-4 pb-3">
              <WhatsappIncomingActions id={c.id} title={c.name || c.phone} onDone={() => setHidden((s) => new Set(s).add(c.id))} />
            </div>
          ) : null}
          {c.dealId || c.clientId ? (
            <div className="flex gap-2 border-t border-line bg-sunken/40 px-4 py-2.5">
              {c.dealId ? (
                <Link href={`/admin/deals/${c.dealId}`} className="btn btn-dark btn-sm flex-1">
                  Открыть сделку
                </Link>
              ) : null}
              {c.clientId ? (
                <Link href={`/admin/clients/${c.clientId}`} className="btn btn-outline btn-sm flex-1">
                  Карточка клиента
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/** Push-уведомления на это устройство (телефон или компьютер) — приходят даже при закрытой CRM. */
function PushToggle({ perm, onPerm }: { perm: string; onPerm: (p: string) => void }) {
  // Меню открывается только по клику (после гидрации), поэтому проверка возможностей браузера в инициализаторе безопасна.
  const supported = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
  const [state, setState] = useState<"unknown" | "on" | "off" | "unsupported">(supported ? "unknown" : "unsupported");
  const [busy, setBusy] = useState(false);
  // Вкладка Safari на iPhone: push придут только после «На экран „Домой“» — подсказка вместо кнопки.
  const iosTab =
    typeof window !== "undefined" &&
    iosNeedsInstall({ userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints, standalone: window.matchMedia?.("(display-mode: standalone)").matches || !!(navigator as Navigator & { standalone?: boolean }).standalone });
  useEffect(() => {
    if (!supported) return;
    navigator.serviceWorker.ready.then((reg) => reg.pushManager.getSubscription()).then((sub) => setState(sub ? "on" : "off"), () => setState("off"));
  }, [supported]);
  if (iosTab)
    return (
      <p className="py-2 text-xs text-ink-soft" data-testid="push-ios-hint">
        Чтобы push приходили на iPhone, откройте CRM в Safari → «Поделиться» → «На экран „Домой“» и войдите с иконки — там включите push.
      </p>
    );
  if (state === "unsupported") {
    return perm === "default" ? (
      <button className="flex min-h-10 w-full items-center text-left text-[13px] font-medium text-wine hover:underline max-lg:min-h-11" onClick={async () => onPerm(await Notification.requestPermission())}>
        Показывать уведомления на рабочем столе
      </button>
    ) : null;
  }
  if (state === "unknown") return null;
  const enable = async () => {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      onPerm(permission);
      if (permission !== "granted") return;
      const reg = await navigator.serviceWorker.ready;
      const { publicKey } = await apiFetch<{ publicKey: string }>("/api/admin/push");
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
      await apiFetch("/api/admin/push", { method: "POST", json: sub.toJSON() });
      setState("on");
      toast("Уведомления на этом устройстве включены", "success");
    } catch {
      toast("Не удалось включить уведомления на этом устройстве", "error");
    } finally {
      setBusy(false);
    }
  };
  const disable = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await apiFetch("/api/admin/push", { method: "DELETE", json: { endpoint: sub.endpoint } }).catch(() => {});
        await sub.unsubscribe();
      }
      setState("off");
    } finally {
      setBusy(false);
    }
  };
  return (
    <SwitchRow on={state === "on"} disabled={busy} onChange={() => void (state === "on" ? disable() : enable())} testId="push-toggle" hint="приходят, даже когда CRM закрыта">
      Push на этом устройстве
    </SwitchRow>
  );
}
