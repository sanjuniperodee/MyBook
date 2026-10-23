"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ImageIcon, Maximize2, Search, Sparkles, X } from "lucide-react";
import { useMessages } from "@/i18n/client";
import { InteriorSpread, type SpreadKind, type SpreadSample } from "@/components/interior/InteriorSpread";
import type { BookFormat } from "@/lib/book/formats";
import { interiorDesigns, interiorDirection, styleDirections, type InteriorDesign, type InteriorId, type StyleDirection } from "@/lib/book/interiors";
import { cn } from "@/lib/class-names";

type Filter = StyleDirection | "all" | "cover";

const spreads: SpreadKind[] = ["chapter", "photos", "front", "toc"];

/** Крупный просмотр стиля: все четыре разворота на содержимом книги. */
function StylePreview({ design, format, sample, name, description, active, onApply, onClose }: { design: InteriorDesign; format: BookFormat; sample: SpreadSample; name: string; description: string; active: boolean; onApply: () => void; onClose: () => void }) {
  const t = useMessages().design.pages.styles;
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={t.previewTitle(name)} className="max-h-[94dvh] w-full max-w-5xl overflow-y-auto rounded-t-3xl bg-paper p-4 shadow-2xl sm:rounded-3xl sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-serif text-2xl font-medium sm:text-3xl">{t.previewTitle(name)}</h2>
            <p className="mt-1 text-sm text-muted">{description}</p>
            <p className="mt-0.5 text-xs text-muted">{t.previewText}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t.close} className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-ink shadow-soft hover:bg-cream">
            <X className="size-5" />
          </button>
        </div>
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          {spreads.map((k) => (
            <InteriorSpread key={k} design={design} format={format} sample={sample} kind={k} className="rounded-[3px] shadow-book" />
          ))}
        </div>
        <div className="sticky bottom-0 mt-5 flex justify-end bg-gradient-to-t from-paper via-paper pt-3">
          <button type="button" className={cn("btn", active ? "btn-outline" : "btn-primary")} onClick={onApply} disabled={active}>
            {active ? <Check className="size-4" /> : null}
            {active ? t.current : t.apply}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Библиотека стилей: направления (литература, журнал, минимализм, люкс…), поиск по названию и описанию,
 * подсказка «к обложке». Миниатюры — разворот главы на тексте книги, крупно — все развороты.
 */
export function StylesTab({
  current,
  format,
  sample,
  pairs,
  coverName,
  editable,
  onPick,
}: {
  current: InteriorId;
  format: BookFormat;
  sample: SpreadSample;
  /** Стили в пару к обложке книги. */
  pairs: InteriorId[];
  coverName: string;
  editable: boolean;
  onPick: (id: InteriorId) => void;
}) {
  const m = useMessages();
  const t = m.design.pages.styles;
  const names = m.catalog.interiors;
  const dirNames = m.catalog.interiorDirections;
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<InteriorDesign | null>(null);
  const paired = useMemo(() => new Set(pairs), [pairs]);
  const used = useMemo(() => new Set(interiorDesigns.map(interiorDirection)), []);
  const filters: Filter[] = ["all", ...(paired.size ? (["cover"] as const) : []), ...styleDirections.filter((d) => used.has(d))];
  const q = query.trim().toLowerCase();
  const shown = interiorDesigns.filter((d) => {
    if (filter === "cover" && !paired.has(d.id)) return false;
    if (filter !== "all" && filter !== "cover" && interiorDirection(d) !== filter) return false;
    if (!q) return true;
    const n = names[d.id];
    return `${n.name} ${n.description} ${dirNames[interiorDirection(d)]}`.toLowerCase().includes(q);
  });
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <input className="h-10 w-full rounded-xl border border-line bg-white pr-3 pl-9 text-sm outline-none focus:border-wine/50" placeholder={t.search} value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <span className="text-xs text-muted">{t.count(shown.length)}</span>
      </div>
      <div className="no-scrollbar -mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-1" role="radiogroup" aria-label={m.books.pages.moodAria}>
        {filters.map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={filter === id}
            onClick={() => setFilter(id)}
            className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm transition", filter === id ? "bg-ink text-white" : "bg-white text-ink-soft ring-1 ring-line hover:ring-ink/30")}
          >
            {id === "cover" ? <Sparkles className="size-3.5" /> : null}
            {id === "cover" ? t.forCover(coverName) : id === "all" ? t.all : dirNames[id]}
          </button>
        ))}
      </div>
      {shown.length ? (
        <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-6">
          {shown.map((d) => {
            const active = d.id === current;
            return (
              <div key={d.id} className="group relative text-left">
                <button type="button" onClick={() => onPick(d.id)} disabled={!editable} aria-pressed={active} className="block w-full text-left">
                  <div className={cn("relative rounded-[3px] ring-offset-2 ring-offset-paper transition", active ? "ring-2 ring-wine" : "ring-1 ring-line group-hover:-translate-y-0.5 group-hover:ring-ink/30")}>
                    <InteriorSpread design={d} format={format} sample={sample} openerPlaceholder className="rounded-[3px]" />
                    {active ? (
                      <span className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-wine text-white">
                        <Check className="size-3" />
                      </span>
                    ) : null}
                    {paired.has(d.id) ? (
                      <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-medium text-wine shadow-sm">
                        <Sparkles className="size-2.5" /> {m.books.pages.pairBadge}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-2 flex items-baseline justify-between gap-2">
                    <span className={cn("text-sm", active ? "font-semibold text-ink" : "font-medium text-ink-soft")}>{names[d.id].name}</span>
                    <span className="shrink-0 text-[11px] text-muted">{dirNames[interiorDirection(d)]}</span>
                  </div>
                  {/* Есть ли в стиле фото в начале главы и какой формы — его выбирает автор (места фото, выпуск 2). */}
                  {d.opener.photo ? (
                    <div className="mt-0.5 flex items-start gap-1 text-[11px] leading-snug font-medium text-wine" data-badge="opener-photo">
                      <ImageIcon className="mt-px size-3 shrink-0" aria-hidden />
                      <span>
                        {m.books.pagesPhotos.badge} · {m.editor.openerShape[d.opener.photo]}
                      </span>
                    </div>
                  ) : null}
                  <div className="line-clamp-2 text-xs text-muted">{names[d.id].description}</div>
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(d)}
                  title={t.open}
                  aria-label={`${t.open}: ${names[d.id].name}`}
                  className="absolute top-1.5 flex size-8 items-center justify-center rounded-full bg-white/95 text-ink opacity-0 shadow-soft transition group-hover:opacity-100 focus-visible:opacity-100 max-lg:opacity-100"
                  style={{ right: active ? 30 : 6 }}
                >
                  <Maximize2 className="size-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mt-6 text-sm text-muted">{t.empty}</p>
      )}
      {open ? (
        <StylePreview
          design={open}
          format={format}
          sample={sample}
          name={names[open.id].name}
          description={names[open.id].description}
          active={open.id === current}
          onApply={() => {
            onPick(open.id);
            setOpen(null);
          }}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </div>
  );
}
