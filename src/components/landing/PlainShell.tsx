import type { ReactNode } from "react";
import { Logo } from "@/components/Logo";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { cn } from "@/lib/class-names";

const widths = { sm: "max-w-xl", md: "max-w-3xl", lg: "max-w-5xl" } as const;

/**
 * Служебные страницы по ссылке из письма или QR (отзыв, письмо близкого, видео из книги, отписка): без меню и
 * подвала — только знак, язык и одна задача. `tone="dark"` — «кинозал»: тёмная основа для просмотра видео
 * (она тёмная в обеих темах). `size` — ширина колонки.
 */
export function PlainShell({
  children,
  className,
  lang = true,
  tone = "paper",
  size = "md",
}: {
  children: ReactNode;
  className?: string;
  lang?: boolean;
  tone?: "paper" | "dark";
  size?: keyof typeof widths;
}) {
  const dark = tone === "dark";
  return (
    <div className={cn("min-h-dvh", dark ? "bg-spine text-white" : "bg-paper")}>
      <header className={cn("mx-auto flex h-16 items-center justify-between gap-4 px-4 sm:h-18 sm:px-6", widths[size === "sm" ? "md" : size], !dark && "border-b border-line")}>
        <Logo className={dark ? "text-white" : undefined} />
        {lang ? <LanguageSwitch tone={dark ? "dark" : "light"} /> : null}
      </header>
      <main className={cn("mx-auto px-4 pt-8 pb-20 sm:px-6 sm:pt-12", widths[size], className)}>{children}</main>
    </div>
  );
}

/**
 * Лист служебной страницы: белая бумага и вторая, внутренняя, тонкая рамка — как у сертификата и «кадра».
 * Без тени: лист лежит на бумаге страницы.
 */
export function PlainSheet({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("relative rounded-[14px] border border-line bg-white p-6 sm:p-10", className)}>
      <div aria-hidden className="pointer-events-none absolute inset-1.5 rounded-[9px] border border-line/70" />
      <div className="relative">{children}</div>
    </div>
  );
}

/** Шапка служебной страницы: книга слева (если есть), подпись, титр засечками и пояснение. */
export function PlainIntro({ cover, label, title, text }: { cover?: ReactNode; label?: ReactNode; title: ReactNode; text?: ReactNode }) {
  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-8">
      {cover ? <div className="w-24 shrink-0 sm:w-28">{cover}</div> : null}
      <div className="min-w-0">
        {label ? <div className="text-sm text-muted">{label}</div> : null}
        <h1 className="mt-2 font-serif text-[38px] leading-[1.06] font-medium text-balance sm:text-5xl">{title}</h1>
        {text ? <div className="mt-3 text-lg leading-relaxed text-ink-soft">{text}</div> : null}
      </div>
    </div>
  );
}
