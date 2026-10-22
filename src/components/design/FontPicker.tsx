"use client";

/**
 * Выбор шрифта с живым предпросмотром: каждый вариант набран своим шрифтом (название и пример с казахскими буквами),
 * поиск по названию и фильтр по группам. bodyOnly — только шрифты, годные для основного текста. Здесь же — выбор
 * насыщенности и курсива из начертаний, которые у шрифта действительно есть (иначе PDF взял бы ближайшее).
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { useMessages } from "@/i18n/client";
import { cssFont, fontCategories, fontFaces, fontKeys, fontWeights, type FontCategory, type FontKey } from "@/lib/book/fonts";
import { cn } from "@/lib/class-names";
import { FieldLabel, Segmented } from "./controls";

export function FontPicker({
  label,
  value,
  onChange,
  bodyOnly,
  sample,
  onReset,
}: {
  label: string;
  value: FontKey;
  onChange: (font: FontKey) => void;
  bodyOnly?: boolean;
  /** Текст примера (например, название книги). */
  sample?: string;
  onReset?: () => void;
}) {
  const t = useMessages().design.ui;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<FontCategory | "all">("all");
  const box = useRef<HTMLDivElement>(null);
  const listId = useId();
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return fontKeys.filter((k) => {
      const f = fontFaces[k];
      if (bodyOnly && !f.body) return false;
      if (group !== "all" && f.category !== group) return false;
      return !q || (f.name ?? k).toLowerCase().includes(q);
    });
  }, [query, group, bodyOnly]);
  const groups = fontCategories.filter((c) => fontKeys.some((k) => fontFaces[k].category === c && (!bodyOnly || fontFaces[k].body)));
  const name = (k: FontKey) => fontFaces[k].name ?? k;
  return (
    <div ref={box} className="relative">
      <FieldLabel label={label} onReset={onReset} resetLabel={t.reset} />
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        className="flex h-11 w-full items-center justify-between gap-2 rounded-xl border border-line bg-white px-3 text-left transition hover:border-ink/30"
      >
        <span className="truncate text-[17px]" style={{ fontFamily: cssFont(value) }}>
          {name(value)}
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-muted transition", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="absolute inset-x-0 top-full z-40 mt-1 min-w-[300px] rounded-2xl border border-line bg-white p-2 shadow-lift">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <input autoFocus className="h-10 w-full rounded-xl bg-cream/60 pr-3 pl-9 text-sm outline-none focus:bg-cream" placeholder={t.fonts.search} value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="no-scrollbar mt-2 flex gap-1 overflow-x-auto">
            {(["all", ...groups] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGroup(g)}
                className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs transition", group === g ? "bg-ink text-white" : "bg-cream/70 text-ink-soft hover:bg-cream")}
              >
                {g === "all" ? t.fonts.all : t.fonts.categories[g]}
              </button>
            ))}
          </div>
          <ul id={listId} role="listbox" aria-label={label} className="mt-2 max-h-80 overflow-y-auto overscroll-contain">
            {shown.length ? (
              shown.map((k) => (
                <li key={k} role="option" aria-selected={k === value}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(k);
                      setOpen(false);
                    }}
                    className={cn("flex w-full items-start gap-2 rounded-xl px-3 py-2 text-left transition hover:bg-cream/60", k === value && "bg-rose/60")}
                  >
                    <span className="min-w-0 flex-1" style={{ fontFamily: cssFont(k) }}>
                      <span className="flex items-baseline gap-2">
                        <span className="truncate text-lg leading-tight text-ink">{name(k)}</span>
                        {!fontFaces[k].body ? <span className="shrink-0 rounded-full bg-cream px-1.5 py-px font-sans text-[10px] text-muted">{t.fonts.headingsOnly}</span> : null}
                      </span>
                      <span className="block truncate text-[13px] text-muted">{sample || t.fonts.sample}</span>
                      <span className="block truncate text-[12px] text-muted/80">{t.fonts.letters}</span>
                    </span>
                    {k === value ? <Check className="mt-1 size-4 shrink-0 text-wine" /> : null}
                  </button>
                </li>
              ))
            ) : (
              <li className="px-3 py-6 text-center text-sm text-muted">{t.fonts.empty}</li>
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** Насыщенность и курсив — только из начертаний шрифта. */
export function FaceControls({ font, weight, italic, onChange, allowItalic = true }: { font: FontKey; weight: number; italic?: boolean; onChange: (v: { weight?: number; italic?: boolean }) => void; allowItalic?: boolean }) {
  const t = useMessages().design.ui;
  const { weights, italic: hasItalic } = fontWeights(font);
  const current = weights.reduce((a, b) => (Math.abs(b - weight) < Math.abs(a - weight) ? b : a), weights[0]);
  return (
    <div className="flex flex-wrap items-end gap-3">
      {weights.length > 1 ? (
        <Segmented label={t.weight} value={String(current)} options={weights.map((w) => ({ value: String(w), label: <span style={{ fontWeight: w }}>{t.weights[w] ?? w}</span> }))} onChange={(v) => onChange({ weight: Number(v) })} wrap />
      ) : null}
      {hasItalic && allowItalic ? (
        <button
          type="button"
          aria-pressed={!!italic}
          onClick={() => onChange({ italic: !italic })}
          className={cn("h-10 rounded-xl border px-3 text-sm italic transition", italic ? "border-wine bg-rose/60 text-wine" : "border-line bg-white text-ink-soft hover:border-ink/30")}
        >
          {t.italic}
        </button>
      ) : null}
    </div>
  );
}
