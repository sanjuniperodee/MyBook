"use client";

import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/class-names";

type Props = Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange"> & {
  value: string;
  onValueChange: (v: string) => void;
  /** Имена сотрудников для «@». */
  mentionables?: string[];
  /** Шаблоны для «/»: text уже с подставленными именем, заказом и ссылкой. Нет — «/» обычный символ. */
  slashItems?: { id: string; title: string; text: string; own?: boolean }[];
};

/**
 * Поле ввода с подсказками: коллеги по «@» и шаблоны ответов по «/» (в начале строки или после пробела; дальше можно
 * набрать часть названия или текста). Стрелки — выбор, Enter/Tab — вставить, Esc — закрыть.
 */
export const MentionTextarea = forwardRef<HTMLTextAreaElement, Props>(function MentionTextarea({ value, onValueChange, mentionables = [], slashItems, onKeyDown, className, ...rest }, ref) {
  const inner = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => inner.current!);
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);

  const [slash, setSlash] = useState<string | null>(null);

  const matches = query === null ? [] : mentionables.filter((m) => m.toLowerCase().includes(query.toLowerCase())).slice(0, 6);
  const templates = useMemo(() => {
    if (slash === null || !slashItems?.length) return [];
    const q = slash.toLowerCase();
    const hit = (t: { title: string; text: string }) => !q || t.title.toLowerCase().includes(q) || t.text.toLowerCase().includes(q);
    // Совпадение в названии — выше, чем в тексте.
    const byTitle = slashItems.filter((t) => t.title.toLowerCase().includes(q));
    return [...byTitle, ...slashItems.filter((t) => hit(t) && !byTitle.includes(t))].slice(0, 8);
  }, [slash, slashItems]);
  const count = templates.length || matches.length;

  const detect = (text: string, caret: number) => {
    const before = text.slice(0, caret);
    const m = /(^|\s)@([^\s@]{0,24})$/.exec(before);
    setQuery(m && mentionables.length ? m[2] : null);
    const sl = /(^|\s)\/([^\s/]{0,30})$/.exec(before);
    setSlash(sl && slashItems?.length ? sl[2] : null);
    setActive(0);
  };

  const insertTemplate = (text: string) => {
    const el = inner.current;
    if (!el) return;
    const caret = el.selectionStart;
    const head = value.slice(0, caret).replace(/\/([^\s/]{0,30})$/, "");
    const next = head + text + value.slice(caret);
    onValueChange(next);
    setSlash(null);
    const pos = head.length + text.length;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(pos, pos);
    });
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
          if (count) {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => (i + (e.key === "ArrowDown" ? 1 : count - 1)) % count);
              return;
            }
            if ((e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) || e.key === "Tab") {
              e.preventDefault();
              if (templates.length) insertTemplate(templates[Math.min(active, templates.length - 1)].text);
              else insert(matches[active]);
              return;
            }
            if (e.key === "Escape") {
              e.stopPropagation();
              setQuery(null);
              setSlash(null);
              return;
            }
          }
          onKeyDown?.(e);
        }}
        onBlur={() => setTimeout(() => (setQuery(null), setSlash(null)), 150)}
      />
      {templates.length ? (
        <div className="absolute bottom-full left-0 z-20 mb-1 w-[min(26rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-line bg-white shadow-xl" role="listbox" aria-label="Шаблоны ответов">
          <div className="border-b border-line bg-cream/40 px-3 py-1.5 text-[11px] text-muted">Шаблоны · ↑↓ выбрать, Enter — вставить, Esc — закрыть</div>
          {templates.map((t, i) => (
            <button
              key={t.id}
              type="button"
              role="option"
              aria-selected={i === active}
              className={cn("block w-full px-3 py-2 text-left", i === active ? "bg-rose/60" : "hover:bg-cream/60")}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                insertTemplate(t.text);
              }}
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                {t.title}
                {t.own ? <span className="rounded-full bg-rose px-1.5 py-px text-[10px] font-medium text-wine">мой</span> : null}
              </span>
              <span className="line-clamp-1 text-xs text-muted">{t.text}</span>
            </button>
          ))}
        </div>
      ) : null}
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
