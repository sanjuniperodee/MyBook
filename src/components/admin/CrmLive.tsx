"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AtSign, Bell, BellRing, CheckCheck, MessageCircle, Phone, PhoneIncoming, TriangleAlert, Handshake, ListTodo, X } from "lucide-react";
import { apiFetch } from "@/lib/client-api";
import { toast } from "@/components/ui/overlays";
import type { LiveState } from "@/modules/reporting";
import { cn } from "@/lib/utils";

const POLL_MS = 8_000;
/** При живом SSE-соединении опрос нужен только как страховка. */
const POLL_MS_LIVE = 45_000;
const LiveContext = createContext<{ live: LiveState; refresh: () => void } | null>(null);

export function useLive() {
  const ctx = useContext(LiveContext);
  if (!ctx) throw new Error("useLive вне CrmLiveProvider");
  return ctx;
}

/** Опрос /api/admin/live: бейджи меню, колокольчик и входящие звонки без перезагрузки страницы. */
export function CrmLiveProvider({ initial, children }: { initial: LiveState; children: React.ReactNode }) {
  const [live, setLive] = useState(initial);
  const seen = useRef(new Set(initial.notifications.map((n) => n.id)));
  const busy = useRef(false);
  const baseTitle = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const next = await apiFetch<LiveState>("/api/admin/live", { cache: "no-store" });
      const fresh = next.notifications.filter((n) => !n.read && !seen.current.has(n.id));
      for (const n of next.notifications) seen.current.add(n.id);
      if (fresh.length) {
        const n = fresh[0];
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
    } finally {
      busy.current = false;
    }
  }, []);

  const [live$, setLive$] = useState(false);
  useEffect(() => {
    // Мгновенные события: уведомления, сообщения, звонки. Переподключение — средствами EventSource.
    if (typeof EventSource === "undefined") return;
    const es = new EventSource("/api/admin/live/stream");
    es.onopen = () => setLive$(true);
    es.onerror = () => setLive$(false);
    es.onmessage = (msg) => {
      let data: { type?: string; conversationId?: string | null } = {};
      try {
        data = JSON.parse(msg.data);
      } catch {}
      void refresh();
      window.dispatchEvent(new CustomEvent("crm:live", { detail: data }));
    };
    return () => es.close();
  }, [refresh]);

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/crm-sw.js", { scope: "/admin" }).catch(() => {});
  }, []);

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

const kindIcon = { message: MessageCircle, call: Phone, task: ListTodo, deal: Handshake, sla: TriangleAlert, system: Bell, mention: AtSign } as const;

function ago(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "сейчас";
  if (m < 60) return `${m} мин`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} ч` : `${Math.round(h / 24)} дн`;
}

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
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const markRead = async (id?: string) => {
    await apiFetch("/api/admin/notifications", { method: "POST", json: id ? { id } : {} }).catch(() => {});
    void refresh();
  };

  return (
    <div className="relative" ref={ref}>
      <button className="relative flex size-9 items-center justify-center rounded-xl text-ink-soft hover:bg-cream" onClick={() => setOpen((v) => !v)} aria-label="Уведомления">
        {live.unread ? <BellRing className="size-5 text-wine" /> : <Bell className="size-5" />}
        {live.unread ? (
          <span className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-wine px-1 text-center text-[10px] leading-4 font-semibold text-white tabular-nums" data-testid="bell-count">
            {live.unread > 99 ? "99+" : live.unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-[min(92vw,380px)] overflow-hidden rounded-2xl border border-line bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="text-sm font-semibold">Уведомления</span>
            {live.unread ? (
              <button className="flex items-center gap-1 text-xs text-muted hover:text-ink" onClick={() => markRead()}>
                <CheckCheck className="size-3.5" /> Прочитать все
              </button>
            ) : null}
          </div>
          <div className="max-h-[60vh] divide-y divide-line overflow-y-auto">
            {live.notifications.length === 0 ? <p className="p-6 text-center text-sm text-muted">Пока тихо</p> : null}
            {live.notifications.map((n) => {
              const Icon = kindIcon[n.kind as keyof typeof kindIcon] ?? Bell;
              return (
                <button
                  key={n.id}
                  className={cn("flex w-full gap-3 px-4 py-3 text-left hover:bg-cream/50", !n.read && "bg-rose/40")}
                  onClick={() => {
                    if (!n.read) void markRead(n.id);
                    setOpen(false);
                    if (n.link) router.push(n.link);
                  }}
                >
                  <Icon className={cn("mt-0.5 size-4 shrink-0", n.kind === "sla" || n.kind === "call" ? "text-red-600" : "text-wine")} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{n.title}</span>
                    {n.body ? <span className="line-clamp-2 text-xs text-muted">{n.body}</span> : null}
                  </span>
                  <span className="shrink-0 text-[11px] text-muted">{ago(n.at)}</span>
                </button>
              );
            })}
          </div>
          <PushToggle perm={perm} onPerm={setPerm} />
        </div>
      ) : null}
    </div>
  );
}

/** Карточка входящего звонка поверх CRM: кто звонит и ссылка на сделку/клиента. */
export function IncomingCall() {
  const { live } = useLive();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const calls = live.ringing.filter((c) => !hidden.has(c.id));
  if (!calls.length) return null;
  return (
    <div className="fixed right-4 bottom-4 z-50 flex w-[min(92vw,340px)] flex-col gap-2" role="status" aria-live="polite">
      {calls.map((c) => (
        <div key={c.id} className="animate-pop rounded-2xl border border-emerald-200 bg-white p-4 shadow-xl" data-testid="incoming-call">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 animate-pulse items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <PhoneIncoming className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-xs text-muted">{c.direction === "in" ? (c.mine ? "Звонят вам" : "Входящий звонок") : "Исходящий звонок"}</div>
              <div className="truncate font-semibold">{c.name || c.phone}</div>
              {c.name ? <div className="text-xs text-muted tabular-nums">{c.phone}</div> : <div className="text-xs text-muted">Новый номер — создадим сделку</div>}
            </div>
            <button className="text-muted hover:text-ink" onClick={() => setHidden((s) => new Set(s).add(c.id))} aria-label="Скрыть">
              <X className="size-4" />
            </button>
          </div>
          <div className="mt-3 flex gap-2">
            {c.dealId ? (
              <Link href={`/admin/deals/${c.dealId}`} className="btn btn-sm flex-1">
                Открыть сделку
              </Link>
            ) : null}
            {c.clientId ? (
              <Link href={`/admin/clients/${c.clientId}`} className="btn btn-outline btn-sm flex-1">
                Карточка клиента
              </Link>
            ) : null}
          </div>
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
  useEffect(() => {
    if (!supported) return;
    navigator.serviceWorker.ready.then((reg) => reg.pushManager.getSubscription()).then((sub) => setState(sub ? "on" : "off"), () => setState("off"));
  }, [supported]);
  if (state === "unsupported") {
    return perm === "default" ? (
      <button className="w-full border-t border-line px-4 py-2.5 text-xs text-wine hover:bg-cream/50" onClick={async () => onPerm(await Notification.requestPermission())}>
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
    <button className="w-full border-t border-line px-4 py-2.5 text-xs text-wine hover:bg-cream/50 disabled:opacity-50" disabled={busy} onClick={state === "on" ? disable : enable} data-testid="push-toggle">
      {state === "on" ? "Push на этом устройстве включены · выключить" : "Получать push на этом устройстве (телефон, компьютер)"}
    </button>
  );
}
