"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Headphones, LoaderCircle, PhoneIncoming, PhoneOutgoing, Square } from "lucide-react";
import { toast } from "@/components/ui/overlays";
import { apiFetch } from "@/lib/client-api";
import { cn } from "@/lib/class-names";
import { CallAudioError, ListenAudio, type ListenEvent } from "@/components/admin/wa-call/engine";

interface LiveCall {
  id: string;
  callId: string;
  direction: "in" | "out";
  staff: string;
  client: string;
  clientId: string | null;
  dealId: string | null;
  since: string;
}

/** Список идущих разговоров обновляется так часто: новый разговор появляется почти сразу. */
const POLL_MS = 5_000;

const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * «Идут сейчас» в «Звонках»: разговоры WhatsApp сотрудников в эту минуту и прослушка любого из них руководителем —
 * голос сотрудника и клиента вместе, только приём (сказать в разговор ничего нельзя). Показывается, только пока есть
 * разговоры; одна прослушка за раз; разговор кончился — прослушка закрывается сама.
 */
export function LiveCalls() {
  const [calls, setCalls] = useState<LiveCall[]>([]);
  const [listening, setListening] = useState<{ call: LiveCall; state: "connecting" | "live" | "reconnecting" | "ended" } | null>(null);
  const [levels, setLevels] = useState({ agent: 0, peer: 0 });
  const [now, setNow] = useState(() => Date.now());
  const audio = useRef<ListenAudio | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await apiFetch<{ calls: LiveCall[] }>("/api/admin/calls/whatsapp/live", { cache: "no-store" });
      setCalls(r.calls);
    } catch {
      // сеть моргнула — следующий опрос повторит
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    const poll = setInterval(() => document.visibilityState === "visible" && void load(), POLL_MS);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearTimeout(first);
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [load]);

  const stop = useCallback(() => {
    audio.current?.close();
    audio.current = null;
    setListening(null);
    setLevels({ agent: 0, peer: 0 });
  }, []);

  useEffect(() => () => audio.current?.close(), []);

  const listen = (call: LiveCall) => {
    // AudioContext — прямо в обработчике нажатия, до первого await.
    const opening = ListenAudio.open();
    audio.current?.close();
    setListening({ call, state: "connecting" });
    void (async () => {
      let a: ListenAudio;
      try {
        a = await opening;
      } catch (err) {
        setListening(null);
        return void toast(err instanceof CallAudioError ? err.message : "Не удалось включить звук", "error");
      }
      audio.current = a;
      a.connect(call.callId, (e: ListenEvent) => {
        switch (e.type) {
          case "level":
            setLevels({ agent: e.agent, peer: e.peer });
            return setListening((l) => (l && l.state !== "live" ? { ...l, state: "live" } : l));
          case "reconnecting":
            return setListening((l) => (l ? { ...l, state: "reconnecting" } : l));
          case "connected":
            return setListening((l) => (l ? { ...l, state: "live" } : l));
          case "lost":
            toast("Не удалось подключиться к разговору — возможно, он уже закончился", "error");
            void load();
            return stop();
          case "ended":
            setListening((l) => (l ? { ...l, state: "ended" } : l));
            void load();
            setTimeout(stop, 2000);
            return;
        }
      });
    })();
  };

  if (!calls.length && !listening) return null;
  return (
    <section className="panel overflow-hidden" data-testid="live-calls" aria-label="Разговоры сейчас">
      <header className="panel-head">
        <h2 className="panel-title flex items-center gap-2">
          <span className="relative flex size-2.5" aria-hidden>
            <span className="absolute inset-0 animate-ping rounded-full bg-success/50" />
            <span className="relative size-2.5 rounded-full bg-success" />
          </span>
          Идут сейчас <span className="font-normal text-muted tabular-nums">{calls.length}</span>
        </h2>
        <span className="text-xs text-muted">Прослушка — только приём, вас не слышно</span>
      </header>
      <ul className="divide-y divide-line">
        {calls.map((c) => {
          const active = listening?.call.id === c.id;
          return (
            <li key={c.id} className={cn("flex min-h-14 items-center gap-3 px-4 py-2.5 sm:px-5", active && "bg-success-bg/50")}>
              <span className="flex size-8 shrink-0 items-center justify-center rounded-[var(--r-ctl)] bg-success-bg text-success" title={c.direction === "in" ? "Входящий" : "Исходящий"}>
                {c.direction === "in" ? <PhoneIncoming className="size-4" strokeWidth={1.8} /> : <PhoneOutgoing className="size-4" strokeWidth={1.8} />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {c.staff} <span className="font-normal text-muted" aria-label={c.direction === "in" ? "принял звонок от" : "звонит"}>—</span>{" "}
                  {c.dealId ? (
                    <Link href={`/admin/deals/${c.dealId}`} className="hover:underline">
                      {c.client}
                    </Link>
                  ) : c.clientId ? (
                    <Link href={`/admin/clients/${c.clientId}`} className="hover:underline">
                      {c.client}
                    </Link>
                  ) : (
                    c.client
                  )}
                </div>
                <div className="text-xs text-muted tabular-nums">WhatsApp, {clock(now - new Date(c.since).getTime())}</div>
              </div>
              {active ? (
                <button type="button" className="btn btn-outline btn-sm" onClick={stop} data-testid="listen-stop">
                  <Square className="size-3.5" fill="currentColor" /> Остановить
                </button>
              ) : (
                <button type="button" className="btn btn-dark btn-sm" onClick={() => listen(c)} data-testid="listen-start">
                  <Headphones className="size-4" /> Слушать
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {listening ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line bg-sunken/60 px-4 py-2.5 text-xs sm:px-5" data-testid="listen-panel" data-state={listening.state} role="status">
          <span className="flex items-center gap-1.5 font-medium">
            {listening.state === "connecting" || listening.state === "reconnecting" ? <LoaderCircle className="size-3.5 animate-spin" /> : <Headphones className="size-3.5" />}
            {listening.state === "connecting" ? "Подключаемся к разговору…" : listening.state === "reconnecting" ? "Восстанавливаем связь…" : listening.state === "ended" ? "Разговор закончился" : "Слушаете разговор"}
          </span>
          <Speaker label={listening.call.staff} level={levels.agent} />
          <Speaker label={listening.call.client} level={levels.peer} />

        </div>
      ) : null}
    </section>
  );
}

/** Кто говорит: точка загорается от громкости стороны. */
function Speaker({ label, level }: { label: string; level: number }) {
  const on = level > 0.02;
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className={cn("size-2 shrink-0 rounded-full transition-colors", on ? "bg-success" : "bg-line-strong")} aria-hidden />
      <span className={cn("truncate", on ? "text-ink" : "text-muted")}>{label}</span>
    </span>
  );
}
