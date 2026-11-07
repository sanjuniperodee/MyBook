import type { ReactNode } from "react";
import { Logo } from "@/components/Logo";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { cn } from "@/lib/class-names";

/**
 * Служебные страницы по ссылке из письма или QR (отзыв, письмо близкого, видео из книги, отписка): без меню и
 * подвала — только знак, язык и одна задача на бумажном листе.
 */
export function PlainShell({ children, className, lang = true }: { children: ReactNode; className?: string; lang?: boolean }) {
  return (
    <div className="min-h-dvh bg-paper">
      <header className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-4 border-b border-line px-4 sm:h-18 sm:px-6">
        <Logo />
        {lang ? <LanguageSwitch /> : null}
      </header>
      <main className={cn("mx-auto max-w-3xl px-4 pt-10 pb-20 sm:px-6 sm:pt-14", className)}>{children}</main>
    </div>
  );
}

/** Шапка служебной страницы: книга слева (если есть), подпись, титр засечками и пояснение. */
export function PlainIntro({ cover, label, title, text }: { cover?: ReactNode; label?: ReactNode; title: ReactNode; text?: ReactNode }) {
  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-8">
      {cover ? <div className="w-24 shrink-0 rotate-[-3deg] sm:w-28">{cover}</div> : null}
      <div className="min-w-0">
        {label ? <div className="text-sm text-muted">{label}</div> : null}
        <h1 className="mt-2 font-serif text-[38px] leading-[1.06] font-medium text-balance sm:text-5xl">{title}</h1>
        {text ? <div className="mt-3 text-lg leading-relaxed text-ink-soft">{text}</div> : null}
      </div>
    </div>
  );
}
