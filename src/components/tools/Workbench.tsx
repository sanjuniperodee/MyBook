"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { Link, useMessages } from "@/i18n/client";
import { cn } from "@/lib/class-names";

/**
 * Рабочий лист инструмента (витрина, бумага): слева — ввод, справа — живой результат, внизу — «Сделать из этого книгу».
 * На телефоне результат идёт сразу под вводом; на ноутбуке правая колонка липкая и остаётся на виду, пока
 * заполняется длинный ввод. Каждый инструмент собирает из этих частей свою композицию (см. tools/*.tsx).
 */

interface ToolCta {
  href: string;
  label: string;
  /** Пояснение рядом с кнопкой: что именно из этого получится в книге. */
  note?: string;
}

const CtaContext = createContext<ToolCta | null>(null);

/** Страница инструмента сообщает листу, куда вести «Сделать из этого книгу» — виджетам эту ссылку передавать не нужно. */
export function ToolFrame({ cta, children }: { cta: ToolCta; children: ReactNode }) {
  return <CtaContext.Provider value={cta}>{children}</CtaContext.Provider>;
}

export function Workbench({
  input,
  result,
  cta = true,
  stickyResult = true,
  resultTitle,
  inputTitle,
  className,
}: {
  /** Левая колонка. Без неё результат занимает весь лист (тест, шежіре на печать). */
  input?: ReactNode;
  result: ReactNode;
  /** false — у инструмента своя главная кнопка в результате (цена, объём, тест). */
  cta?: boolean;
  stickyResult?: boolean;
  /** Подпись правой колонки вместо «Результат» (например, «Вопросы для анкеты: 10 из 40»). */
  resultTitle?: ReactNode;
  /** Подпись левой колонки вместо «Данные» (в тесте слева — итог, справа — вопросы). */
  inputTitle?: ReactNode;
  className?: string;
}) {
  const t = useMessages().secondary.tools.sheet;
  const link = useContext(CtaContext);
  return (
    <div className={cn("overflow-clip rounded-[14px] border border-line bg-white", className)}>
      <div className={cn("grid", input && "lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]")}>
        {input ? (
          <section aria-label={t.input} className="p-5 sm:p-7 lg:border-r lg:border-line">
            {/* Короткая колонка «плывёт» рядом с длинной: ввод остаётся на виду, пока читается результат. */}
            <div className="lg:sticky lg:top-20">
              <h2 className="mb-5 text-sm font-semibold text-muted">{inputTitle ?? t.input}</h2>
              <div className="space-y-6">{input}</div>
            </div>
          </section>
        ) : null}
        <section aria-label={t.result} className={cn("border-t border-line bg-cream/50 lg:border-t-0", !input && "border-t-0")}>
          <div className={cn("p-5 sm:p-7", input && stickyResult && "lg:sticky lg:top-20")}>
            {input ? <h2 className="mb-5 text-sm font-semibold text-muted">{resultTitle ?? t.result}</h2> : null}
            {result}
          </div>
        </section>
      </div>
      {cta && link ? (
        <div className="flex flex-col gap-4 bg-spine px-5 py-5 text-white sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <p className="max-w-xl text-[15px] leading-snug text-white/80">{link.note ?? t.makeBookNote}</p>
          <Link href={link.href} className="btn btn-primary btn-lg w-full shrink-0 sm:w-auto">
            {link.label}
          </Link>
        </div>
      ) : null}
    </div>
  );
}

/** Поле ввода с подписью: подпись над полем, подсказка под ним. */
export function ToolField({ label, htmlFor, hint, children }: { label: string; htmlFor?: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      {htmlFor ? (
        <label className="label" htmlFor={htmlFor}>
          {label}
        </label>
      ) : (
        <span className="label">{label}</span>
      )}
      {children}
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

/** Большая цифра результата: засечками, винная. */
export function Figure({ value, caption, sub, testId, size = "lg" }: { value: ReactNode; caption?: ReactNode; sub?: ReactNode; testId?: string; size?: "md" | "lg" }) {
  return (
    <div>
      <div className={cn("font-serif leading-none font-medium text-wine tabular-nums", size === "lg" ? "text-[64px] sm:text-[84px]" : "text-5xl sm:text-6xl")} data-testid={testId}>
        {value}
      </div>
      {caption ? <div className="mt-2 text-lg text-ink">{caption}</div> : null}
      {sub ? <div className="mt-1 text-sm text-muted">{sub}</div> : null}
    </div>
  );
}

/** Вердикт: цвет и подпись/значок вместе. calm — спокойно, warm — внимание, hot — срочно. */
export function Verdict({ tone = "calm", icon, children, testId }: { tone?: "calm" | "warm" | "hot"; icon?: ReactNode; children: ReactNode; testId?: string }) {
  return (
    <div
      aria-live="polite"
      className={cn(
        "flex items-start gap-3 rounded-[10px] border-l-[3px] px-4 py-3.5 text-ink",
        tone === "calm" && "border-line-strong bg-white",
        tone === "warm" && "border-warning bg-warning-bg",
        tone === "hot" && "border-wine bg-rose",
      )}
    >
      {icon ? <span className={cn("mt-0.5 shrink-0", tone === "hot" ? "text-wine" : tone === "warm" ? "text-warning" : "text-ink-soft")}>{icon}</span> : null}
      <div className="min-w-0 leading-relaxed" data-testid={testId}>
        {children}
      </div>
    </div>
  );
}

/** Пустое состояние результата: что сделать, чтобы он появился. */
export function ResultEmpty({ children }: { children: ReactNode }) {
  return (
    <p aria-live="polite" className="rounded-[10px] border border-dashed border-line-strong px-5 py-8 text-center leading-relaxed text-muted">
      {children}
    </p>
  );
}

/** Ряд вариантов: один выбранный (тушью), цели нажатия — 44 px. */
export function Choice<T extends string>({ options, value, onChange, label, className }: { options: { id: T; label: string }[]; value: T; onChange: (v: T) => void; label: string; className?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("flex flex-wrap gap-2", className)}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            "min-h-11 rounded-[10px] border px-3.5 text-[15px] leading-tight transition-colors sm:min-h-10",
            value === o.id ? "border-ink bg-ink text-white" : "border-line-strong bg-white text-ink-soft hover:border-ink/40 hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Кнопка «скопировать»: пишет текст в буфер и на две секунды меняет подпись. */
export function CopyButton({ text, label, done, className }: { text: string; label: string; done: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={cn("btn btn-outline btn-sm", className)}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          // Старые браузеры и http: запасной путь через скрытое поле.
          const ta = document.createElement("textarea");
          ta.value = text;
          ta.style.position = "fixed";
          ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          ta.remove();
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? done : label}
    </button>
  );
}
