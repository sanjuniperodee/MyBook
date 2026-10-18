"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { Globe } from "lucide-react";
import { localeMeta, localizePath, splitLocale, type Locale } from "@/i18n/config";
import { useLocale } from "@/i18n/client";
import { cn } from "@/lib/class-names";

/**
 * Переключатель «Рус / Қаз». Запоминает выбор (cookie + профиль) и открывает эту же страницу на другом языке.
 * Полная навигация, а не клиентская: серверные компоненты и метаданные перерисуются на новом языке.
 * Это настоящие ссылки с hreflang: поисковик видит вторую языковую версию и без JavaScript.
 */
export function LanguageSwitch({ className, tone = "light" }: { className?: string; tone?: "light" | "dark" }) {
  const locale = useLocale();
  const pathname = usePathname() ?? "/";
  const [busy, setBusy] = useState(false);

  const { path } = splitLocale(pathname);
  const hrefOf = (next: Locale) => localizePath(path, next);

  const go = async (next: Locale) => {
    if (next === locale || busy) return;
    setBusy(true);
    await fetch("/api/locale", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locale: next }) }).catch(() => {});
    window.location.assign(hrefOf(next) + window.location.search + window.location.hash);
  };

  return (
    <div
      role="group"
      aria-label="Тіл / Язык"
      className={cn("inline-flex items-center rounded-full p-0.5 text-xs font-medium", tone === "dark" ? "bg-white/10" : "bg-ink/[.05]", className)}
    >
      <Globe className={cn("mx-1.5 size-3.5", tone === "dark" ? "text-white/60" : "text-muted")} aria-hidden />
      {(["ru", "kk"] as const).map((l) => (
        <a
          key={l}
          href={hrefOf(l)}
          hrefLang={l}
          lang={l}
          onClick={(e) => {
            e.preventDefault();
            void go(l);
          }}
          aria-current={locale === l ? "true" : undefined}
          title={localeMeta[l].label}
          className={cn(
            "rounded-full px-2.5 py-1 transition",
            locale === l ? (tone === "dark" ? "bg-white text-ink" : "bg-white text-ink shadow-sm") : tone === "dark" ? "text-white/70 hover:text-white" : "text-muted hover:text-ink",
          )}
        >
          {localeMeta[l].short}
        </a>
      ))}
    </div>
  );
}
