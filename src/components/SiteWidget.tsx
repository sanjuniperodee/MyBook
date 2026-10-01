"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, MessageCircle, MessagesSquare, PhoneCall, SendHorizontal, X } from "lucide-react";
import { useMessages } from "@/i18n/client";
import { cn } from "@/lib/utils";

interface Msg {
  id: string;
  mine: boolean;
  text: string;
  at: string;
}

type View = "menu" | "callback" | "chat";

const STARTED_KEY = "mb_chat_started";
const SEEN_KEY = "mb_chat_seen";

function store(key: string, value?: string) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch {
    /* приватный режим — виджет работает и без памяти */
  }
  return null;
}

async function post(url: string, body: unknown): Promise<string | null> {
  try {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (r.ok) return null;
    return ((await r.json().catch(() => ({}))) as { error?: string }).error ?? `${r.status}`;
  } catch {
    return "network";
  }
}

/** Плавающая кнопка на страницах сайта: WhatsApp, «Перезвоните мне» и онлайн-чат с менеджером. */
export function SiteWidget({ whatsapp, chat }: { whatsapp: string; chat: boolean }) {
  const t = useMessages().common.widget;
  const errors = useMessages().common.errors;
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("menu");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [unread, setUnread] = useState(false);
  const [started, setStarted] = useState(() => typeof window !== "undefined" && store(STARTED_KEY) === "1");
  const scroller = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/chat", { cache: "no-store" });
      if (!r.ok) return;
      const { messages: list } = (await r.json()) as { messages: Msg[] };
      setMessages(list);
      const lastReply = [...list].reverse().find((m) => !m.mine);
      if (lastReply && lastReply.at > (store(SEEN_KEY) ?? "")) setUnread(true);
    } catch {
      /* нет сети — попробуем в следующий раз */
    }
  }, []);

  // Ответы менеджера забираем опросом: часто, пока чат открыт, и редко — чтобы показать значок нового ответа.
  useEffect(() => {
    if (!chat || !started) return;
    const first = window.setTimeout(() => void load(), 0);
    const live = open && view === "chat";
    const id = window.setInterval(() => document.visibilityState === "visible" && void load(), live ? 4000 : 30_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [chat, started, open, view, load]);

  useEffect(() => {
    if (!(open && view === "chat")) return;
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
    const last = messages.at(-1);
    if (last) store(SEEN_KEY, last.at);
    const id = window.setTimeout(() => setUnread(false), 0);
    return () => window.clearTimeout(id);
  }, [open, view, messages]);

  const fail = (code: string) => setError(code === "network" ? errors.network : /^\d+$/.test(code) ? errors.generic : code);

  const sendChat = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    setError(null);
    const temp: Msg = { id: `tmp-${Date.now()}`, mine: true, text: body, at: new Date().toISOString() };
    setMessages((m) => [...m, temp]);
    setText("");
    const err = await post("/api/chat", { text: body, phone: phone || undefined, page: location.pathname });
    setBusy(false);
    if (err) {
      setMessages((m) => m.filter((x) => x.id !== temp.id));
      setText(body);
      return fail(err);
    }
    store(STARTED_KEY, "1");
    setStarted(true);
    void load();
  };

  const sendCallback = async (form: FormData) => {
    setBusy(true);
    setError(null);
    const err = await post("/api/chat/callback", { name: form.get("name"), phone: form.get("phone"), comment: form.get("comment") || undefined, page: location.pathname });
    setBusy(false);
    if (err) return fail(err);
    setDone(true);
  };

  const wa = whatsapp ? `https://wa.me/${whatsapp}?text=${encodeURIComponent(t.whatsappText)}` : null;
  const go = (v: View) => {
    setView(v);
    setError(null);
    setDone(false);
  };

  return (
    <div className="fixed right-4 bottom-4 z-40 flex flex-col items-end gap-3 print:hidden" data-testid="site-widget">
      {open ? (
        <div className="flex max-h-[min(560px,calc(100dvh-6rem))] w-[min(360px,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-line bg-white shadow-2xl" role="dialog" aria-label={t.title}>
          <div className="flex items-center gap-2 bg-wine px-4 py-3 text-white">
            {view !== "menu" ? (
              <button type="button" onClick={() => go("menu")} aria-label={t.back} className="-ml-1 rounded-full p-1 hover:bg-white/10">
                <ArrowLeft className="size-5" />
              </button>
            ) : null}
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{view === "callback" ? t.callback : view === "chat" ? t.chat : t.title}</div>
              <div className="truncate text-xs text-white/75">{t.subtitle}</div>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label={t.close} className="rounded-full p-1 hover:bg-white/10">
              <X className="size-5" />
            </button>
          </div>

          {view === "menu" ? (
            <div className="space-y-2 p-4">
              {wa ? (
                <a href={wa} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-2xl border border-line px-4 py-3 hover:border-emerald-300 hover:bg-emerald-50">
                  <MessageCircle className="size-5 text-emerald-600" /> {t.whatsapp}
                </a>
              ) : null}
              <button type="button" onClick={() => go("callback")} className="flex w-full items-center gap-3 rounded-2xl border border-line px-4 py-3 text-left hover:border-wine/30 hover:bg-rose/30">
                <PhoneCall className="size-5 text-wine" /> {t.callback}
              </button>
              {chat ? (
                <button type="button" onClick={() => go("chat")} className="flex w-full items-center gap-3 rounded-2xl border border-line px-4 py-3 text-left hover:border-wine/30 hover:bg-rose/30">
                  <MessagesSquare className="size-5 text-wine" /> {t.chat}
                  {unread ? <span className="ml-auto rounded-full bg-wine px-2 py-0.5 text-[11px] text-white">{t.newReply}</span> : null}
                </button>
              ) : null}
            </div>
          ) : null}

          {view === "callback" ? (
            done ? (
              <p className="p-5 text-sm" data-testid="callback-done">
                {t.callbackDone}
              </p>
            ) : (
              <form action={sendCallback} className="space-y-3 p-4">
                <input name="name" className="input h-11" placeholder={t.name} maxLength={80} autoComplete="name" aria-label={t.name} />
                <input name="phone" className="input h-11" placeholder={t.phone} type="tel" inputMode="tel" autoComplete="tel" required maxLength={30} aria-label={t.phone} />
                <input name="comment" className="input h-11" placeholder={t.comment} maxLength={500} aria-label={t.comment} />
                {error ? <p className="text-sm text-red-700">{error}</p> : null}
                <button className="btn w-full" disabled={busy}>
                  {busy ? t.sending : t.send}
                </button>
              </form>
            )
          ) : null}

          {view === "chat" ? (
            <>
              <div ref={scroller} className="min-h-48 flex-1 space-y-2 overflow-y-auto bg-[#f4efe7] p-3" data-testid="widget-messages">
                <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-white px-3 py-2 text-sm shadow-sm">{t.chatHello}</div>
                {messages.map((m) => (
                  <div key={m.id} className={cn("flex", m.mine ? "justify-end" : "justify-start")}>
                    <div className={cn("max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap shadow-sm", m.mine ? "rounded-br-md bg-wine text-white" : "rounded-bl-md bg-white")} data-mine={m.mine ? "1" : "0"}>
                      {!m.mine ? <div className="mb-0.5 text-[11px] text-muted">{t.manager}</div> : null}
                      {m.text}
                    </div>
                  </div>
                ))}
              </div>
              <div className="space-y-2 border-t border-line p-3">
                {!started ? <input className="input h-9 text-sm" placeholder={t.chatPhone} value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="tel" maxLength={30} aria-label={t.chatPhone} /> : null}
                {error ? <p className="text-xs text-red-700">{error}</p> : null}
                <div className="flex items-end gap-2">
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        void sendChat();
                      }
                    }}
                    rows={1}
                    maxLength={2000}
                    placeholder={t.chatPlaceholder}
                    aria-label={t.chatPlaceholder}
                    className="max-h-32 min-h-10 w-full resize-none rounded-xl border border-line bg-[#fbf9f5] px-3 py-2 text-sm outline-none field-sizing-content focus:border-wine/40"
                  />
                  <button type="button" className="btn size-10 shrink-0 px-0" onClick={() => void sendChat()} disabled={busy || !text.trim()} aria-label={t.send}>
                    <SendHorizontal className="size-5" />
                  </button>
                </div>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative flex size-14 items-center justify-center rounded-full bg-wine text-white shadow-xl transition hover:scale-105 hover:bg-wine/90"
        aria-label={open ? t.close : t.open}
        aria-expanded={open}
      >
        {open ? <X className="size-6" /> : <MessagesSquare className="size-6" />}
        {!open && unread ? <span className="absolute top-1 right-1 size-3 rounded-full border-2 border-white bg-emerald-500" /> : null}
      </button>
    </div>
  );
}
