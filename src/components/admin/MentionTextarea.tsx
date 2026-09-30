"use client";

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type Props = Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange"> & {
  value: string;
  onValueChange: (v: string) => void;
  /** Имена сотрудников для «@». */
  mentionables?: string[];
};

/** Поле ввода с подсказкой коллег по «@»: стрелки — выбор, Enter/Tab — вставить, Esc — закрыть. */
export const MentionTextarea = forwardRef<HTMLTextAreaElement, Props>(function MentionTextarea({ value, onValueChange, mentionables = [], onKeyDown, className, ...rest }, ref) {
  const inner = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => inner.current!);
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);

  const matches = query === null ? [] : mentionables.filter((m) => m.toLowerCase().includes(query.toLowerCase())).slice(0, 6);

  const detect = (text: string, caret: number) => {
    const m = /(^|\s)@([^\s@]{0,24})$/.exec(text.slice(0, caret));
    setQuery(m && mentionables.length ? m[2] : null);
    setActive(0);
  };

  const insert = (name: string) => {
    const el = inner.current;
    if (!el) return;
    const caret = el.selectionStart;
    const before = value.slice(0, caret).replace(/@([^\s@]{0,24})$/, `@${name} `);
    const next = before + value.slice(caret);
    onValueChange(next);
    setQuery(null);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(before.length, before.length);
    });
  };

  return (
    <div className="relative min-w-0 flex-1">
      <textarea
        {...rest}
        ref={inner}
        value={value}
        className={className}
        onChange={(e) => {
          onValueChange(e.target.value);
          detect(e.target.value, e.target.selectionStart);
        }}
        onKeyDown={(e) => {
          if (matches.length) {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => (i + (e.key === "ArrowDown" ? 1 : matches.length - 1)) % matches.length);
              return;
            }
            if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault();
              insert(matches[active]);
              return;
            }
            if (e.key === "Escape") {
              setQuery(null);
              return;
            }
          }
          onKeyDown?.(e);
        }}
        onBlur={() => setTimeout(() => setQuery(null), 150)}
      />
      {matches.length ? (
        <div className="absolute bottom-full left-0 z-20 mb-1 w-64 overflow-hidden rounded-xl border border-line bg-white shadow-xl" role="listbox">
          {matches.map((m, i) => (
            <button
              key={m}
              type="button"
              role="option"
              aria-selected={i === active}
              className={cn("block w-full px-3 py-2 text-left text-sm", i === active ? "bg-rose/60" : "hover:bg-cream/60")}
              onMouseDown={(e) => {
                e.preventDefault();
                insert(m);
              }}
            >
              @{m}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
});
