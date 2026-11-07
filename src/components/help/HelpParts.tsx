"use client";

import type { ReactNode } from "react";
import { ChevronRight, Crosshair, MapPin, MessageCircle, UserRound } from "lucide-react";
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

/**
 * Сообщение без «пузыря» у помощника: его ответ — просто текст на листе. Ваш вопрос — тихая подложка справа, ответ
 * менеджера — с винной чертой слева и подписью.
 */
export function Bubble({ m }: { m: HelpMessage }) {
  const t = useMessages().help;
  const mine = m.from === "client";
  const manager = m.from === "manager";
  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "text-[15px] leading-relaxed text-ink",
          mine ? "max-w-[85%] rounded-[var(--r-panel)] rounded-br-[4px] bg-sunken px-3.5 py-2.5" : manager ? "max-w-[92%] border-l-2 border-wine pl-3" : "max-w-[94%]",
        )}
      >
        {manager ? (
          <div className="mb-1 flex items-center gap-1 text-xs font-medium text-wine">
            <UserRound className="size-3.5" aria-hidden /> {t.manager}
          </div>
        ) : null}
        {mine && m.place ? (
          <div className="mb-1 flex items-start gap-1 text-xs text-muted">
            <MapPin className="mt-0.5 size-3 shrink-0" aria-hidden />
            <span className="line-clamp-2">{m.place}</span>
          </div>
        ) : null}
        {mine ? <p className="whitespace-pre-wrap">{m.text}</p> : <RichText text={m.text} />}
        <span className="sr-only">{mine ? t.you : manager ? t.manager : t.bot}</span>
      </div>
    </div>
  );
}

/** Три точки, пока модель думает. */
export function Typing() {
  const t = useMessages().help;
  return (
    <div className="flex items-center gap-2 py-1 text-sm text-muted" role="status">
      <span className="flex gap-1" aria-hidden>
        {[0, 150, 300].map((d) => (
          <span key={d} className="size-1.5 rounded-full bg-muted motion-safe:animate-bounce" style={{ animationDelay: `${d}ms` }} />
        ))}
      </span>
      <span className="sr-only">{t.typing}</span>
    </div>
  );
}

/** Пустой чат: что умеет помощник, главное действие «указать на экране» и частые вопросы этого раздела списком. */
export function EmptyState({ faq, onPick, onAsk }: { faq: string[]; onPick: () => void; onAsk: (q: string) => void }) {
  const t = useMessages().help;
  return (
    <div className="space-y-5">
      <p className="text-[15px] leading-relaxed text-ink">{t.hello}</p>
      <button
        type="button"
        onClick={onPick}
        className="flex min-h-14 w-full items-center gap-3 rounded-[var(--r-panel)] border border-line-strong bg-white px-3.5 py-2.5 text-left transition hover:bg-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wine"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-[var(--r-ctl)] bg-rose text-wine">
          <Crosshair className="size-5" aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="block text-[15px] font-medium text-ink">{t.pickCta}</span>
          <span className="block text-[13px] text-muted">{t.pickHint}</span>
        </span>
      </button>
      {faq.length ? (
        <div>
          <h3 className="mb-1 text-xs font-medium text-muted">{t.faqTitle}</h3>
          <ul className="divide-y divide-line border-y border-line">
            {faq.map((q) => (
              <li key={q}>
                <button
                  type="button"
                  onClick={() => onAsk(q)}
                  className="flex min-h-11 w-full items-center justify-between gap-3 py-2 text-left text-[15px] text-ink transition hover:text-wine focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wine"
                >
                  <span className="min-w-0">{q}</span>
                  <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** Быстрый вопрос: в ленте (nowrap — одна строка, лента прокручивается) или в потоке. */
export function Chip({ children, onClick, nowrap }: { children: ReactNode; onClick: () => void; nowrap?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "min-h-11 shrink-0 rounded-[var(--r-ctl)] border border-line-strong bg-white px-3.5 py-1.5 text-left text-sm text-ink transition hover:bg-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wine sm:min-h-9",
        nowrap && "whitespace-nowrap",
      )}
    >
      {children}
    </button>
  );
}

/** Вопрос ушёл менеджеру: где будет ответ и WhatsApp, если удобнее там. */
export function HandoffNote({ text, whatsapp }: { text: string; whatsapp: string }) {
  const t = useMessages().help;
  return (
    <div className="rounded-[var(--r-panel)] bg-warning-bg px-3.5 py-3 text-sm text-warning" role="status">
      <p>{text}</p>
      {whatsapp ? (
        <a
          href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(t.whatsappText)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-outline btn-sm mt-2.5 !text-success"
        >
          <MessageCircle className="size-4" aria-hidden /> {t.whatsapp}
        </a>
      ) : null}
    </div>
  );
}
