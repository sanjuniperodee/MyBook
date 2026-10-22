"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Mic, MicOff, PhoneIncoming, PhoneOff } from "lucide-react";
import { toast } from "@/components/ui/overlays";
import { whatsappAnswerAction, whatsappDialAction, type WhatsappCallStart } from "@/app/admin/crm-actions";
import { apiFetch } from "@/lib/client-api";
import { cn } from "@/lib/class-names";
import { CallAudio, CallAudioError, type CallAudioEvent } from "./wa-call/engine";
import { playRing } from "./sound";

type Target = { clientId?: string; dealId?: string; orderId?: string; callId?: string };

/** Вкладка отмечается на сервере раз в 15 с (WHATSAPP_HEARTBEAT_MS в контексте «Телефония»). */
const HEARTBEAT_MS = 15_000;
/** Столько ждём, пока собеседник возьмёт трубку; WhatsApp обычно сбрасывает раньше сам. */
const RING_LIMIT_MS = 75_000;
/** Итог звонка висит на панели, потом панель закрывается. */
const SUMMARY_MS = 2_500;

type Phase = "preparing" | "ringing" | "talking" | "reconnecting" | "ended";

interface ActiveCall {
  /** id звонка в журнале CRM; пусто, пока звонок не начат. */
  id: string;
  callId: string;
  direction: "in" | "out";
  title: string;
  phone: string;
  clientId: string | null;
  dealId: string | null;
  phase: Phase;
  talkingSince: number | null;
  /** Итог для панели после конца: «Звонок завершён», «Не отвечает», «Связь пропала». */
  outcome: string | null;
}

interface WhatsappCallApi {
  enabled: boolean;
  busy: boolean;
  dial(target: Target, title?: string): void;
  /** true — разговор начался (микрофон есть, сервер принял ответ). */
  answer(id: string, title: string): Promise<boolean>;
  decline(id: string): Promise<void>;
}

const Ctx = createContext<WhatsappCallApi | null>(null);

/** Звонки WhatsApp в CRM (null — выключены или нет права на звонки). */
export function useWhatsappCall() {
  const api = useContext(Ctx);
  return api?.enabled ? api : null;
}

const send = (id: string, op: "heartbeat" | "connected" | "hangup" | "ended", extra: { talking?: boolean } = {}) => apiFetch<{ live: boolean }>(`/api/admin/calls/whatsapp/${id}`, { method: "POST", json: { op, ...extra } });

/** «Собеседник ответил» — с повторами: потерянная отметка превратила бы разговор в недозвон (её дублируют и отметки «на связи»). */
async function sendConnected(id: string) {
  for (const wait of [0, 1_000, 3_000, 7_000]) {
    if (wait) await new Promise((r) => setTimeout(r, wait));
    try {
      await send(id, "connected");
      return;
    } catch {
      // сеть моргнула — повторим
    }
  }
}

/**
 * Вкладку закрывают или уходят из CRM посреди звонка — трубку кладёт сервер по запросу, который браузер доотправит сам.
 * Chrome иногда теряет один такой запрос при выгрузке страницы, поэтому их два (повтор безвреден); не дошли оба — звонок
 * закроет планировщик по отметкам вкладки.
 */
function hangupOnLeave(id: string) {
  const url = `/api/admin/calls/whatsapp/${id}`;
  const body = JSON.stringify({ op: "hangup" });
  navigator.sendBeacon(url, new Blob([body], { type: "text/plain" }));
  void fetch(url, { method: "POST", body, keepalive: true }).catch(() => {});
}

const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * Звонки WhatsApp прямо из CRM: набрать клиента («WhatsApp» рядом с «Позвонить») и ответить на входящий (карточка звонка).
 * Голос идёт через шлюз номера магазина, звук — через микрофон и динамик браузера; панель звонка живёт поверх CRM и
 * переживает переходы между страницами. Закрыли вкладку — трубка кладётся сама.
 */
export function WhatsappCallProvider({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  const router = useRouter();
  const [call, setCallState] = useState<ActiveCall | null>(null);
  const [muted, setMuted] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const audio = useRef<CallAudio | null>(null);
  const lastBeat = useRef(0);
  /** Панель ещё на странице: ушли из CRM, пока включался микрофон или сервер набирал номер, — звонок не продолжаем. */
  const mounted = useRef(true);
  // Текущий звонок нужен обработчикам звука и таймеров сразу, не дожидаясь отрисовки, — ref меняется вместе с состоянием.
  const callRef = useRef<ActiveCall | null>(null);
  const setCall = useCallback((next: ActiveCall | null | ((c: ActiveCall | null) => ActiveCall | null)) => {
    callRef.current = typeof next === "function" ? next(callRef.current) : next;
    setCallState(callRef.current);
  }, []);

  const patch = useCallback((p: Partial<ActiveCall>) => setCall((c) => (c ? { ...c, ...p } : c)), [setCall]);

  /** Конец звонка с любой стороны: звук выключить, журнал закрыть, итог показать и убрать панель. */
  const finish = useCallback(
    (outcome: string, op: "hangup" | "ended" | null) => {
      const c = callRef.current;
      if (!c || c.phase === "ended") return;
      audio.current?.close();
      audio.current = null;
      setMuted(false);
      setMicLevel(0);
      const talked = c.talkingSince ? ` · ${clock(Date.now() - c.talkingSince)}` : "";
      patch({ phase: "ended", outcome: `${outcome}${talked}` });
      if (op && c.id) void send(c.id, op).catch(() => {});
      setTimeout(() => {
        setCall((now) => (now && now.id === c.id && now.phase === "ended" ? null : now));
        router.refresh();
      }, SUMMARY_MS);
    },
    [patch, router, setCall],
  );

  /** «На связи»; сервер ответил, что звонка нет (закрыт с другой стороны), — закрываем и панель. */
  const beat = useCallback(
    (id: string) => {
      lastBeat.current = Date.now();
      void send(id, "heartbeat", { talking: !!callRef.current?.talkingSince })
        .then((r) => {
          if (!r.live && callRef.current?.id === id) finish("Звонок завершён", null);
        })
        .catch(() => {});
    },
    [finish],
  );

  const onAudio = useCallback(
    (e: CallAudioEvent) => {
      const c = callRef.current;
      if (!c) return;
      switch (e.type) {
        case "peer":
          if (c.phase !== "ringing") return;
          audio.current?.ringback(false);
          patch({ phase: "talking", talkingSince: Date.now() });
          void sendConnected(c.id);
          return;
        case "ended":
          return finish(c.talkingSince ? "Звонок завершён" : c.direction === "out" ? "Не отвечает" : "Звонок завершён", "ended");
        case "lost":
          toast("Связь со звонком пропала — звонок завершён", "error");
          return finish("Связь пропала", "hangup");
        case "reconnecting":
          return patch({ phase: "reconnecting" });
        case "connected":
          return patch({ phase: c.talkingSince ? "talking" : "ringing" });
        case "level":
          // Отметка «на связи» — от потока микрофона: таймеры фоновой вкладки Chrome через 5 минут троттлит до раза в минуту,
          // а события звука идут всегда. Таймер ниже — запасной.
          if (c.id && c.phase !== "ended" && Date.now() - lastBeat.current >= HEARTBEAT_MS) beat(c.id);
          return setMicLevel(e.value);
      }
    },
    [beat, finish, patch],
  );

  /** Общий путь набора и ответа: микрофон до запроса к серверу (без него звонок не начинаем), потом звук к звонку. */
  const begin = useCallback(
    (direction: "in" | "out", title: string, start: () => Promise<WhatsappCallStart>): Promise<boolean> => {
      if (callRef.current) {
        toast("Сначала завершите текущий звонок", "error");
        return Promise.resolve(false);
      }
      // AudioContext — прямо в обработчике нажатия, до первого await: иначе браузер не даст звук.
      const opening = CallAudio.open();
      setCall({ id: "", callId: "", direction, title, phone: "", clientId: null, dealId: null, phase: "preparing", talkingSince: null, outcome: null });
      return (async () => {
        let a: CallAudio;
        try {
          a = await opening;
        } catch (err) {
          setCall(null);
          toast(err instanceof CallAudioError ? err.message : "Не удалось включить микрофон", "error");
          return false;
        }
        if (!mounted.current) {
          a.close();
          return false;
        }
        let r: WhatsappCallStart;
        try {
          r = await start();
        } catch {
          r = { ok: false, message: "Не удалось начать звонок — проверьте связь" };
        }
        if (!mounted.current) {
          a.close();
          if (r.ok) hangupOnLeave(r.id);
          return false;
        }
        if (!r.ok) {
          a.close();
          setCall(null);
          toast(r.message, "error");
          return false;
        }
        audio.current = a;
        const answered = direction === "in";
        setCall({ id: r.id, callId: r.callId, direction, title: r.title, phone: r.phone, clientId: r.clientId, dealId: r.dealId, phase: answered ? "talking" : "ringing", talkingSince: answered ? Date.now() : null, outcome: null });
        if (!answered) a.ringback(true);
        a.connect(r.callId, onAudio);
        return true;
      })();
    },
    [onAudio, setCall],
  );

  const dial = useCallback((target: Target, title = "Клиент") => void begin("out", title, () => whatsappDialAction(target)), [begin]);
  const answer = useCallback((id: string, title: string) => begin("in", title, () => whatsappAnswerAction(id)), [begin]);
  const decline = useCallback(async (id: string) => {
    try {
      await send(id, "hangup");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Не удалось отклонить звонок", "error");
    }
  }, []);
  const hangup = useCallback(() => finish(callRef.current?.talkingSince ? "Звонок завершён" : "Звонок отменён", "hangup"), [finish]);

  // Пока идёт звонок: «на связи» раз в 15 с (сервер закрыл звонок — закрываем и мы), лимит гудков, защита от закрытия вкладки.
  const id = call?.phase === "ended" ? "" : (call?.id ?? "");
  useEffect(() => {
    if (!id) return;
    lastBeat.current = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - lastBeat.current >= HEARTBEAT_MS) beat(id);
    }, HEARTBEAT_MS / 3);
    const ring = setTimeout(() => {
      if (callRef.current?.id === id && !callRef.current.talkingSince) finish("Не отвечает", "hangup");
    }, RING_LIMIT_MS);
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    const gone = () => hangupOnLeave(id);
    window.addEventListener("beforeunload", warn);
    window.addEventListener("pagehide", gone);
    return () => {
      clearInterval(timer);
      clearTimeout(ring);
      window.removeEventListener("beforeunload", warn);
      window.removeEventListener("pagehide", gone);
    };
  }, [id, beat, finish]);

  // Ушли из CRM (на витрину) посреди звонка — звук выключается вместе с панелью, поэтому и трубку кладём.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const c = callRef.current;
      if (c?.id && c.phase !== "ended") hangupOnLeave(c.id);
      audio.current?.close();
    };
  }, []);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    audio.current?.setMuted(next);
  };

  return (
    <Ctx.Provider value={{ enabled, busy: !!call, dial, answer, decline }}>
      {children}
      {call ? <CallPanel call={call} muted={muted} micLevel={micLevel} onMute={toggleMute} onHangup={hangup} /> : null}
    </Ctx.Provider>
  );
}

function CallPanel({ call, muted, micLevel, onMute, onHangup }: { call: ActiveCall; muted: boolean; micLevel: number; onMute: () => void; onHangup: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!call.talkingSince || call.phase === "ended") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [call.talkingSince, call.phase]);
  const status =
    call.phase === "preparing"
      ? "Включаем микрофон…"
      : call.phase === "ringing"
        ? call.id
          ? "Звоним…"
          : "Соединяем…"
        : call.phase === "reconnecting"
          ? "Восстанавливаем связь…"
          : call.phase === "ended"
            ? call.outcome
            : clock(now - (call.talkingSince ?? now));
  const link = call.dealId ? `/admin/deals/${call.dealId}` : call.clientId ? `/admin/clients/${call.clientId}` : null;
  const live = call.phase !== "ended";
  return (
    <div
      role="dialog"
      aria-label="Звонок WhatsApp"
      data-testid="wa-call-panel"
      data-phase={call.phase}
      className="animate-pop fixed inset-x-3 bottom-[calc(var(--tabbar-h,0px)+0.75rem)] z-[60] rounded-3xl border border-line bg-white p-4 shadow-lift lg:right-4 lg:bottom-4 lg:left-auto lg:w-80"
    >
      <div className="flex items-center gap-3">
        <span className={cn("relative flex size-11 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700", call.phase === "ringing" && "animate-pulse")}>
          <WaIcon className="size-5" />
          {live && !muted && micLevel > 0.02 ? <span className="absolute -inset-1 rounded-full border-2 border-emerald-400/70" style={{ opacity: Math.min(1, micLevel * 8) }} aria-hidden /> : null}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted">{call.direction === "in" ? "Входящий WhatsApp" : "Звонок WhatsApp"}</div>
          {link ? (
            <Link href={link} className="block truncate font-semibold hover:underline">
              {call.title}
            </Link>
          ) : (
            <div className="truncate font-semibold">{call.title}</div>
          )}
          <div className="truncate text-sm text-muted tabular-nums" data-testid="wa-call-status">
            {call.phone ? `${call.phone} · ` : ""}
            {status}
          </div>
        </div>
      </div>
      {live ? (
        <div className="mt-3 flex gap-2">
          <button type="button" className={cn("btn flex-1", muted ? "btn-primary" : "btn-outline")} onClick={onMute} disabled={call.phase === "preparing"} aria-pressed={muted} data-testid="wa-call-mute">
            {muted ? <MicOff className="size-4" /> : <Mic className="size-4" />} {muted ? "Микрофон выкл." : "Микрофон"}
          </button>
          <button type="button" className="btn flex-1 bg-[#dc2626] text-white hover:bg-[#b91c1c]" onClick={onHangup} disabled={call.phase === "preparing" && !call.id} data-testid="wa-call-hangup">
            <PhoneOff className="size-4" /> Завершить
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Значок WhatsApp (в lucide его нет). */
export function WaIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12.04 2a9.9 9.9 0 0 0-8.43 15.09L2 22l5.05-1.32A9.9 9.9 0 1 0 12.04 2Zm0 18.1a8.2 8.2 0 0 1-4.18-1.14l-.3-.18-3 .78.8-2.92-.2-.3a8.2 8.2 0 1 1 6.88 3.76Zm4.5-6.13c-.25-.12-1.46-.72-1.69-.8-.22-.08-.39-.12-.55.12-.16.25-.63.8-.78.96-.14.16-.28.18-.53.06a6.7 6.7 0 0 1-3.3-2.88c-.25-.43.25-.4.72-1.33.08-.16.04-.3-.02-.42-.06-.12-.55-1.33-.76-1.82-.2-.48-.4-.41-.55-.42h-.47c-.16 0-.43.06-.65.3-.22.25-.86.84-.86 2.05s.88 2.38 1 2.55c.12.16 1.73 2.64 4.2 3.7 1.55.67 2.16.73 2.94.61.47-.07 1.46-.6 1.66-1.18.2-.58.2-1.07.14-1.18-.06-.1-.22-.16-.47-.28Z" />
    </svg>
  );
}

/** «WhatsApp» рядом с «Позвонить»: звонок клиенту в WhatsApp прямо из CRM. Звонки выключены — кнопки нет. */
export function WhatsappCallButton({ target, title, className, label = "WhatsApp", plain = false }: { target: Target; title?: string; className?: string; label?: string; plain?: boolean }) {
  const wa = useWhatsappCall();
  if (!wa) return null;
  return (
    <button type="button" className={cn(!plain && "btn btn-outline btn-sm", "inline-flex items-center gap-1", className)} disabled={wa.busy} aria-label="Позвонить в WhatsApp" title={wa.busy ? "Сначала завершите текущий звонок" : undefined} data-testid="wa-call-button" onClick={() => wa.dial(target, title)}>
      <WaIcon className="size-4 text-emerald-600" /> {label}
    </button>
  );
}

/**
 * Входящие WhatsApp звонят в CRM: трель раз в 3 с, пока есть звонящий и сотрудник не занят разговором, а если вкладка в
 * фоне — системное уведомление (один раз на звонок).
 */
export function useWhatsappRing(calls: { id: string; title: string }[]) {
  const wa = useWhatsappCall();
  const ringing = !!wa && !wa.busy && calls.length > 0;
  const shown = useRef(new Set<string>());
  const first = calls[0];
  useEffect(() => {
    if (!ringing) return;
    playRing();
    const t = setInterval(playRing, 3000);
    return () => clearInterval(t);
  }, [ringing]);
  useEffect(() => {
    if (!wa || !first || shown.current.has(first.id) || document.visibilityState === "visible") return;
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    shown.current.add(first.id);
    const note = new Notification("Входящий звонок WhatsApp", { body: first.title, tag: `wa-call-${first.id}` });
    note.onclick = () => window.focus();
  }, [wa, first]);
}

/** Кнопки «Ответить» / «Отклонить» на карточке входящего звонка WhatsApp. */
export function WhatsappIncomingActions({ id, title, onDone }: { id: string; title: string; onDone: () => void }) {
  const wa = useWhatsappCall();
  const [declining, setDeclining] = useState(false);
  if (!wa) return null;
  return (
    <div className="mt-3 flex gap-2">
      <button
        type="button"
        className="btn btn-sm flex-1 bg-[#16a34a] text-white hover:bg-[#15803d]"
        disabled={wa.busy}
        data-testid="wa-call-answer"
        onClick={async () => {
          // Карточка убирается, только когда разговор начался: нет микрофона или сбой — можно ответить ещё раз.
          if (await wa.answer(id, title)) onDone();
        }}
      >
        <PhoneIncoming className="size-4" /> Ответить
      </button>
      <button
        type="button"
        className="btn btn-outline btn-sm flex-1"
        disabled={declining}
        data-testid="wa-call-decline"
        onClick={async () => {
          setDeclining(true);
          await wa.decline(id);
          onDone();
        }}
      >
        <PhoneOff className="size-4" /> Отклонить
      </button>
    </div>
  );
}
