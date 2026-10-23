"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/class-names";

/** Ряд кнопок-вариантов: один выбранный. Для выбора из 2–10 пунктов, где выпадающий список прячет варианты. */
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
            "rounded-full border px-4 py-2 text-sm transition",
            value === o.id ? "border-wine bg-wine text-white shadow-[0_6px_16px_-8px_rgb(122_31_43/0.7)]" : "border-line bg-white text-ink-soft hover:border-ink/30",
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
