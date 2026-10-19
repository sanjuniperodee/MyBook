"use client";

import { Mic, MicOff } from "lucide-react";
import { useMessages } from "@/i18n/client";
import { localeMeta, locales } from "@/i18n/config";
import type { useDictation } from "@/hooks/useDictation";
import { cn } from "@/lib/class-names";

type Dictation = ReturnType<typeof useDictation>;

/** Диктовка: кнопка + язык. На компьютере — в панели под ответом, на телефоне — в нижней панели (compact). */
export function DictationControl({ dictation, lang, onLang, onToggle, compact, className }: { dictation: Dictation; lang: string; onLang: (lang: string) => void; onToggle: () => void; compact: boolean; className: string }) {
  const t = useMessages().editor;
  return (
    <div className={cn("flex items-center rounded-full border border-line bg-white", className)}>
      <button
        className={cn("flex h-11 items-center gap-1.5 rounded-full text-sm sm:h-9", compact ? "px-3" : "px-3.5", dictation.listening ? "bg-wine text-white" : "hover:bg-cream")}
        onClick={onToggle}
        title={dictation.listening ? t.stop : t.dictateTitle}
        aria-label={dictation.listening ? t.stop : t.dictateTitle}
      >
        {dictation.listening ? <MicOff className="size-5 sm:size-4" /> : <Mic className="size-5 sm:size-4" />}
        {compact ? (dictation.listening ? t.stop : null) : dictation.listening ? t.stop : t.dictate}
      </button>
      <select
        value={lang}
        onChange={(e) => {
          const l = e.target.value;
          onLang(l);
          if (dictation.listening) dictation.start(l);
        }}
        className="h-11 rounded-full bg-transparent pr-1.5 pl-0.5 text-xs text-muted outline-none sm:h-9 sm:pr-2 sm:pl-1"
        aria-label={t.dictationLang}
      >
        {locales.map((l) => (
          <option key={l} value={localeMeta[l].speech}>
            {localeMeta[l].short}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Идёт запись: мигающая точка, промежуточный текст и подсказка, если долго тихо. */
export function DictationStatus({ dictation }: { dictation: Dictation }) {
  const t = useMessages().editor;
  return (
    <div className="mt-2 rounded-2xl bg-rose/50 px-4 py-3">
      <div className="flex items-center gap-2 text-xs font-medium text-wine">
        <span className="relative flex size-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-wine opacity-60" />
          <span className="relative inline-flex size-2.5 rounded-full bg-wine" />
        </span>
        {t.listening}
      </div>
      {dictation.interim ? <p className="mt-1.5 text-lg text-ink-soft italic">{dictation.interim}…</p> : null}
      {dictation.silent ? <p className="mt-1.5 text-xs text-muted">{t.silent}</p> : null}
    </div>
  );
}
