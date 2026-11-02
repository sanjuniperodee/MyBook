"use client";

import type { ReactNode } from "react";
import { Crosshair, MapPin, MessageCircle, UserRound } from "lucide-react";
import { useMessages } from "@/i18n/client";
import { cn } from "@/lib/class-names";

export interface HelpMessage {
  id: string;
  from: "client" | "bot" | "manager";
  text: string;
  /** Строка «где клиент» у вопроса (без значка). */
  place: string;
  at: string;
}

/** **жирный** внутри строки — как в ответах книги. */
function inline(s: string, key: string): ReactNode[] {
  return s.split(/(\*\*[^*\n]+\*\*)/g).map((part, i) => (part.startsWith("**") && part.endsWith("**") && part.length > 4 ? <strong key={`${key}-${i}`}>{part.slice(2, -2)}</strong> : part));
}

/** Ответ помощника: абзацы и шаги «1. …» — списком (модель пишет шаги с новой строки). */
export function RichText({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = (k: number) => {
    if (!list.length) return;
    blocks.push(
      <ol key={`ol-${k}`} className="my-1 list-decimal space-y-1 pl-5 marker:text-muted">
        {list.map((li, i) => (
          <li key={i}>{inline(li, `li-${k}-${i}`)}</li>
        ))}
      </ol>,
    );
    list = [];
  };
  text.split("\n").forEach((line, i) => {
    const step = line.match(/^\s*\d{1,2}[.)]\s+(.*)$/);
    const bullet = line.match(/^\s*[-•]\s+(.*)$/);
    if (step) return void list.push(step[1]);
    flush(i);
    if (bullet) blocks.push(<p key={i} className="pl-3 before:mr-1.5 before:content-['•']">{inline(bullet[1], `b-${i}`)}</p>);
    else if (line.trim()) blocks.push(<p key={i}>{inline(line, `p-${i}`)}</p>);
  });
  flush(-1);
  return <div className="space-y-1.5">{blocks}</div>;
}

export function Bubble({ m }: { m: HelpMessage }) {
  const t = useMessages().help;
  const mine = m.from === "client";
  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[15px] leading-relaxed shadow-sm", mine ? "rounded-br-md bg-wine text-white" : "rounded-bl-md bg-white text-ink ring-1 ring-line/70")}>
        {m.from === "manager" ? (
          <div className="mb-1 flex items-center gap-1 text-xs font-medium text-wine">
            <UserRound className="size-3.5" aria-hidden /> {t.manager}
          </div>
        ) : null}
        {mine && m.place ? (
          <div className="mb-1 flex items-start gap-1 text-xs text-white/80">
            <MapPin className="mt-0.5 size-3 shrink-0" aria-hidden />
            <span className="line-clamp-2">{m.place}</span>
          </div>
        ) : null}
        {mine ? <p className="whitespace-pre-wrap">{m.text}</p> : <RichText text={m.text} />}
        <span className="sr-only">{mine ? t.you : m.from === "manager" ? t.manager : t.bot}</span>
      </div>
    </div>
  );
}

/** Три точки, пока модель думает. */
export function Typing() {
  const t = useMessages().help;
  return (
    <div className="flex justify-start" role="status">
      <div className="flex items-center gap-2 rounded-2xl rounded-bl-md bg-white px-3.5 py-3 text-sm text-muted ring-1 ring-line/70">
        <span className="flex gap-1" aria-hidden>
          {[0, 150, 300].map((d) => (
            <span key={d} className="size-1.5 rounded-full bg-muted/70 motion-safe:animate-bounce" style={{ animationDelay: `${d}ms` }} />
          ))}
        </span>
        <span className="sr-only">{t.typing}</span>
      </div>
    </div>
  );
}

/** Пустой чат: что умеет помощник, главное действие «указать на экране» и частые вопросы этого раздела. */
export function EmptyState({ faq, onPick, onAsk }: { faq: string[]; onPick: () => void; onAsk: (q: string) => void }) {
  const t = useMessages().help;
  return (
    <div className="space-y-4">
      <div className="rounded-2xl rounded-bl-md bg-white px-3.5 py-2.5 text-[15px] leading-relaxed text-ink ring-1 ring-line/70">{t.hello}</div>
      <button type="button" onClick={onPick} className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-wine/35 bg-rose/40 px-4 py-3 text-left transition hover:border-wine/60 hover:bg-rose/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wine">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-wine shadow-sm">
          <Crosshair className="size-5" aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="block font-medium text-ink">{t.pickCta}</span>
          <span className="block text-sm text-muted">{t.pickHint}</span>
        </span>
      </button>
      {faq.length ? (
        <div>
          <h3 className="mb-2 text-xs font-semibold tracking-[0.14em] text-muted uppercase">{t.faqTitle}</h3>
          <div className="flex flex-wrap gap-2">
            {faq.map((q) => (
              <Chip key={q} onClick={() => onAsk(q)}>
                {q}
              </Chip>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function Chip({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="min-h-9 rounded-full border border-line bg-white px-3.5 py-1.5 text-left text-sm text-ink transition hover:border-wine/40 hover:bg-cream/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wine">
      {children}
    </button>
  );
}

/** Вопрос ушёл менеджеру: где будет ответ и WhatsApp, если удобнее там. */
export function HandoffNote({ text, whatsapp }: { text: string; whatsapp: string }) {
  const t = useMessages().help;
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-900" role="status">
      <p>{text}</p>
      {whatsapp ? (
        <a
          href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(t.whatsappText)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-full bg-white px-3 py-1.5 font-medium text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-50"
        >
          <MessageCircle className="size-4" aria-hidden /> {t.whatsapp}
        </a>
      ) : null}
    </div>
  );
}
