"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Crosshair, LifeBuoy, MapPin, SendHorizontal, X } from "lucide-react";
import { useLocalePathname, useMessages } from "@/i18n/client";
import { useKeyboardInset } from "@/hooks/useKeyboardInset";
import { cn } from "@/lib/class-names";
import { Bubble, Chip, EmptyState, HandoffNote, Typing, type HelpMessage } from "./HelpParts";
import { describe, pickTarget, placeChip, type PickedPlace } from "./pick";
import { usePickMode } from "./usePickMode";

import { HELP_OPEN_EVENT } from "./events";

type Outcome = "answered" | "handoff" | "manager" | null;
type FaqKey = keyof ReturnType<typeof useMessages>["help"]["faq"];

const SECTIONS: [RegExp, FaqKey][] = [
  [/\/questions/, "text"],
  [/\/cover/, "cover"],
  [/\/pages/, "pages"],
  [/\/photos/, "photos"],
  [/\/letters/, "letters"],
  [/\/settings/, "settings"],
  [/\/preview/, "preview"],
  [/\/checkout/, "checkout"],
  [/^\/books\/[^/]+\/?$/, "overview"],
];
const sectionOf = (path: string): FaqKey => SECTIONS.find(([re]) => re.test(path))?.[1] ?? "other";

/** Ждём ответа менеджера: книга, по которой задан вопрос (между страницами и после перезагрузки — опрос «нет ли ответа»). */
const WAIT_KEY = "mb_help_wait";
const SEEN_KEY = "mb_help_seen";
const mem = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k) ?? "";
    } catch {
      return "";
    }
  },
  set: (k: string, v: string) => {
    try {
      if (v) localStorage.setItem(k, v);
      else localStorage.removeItem(k);
    } catch {
      /* приватный режим — без памяти */
    }
  },
};

/** Высота нижних панелей страницы ([data-bottom-bar], на телефоне): кнопка помощника встаёт над ними. */
function useBottomBars() {
  const [h, setH] = useState(0);
  useEffect(() => {
    const measure = () => {
      let max = 0;
      for (const el of document.querySelectorAll<HTMLElement>("[data-bottom-bar]")) {
        const r = el.getBoundingClientRect();
        if (r.height && r.top < window.innerHeight) max = Math.max(max, window.innerHeight - r.top);
      }
      setH((prev) => (Math.abs(prev - max) > 1 ? max : prev));
    };
    measure();
    const id = window.setInterval(measure, 800);
    window.addEventListener("resize", measure);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("resize", measure);
    };
  }, []);
  return h;
}

/**
 * Помощник в кабинете книги: кнопка в углу, чат (на телефоне — шторка снизу) и «спросить про это место» — клиент
 * нажимает на любое место кабинета, и вопрос уходит вместе с тем, что это за место. Отвечает модель по справочнику
 * кабинета и данным книги; вопрос о деньгах, сроках или правке — менеджеру, его ответ приходит сюда же.
 */
export function HelpChat({ bookId }: { bookId: string }) {
  const t = useMessages().help;
  const path = useLocalePathname();
  const studio = /\/(questions|cover|pages|photos)(\/|$)/.test(path);
  const [open, setOpen] = useState(false);
  // Открыть из меню профиля в шапке книги (на телефоне в студиях плавающей кнопки нет — она закрывала бы работу).
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(HELP_OPEN_EVENT, show);
    return () => window.removeEventListener(HELP_OPEN_EVENT, show);
  }, []);
  const [loaded, setLoaded] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [whatsapp, setWhatsapp] = useState("");
  const [hints, setHints] = useState<string[]>([]);
  const [messages, setMessages] = useState<HelpMessage[]>([]);
  const [text, setText] = useState("");
  const [place, setPlace] = useState<PickedPlace | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [unread, setUnread] = useState(false);
  const [typingElsewhere, setTypingElsewhere] = useState(false);
  const launcher = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const dragFrom = useRef<number | null>(null);
  const inset = useKeyboardInset();
  const bars = useBottomBars();
  const api = `/api/books/${bookId}/help`;

  const apply = useCallback((list: HelpMessage[]) => {
    setMessages(list);
    const lastManager = [...list].reverse().find((m) => m.from === "manager");
    if (lastManager && lastManager.id !== mem.get(SEEN_KEY)) setUnread(true);
  }, []);

  const load = useCallback(async () => {
    try {
      const r = await fetch(api, { cache: "no-store" });
      if (!r.ok) return;
      const j = (await r.json()) as { enabled: boolean; whatsapp: string; messages: HelpMessage[]; hints: string[] };
      setEnabled(j.enabled);
      setWhatsapp(j.whatsapp);
      setHints(j.hints);
      apply(j.messages);
      setLoaded(true);
    } catch {
      /* нет сети — попробуем при следующем открытии */
    }
  }, [api, apply]);

  // Открыли — забираем беседу; ждём менеджера — опрос: чаще, пока чат открыт.
  const waiting = outcome === "handoff" || outcome === "manager" || mem.get(WAIT_KEY) === bookId || messages.some((m) => m.from === "manager");
  useEffect(() => {
    if (open && !loaded) {
      const id = window.setTimeout(() => void load(), 0);
      return () => window.clearTimeout(id);
    }
  }, [open, loaded, load]);
  useEffect(() => {
    if (!waiting) return;
    const id = window.setInterval(() => document.visibilityState === "visible" && void load(), open ? 6_000 : 45_000);
    return () => window.clearInterval(id);
  }, [waiting, open, load]);

  // Прочитано: последний ответ менеджера виден в открытом чате.
  useEffect(() => {
    if (!open) return;
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: "smooth" });
    const lastManager = [...messages].reverse().find((m) => m.from === "manager");
    if (lastManager) mem.set(SEEN_KEY, lastManager.id);
    const id = window.setTimeout(() => setUnread(false), 0);
    return () => window.clearTimeout(id);
  }, [open, messages, busy]);

  // Телефон: пока клиент печатает в поле кабинета, кнопка не закрывает текст.
  useEffect(() => {
    const update = () => {
      const el = document.activeElement;
      const field = !!el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && !el.closest("[data-help-widget]");
      setTypingElsewhere(field || (el instanceof HTMLElement && el.isContentEditable && !el.closest("[data-help-widget]")));
    };
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", () => setTimeout(update, 50));
    return () => document.removeEventListener("focusin", update);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    requestAnimationFrame(() => launcher.current?.focus());
  }, []);

  const picker = usePickMode({
    onPick: (target) => {
      const el = pickTarget(target);
      if (!el) return false;
      setPlace(describe(el, path));
      setOpen(true);
      requestAnimationFrame(() => input.current?.focus({ preventScroll: true }));
      return true;
    },
    onCancel: () => setOpen(true),
  });

  // Открыли чат — фокус в поле вопроса (на телефоне — нет: клавиатура закрыла бы полэкрана, пока клиент читает).
  useEffect(() => {
    if (!open || picker.active) return;
    const id = requestAnimationFrame(() => {
      if (window.matchMedia("(pointer: fine)").matches) input.current?.focus({ preventScroll: true });
      else document.getElementById("help-title")?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- только при открытии
  }, [open]);

  const send = async (question: string, opts: { human?: boolean; withPlace?: PickedPlace | null } = {}) => {
    const q = question.trim();
    const where = opts.withPlace === undefined ? place : opts.withPlace;
    if (busy || (!q && !where && !opts.human)) return;
    setBusy(true);
    setError(null);
    setSuggestions([]);
    const temp: HelpMessage = { id: `tmp-${Date.now()}`, from: "client", text: q || (opts.human ? t.callHuman : "?"), place: where ? placeChip(where) : "", at: new Date().toISOString() };
    setMessages((m) => [...m, temp]);
    setText("");
    setPlace(null);
    try {
      const r = await fetch(api, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: q || (opts.human ? t.callHuman : ""), place: where ?? undefined, human: opts.human || undefined }) });
      const j = (await r.json().catch(() => ({}))) as { error?: string; outcome?: Outcome; suggestions?: string[]; messages?: HelpMessage[] };
      if (!r.ok || !j.messages) throw new Error(j.error || t.error);
      apply(j.messages);
      setOutcome(j.outcome ?? null);
      setSuggestions(j.suggestions ?? []);
      if (j.outcome === "handoff" || j.outcome === "manager") mem.set(WAIT_KEY, bookId);
    } catch (err) {
      setMessages((m) => m.filter((x) => x.id !== temp.id));
      setText(q);
      setPlace(where);
      setError(err instanceof Error && err.message ? err.message : t.error);
    } finally {
      setBusy(false);
    }
  };

  // Esc закрывает чат (в режиме выбора места Esc — отмена выбора, его ловит usePickMode).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !picker.active && close();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, picker.active, close]);

  const section = sectionOf(path);
  const faq = [...hints.map((h) => t.hints[h as keyof typeof t.hints]).filter(Boolean), ...t.faq[section]].filter((q, i, all) => all.indexOf(q) === i).slice(0, 5);
  const lastBot = [...messages].reverse().find((m) => m.from !== "client");
  const showLauncher = !picker.active && !(typingElsewhere && !open);
  const lift = Math.max(bars, inset);
  // Лента быстрых вопросов над полем: ответ подсказал продолжение — оно, иначе частые вопросы этого раздела.
  const ribbon = busy || place ? [] : suggestions.length ? suggestions : messages.length ? faq : [];

  // Ручка шторки на телефоне: коснуться или потянуть вниз — закрыть.
  const grab = (e: React.PointerEvent<HTMLButtonElement>) => {
    dragFrom.current = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const release = (e: React.PointerEvent<HTMLButtonElement>) => {
    const from = dragFrom.current;
    dragFrom.current = null;
    if (from !== null && e.clientY - from > -8) close();
  };

  return (
    <div data-help-widget className="print:hidden">
      {picker.active ? picker.overlay(t.picking, t.pickingKeys, t.pickCancel, lift) : null}

      {open && !picker.active ? (
        <>
          <button type="button" aria-label={t.close} tabIndex={-1} onClick={close} className="fixed inset-0 z-[55] bg-ink/30 motion-safe:animate-[fade-in_150ms_ease-out] sm:hidden" />
          <section
            role="dialog"
            aria-modal="false"
            aria-labelledby="help-title"
            className="fixed inset-x-0 z-[56] flex h-[min(85dvh,720px)] flex-col overflow-hidden rounded-t-[var(--r-sheet)] border border-line bg-white shadow-lift motion-safe:animate-[sheet-up_220ms_cubic-bezier(.2,.8,.2,1)] sm:inset-x-auto sm:right-4 sm:bottom-20 sm:h-[min(640px,calc(100dvh-7rem))] sm:w-[400px] sm:rounded-[var(--r-sheet)]"
            style={{ bottom: typeof window !== "undefined" && window.innerWidth < 640 ? inset : undefined }}
          >
            <button type="button" aria-label={t.close} onPointerDown={grab} onPointerUp={release} onPointerCancel={() => (dragFrom.current = null)} className="flex h-6 shrink-0 touch-none items-end justify-center pb-1 sm:hidden">
              <span className="h-1 w-10 rounded-full bg-line-strong" aria-hidden />
            </button>
            <header className="flex shrink-0 items-center gap-1 border-b border-line py-2 pr-2 pl-4 max-sm:pt-0 sm:pt-3">
              <div className="min-w-0 flex-1">
                <h2 id="help-title" tabIndex={-1} className="truncate text-[15px] leading-tight font-semibold outline-none">
                  {t.title}
                </h2>
                <p className="truncate text-xs text-muted">{t.subtitle}</p>
              </div>
              <button type="button" onClick={picker.start} className="btn btn-ghost btn-icon shrink-0" aria-label={t.pickButton} title={t.pickButton}>
                <Crosshair className="size-5" aria-hidden />
              </button>
              <button type="button" onClick={close} className="btn btn-ghost btn-icon shrink-0" aria-label={t.close} title={t.close}>
                <X className="size-5" aria-hidden />
              </button>
            </header>

            <div ref={log} role="log" aria-live="polite" aria-busy={busy} className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4">
              {!enabled ? <HandoffNote text={t.off} whatsapp={whatsapp} /> : null}
              {!loaded && !messages.length ? (
                <div className="space-y-3" aria-hidden>
                  <div className="skeleton h-4 w-4/5" />
                  <div className="skeleton h-4 w-full" />
                  <div className="skeleton h-4 w-2/3" />
                </div>
              ) : null}
              {loaded && enabled && !messages.length ? <EmptyState faq={faq} onPick={picker.start} onAsk={(q) => void send(q, { withPlace: null })} /> : null}
              {messages.map((m) => (
                <Bubble key={m.id} m={m} />
              ))}
              {busy ? <Typing /> : null}
              {!busy && outcome === "handoff" ? <HandoffNote text={t.handoff} whatsapp={whatsapp} /> : null}
              {!busy && outcome === "manager" ? <HandoffNote text={t.managerActive} whatsapp="" /> : null}
              {!busy && outcome === "answered" && lastBot?.from === "bot" ? (
                <button type="button" onClick={() => void send("", { human: true, withPlace: null })} className="min-h-11 text-sm text-muted underline decoration-line-strong underline-offset-4 hover:text-wine focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wine">
                  {t.notHelped}
                </button>
              ) : null}
            </div>

            {enabled ? (
              <form
                className="shrink-0 border-t border-line bg-white pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
                onSubmit={(e) => {
                  e.preventDefault();
                  void send(text);
                }}
              >
                {ribbon.length ? (
                  <div className="no-scrollbar mb-2 flex gap-2 overflow-x-auto px-3" role="group" aria-label={t.faqTitle}>
                    {ribbon.map((q) => (
                      <Chip key={q} nowrap onClick={() => void send(q, { withPlace: null })}>
                        {q}
                      </Chip>
                    ))}
                  </div>
                ) : null}
                <div className="px-3">
                  {place ? (
                    <div className="mb-2 rounded-[var(--r-ctl)] border-l-2 border-wine bg-sunken px-3 py-2">
                      <div className="flex items-start gap-2 text-sm">
                        <MapPin className="mt-0.5 size-4 shrink-0 text-wine" aria-hidden />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs text-muted">{t.picked}</div>
                          <div className="line-clamp-2 font-medium text-ink">{placeChip(place)}</div>
                        </div>
                        <button type="button" onClick={() => setPlace(null)} className="-m-1.5 flex size-11 items-center justify-center rounded-[var(--r-ctl)] text-muted hover:bg-white hover:text-ink focus-visible:outline-2 focus-visible:outline-wine" aria-label={t.unpick}>
                          <X className="size-4" aria-hidden />
                        </button>
                      </div>
                      <div className="no-scrollbar -mx-1 mt-1 flex gap-2 overflow-x-auto px-1 pb-0.5">
                        {[t.quick.what, t.quick.how, t.quick.why].map((q) => (
                          <Chip key={q} nowrap onClick={() => void send(q)}>
                            {q}
                          </Chip>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {error ? (
                    <div className="mb-2 flex items-center gap-2 text-sm text-danger" role="alert">
                      <span className="min-w-0 flex-1">{error}</span>
                      <button type="button" onClick={() => void send(text)} disabled={busy || (!text.trim() && !place)} className="btn btn-outline btn-sm shrink-0">
                        {t.retry}
                      </button>
                    </div>
                  ) : null}
                  <div className="flex items-end gap-2">
                    <button type="button" onClick={picker.start} className="btn btn-outline btn-icon shrink-0 text-wine" aria-label={t.pickButton} title={t.pickButton}>
                      <Crosshair className="size-5" aria-hidden />
                    </button>
                    <textarea
                      ref={input}
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                          e.preventDefault();
                          void send(text);
                        }
                      }}
                      rows={1}
                      maxLength={1000}
                      placeholder={t.placeholder}
                      aria-label={t.placeholder}
                      className="input field-sizing-content max-h-32 min-h-11 w-full resize-none py-2.5 text-[16px] leading-snug"
                    />
                    <button type="submit" className="btn btn-primary btn-icon shrink-0" disabled={busy || (!text.trim() && !place)} aria-label={t.send} title={t.send}>
                      <SendHorizontal className="size-5" aria-hidden />
                    </button>
                  </div>
                  <p className="mt-1.5 text-[11px] leading-snug text-muted">{t.disclaimer}</p>
                </div>
              </form>
            ) : null}
          </section>
        </>
      ) : null}

      {showLauncher ? (
        <button
          ref={launcher}
          type="button"
          onClick={() => (open ? close() : setOpen(true))}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label={unread ? `${t.open}. ${t.newReply}` : t.open}
          className={cn(
            // Тихая кнопка: белая, не спорит с главной (винной) кнопкой экрана; на телефоне — квадрат без подписи, чтобы не закрывать текст.
            // В студиях (текст, обложка, страницы, фото) панели доходят до низа экрана — там тоже квадрат, подпись — по наведению.
            "fixed right-3 z-[54] flex size-12 items-center justify-center gap-2 rounded-[var(--r-panel)] border border-line-strong bg-white text-ink shadow-soft transition hover:bg-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wine sm:right-4 sm:bottom-4",
            !studio && "sm:w-auto sm:pr-4 sm:pl-3.5",
            // Телефон, студия: помощник — в меню профиля; кнопка остаётся, только когда ждёт новый ответ.
            studio && !unread && !open && "max-sm:hidden",
            open && "max-sm:hidden",
          )}
          title={studio ? t.button : undefined}
          style={{ bottom: `calc(${lift}px + max(0.75rem, env(safe-area-inset-bottom)))` }}
        >
          {open ? <X className="size-5" aria-hidden /> : <LifeBuoy className="size-5 text-wine" aria-hidden />}
          <span className={cn("text-[15px] font-medium", studio ? "sr-only" : "max-sm:sr-only")}>{t.button}</span>
          {unread && !open ? <span className="absolute -top-1 -right-1 size-3.5 rounded-full border-2 border-white bg-wine" aria-hidden /> : null}
        </button>
      ) : null}
    </div>
  );
}
