"use client";

import { Link, useMessages } from "@/i18n/client";
import { useRef, useState } from "react";
import { Check, ImagePlus } from "lucide-react";
import { CoverPreview } from "@/components/cover/CoverPreview";
import { SaveIndicator } from "@/components/SaveIndicator";
import { useAutosave } from "@/hooks/useAutosave";
import { apiFetch } from "@/lib/client-api";
import { coverMoods, coverNamesLine, coverTemplates, type CoverMood } from "@/lib/book/covers";
import { photoUrl } from "@/lib/urls";
import { cn } from "@/lib/utils";

export interface CoverState {
  coverTemplate: string;
  title: string;
  subtitle: string;
  authorName: string;
  recipientName: string;
  hideRecipientOnCover: boolean;
  backText: string;
  coverPhotoId: string | null;
}

export function CoverEditor({
  bookId,
  format,
  initial,
  photos,
  recipientLabel,
  editable,
}: {
  bookId: string;
  format: string;
  initial: CoverState;
  photos: { id: string; width: number; height: number }[];
  recipientLabel: string;
  editable: boolean;
}) {
  const [state, setState] = useState(initial);
  const m = useMessages();
  const t = m.books.cover;
  const strip = useRef<HTMLDivElement>(null);
  const changes = useRef<Partial<CoverState>>({});
  const { status, error, schedule } = useAutosave<null>(async () => {
    const patch = changes.current;
    changes.current = {};
    if (!Object.keys(patch).length) return;
    try {
      await apiFetch(`/api/books/${bookId}`, { method: "PATCH", json: patch });
    } catch (e) {
      changes.current = { ...patch, ...changes.current };
      throw e;
    }
  }, 700);

  const update = (patch: Partial<CoverState>) => {
    if (!editable) return;
    setState((s) => ({ ...s, ...patch }));
    changes.current = { ...changes.current, ...patch };
    schedule(null);
  };

  const template = coverTemplates.find((t) => t.id === state.coverTemplate) ?? coverTemplates[0];
  const [mood, setMood] = useState<CoverMood | "all">("all");
  const names = coverNamesLine(state.authorName, state.recipientName, state.hideRecipientOnCover);
  const coverPhoto = state.coverPhotoId ? photoUrl(state.coverPhotoId, "full") : undefined;

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] lg:gap-14">
      <div>
        <div className="lg:sticky lg:top-24">
          <div className="mx-auto w-full max-w-[340px] rounded-[28px] bg-cream/70 p-8">
            <CoverPreview
              template={state.coverTemplate}
              format={format}
              title={state.title}
              subtitle={state.subtitle}
              names={names}
              photoUrl={coverPhoto}
              className="rounded-[4px] shadow-book"
              uid="editor"
              titlePlaceholder={t.bookTitle}
              photoHint={t.uploadFirst}
            />
          </div>
          <div className="mt-4 flex items-center justify-center gap-3 text-sm text-muted">
            <span className="font-medium text-ink">{m.catalog.covers[template.id] ?? template.id}</span>·<SaveIndicator status={status} error={error} />
          </div>
        </div>
      </div>

      <div className="space-y-8">
        <section>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">{t.design}</h2>
            <span className="text-xs text-muted">{m.common.count.variants(coverTemplates.length)}</span>
          </div>
          {/* Фильтр по настроению — чтобы 20+ обложек не превращались в стену */}
          <div className="no-scrollbar -mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-1" role="radiogroup" aria-label={t.moodAria}>
            {(["all", ...coverMoods] as const).map((id) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={mood === id}
                onClick={() => setMood(id)}
                className={cn("shrink-0 rounded-full px-3.5 py-1.5 text-sm transition", mood === id ? "bg-ink text-white" : "bg-white text-ink-soft ring-1 ring-line hover:ring-ink/30")}
              >
                {m.catalog.moods[id]}
              </button>
            ))}
          </div>
          <div ref={strip} className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4 xl:grid-cols-6">
            {coverTemplates.filter((t) => mood === "all" || t.mood === mood || t.id === state.coverTemplate).map((t) => (
              <button
                key={t.id}
                onClick={() => update({ coverTemplate: t.id })}
                disabled={!editable}
                className="group text-left"
                aria-pressed={t.id === state.coverTemplate}
              >
                <div
                  className={cn(
                    "relative overflow-hidden rounded-[4px] ring-offset-2 ring-offset-paper transition",
                    t.id === state.coverTemplate ? "ring-2 ring-wine" : "ring-1 ring-line group-hover:-translate-y-0.5 group-hover:ring-ink/30",
                  )}
                >
                  <CoverPreview template={t.id} format={format} title={state.title} names={names} photoUrl={t.requiresPhoto ? coverPhoto : undefined} lite uid={`pick-${t.id}`} />
                  {t.id === state.coverTemplate ? (
                    <span className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-wine text-white">
                      <Check className="size-3" />
                    </span>
                  ) : null}
                </div>
                <div className={cn("mt-1.5 truncate text-xs", t.id === state.coverTemplate ? "font-medium text-ink" : "text-muted")}>{m.catalog.covers[t.id] ?? t.id}</div>
              </button>
            ))}
          </div>
        </section>

        <h2 className="text-lg font-semibold">{t.text}</h2>

        {template.requiresPhoto ? (
          <div>
            <span className="label">{t.photo}</span>
            {photos.length ? (
              <div className="grid grid-cols-4 gap-2">
                {photos.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => update({ coverPhotoId: p.id })}
                    className={cn("relative aspect-square overflow-hidden rounded-xl ring-offset-2", state.coverPhotoId === p.id ? "ring-2 ring-wine" : "ring-1 ring-line")}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photoUrl(p.id)} alt="" className="h-full w-full object-cover" />
                    {p.width < 1800 ? <span className="absolute inset-x-0 bottom-0 bg-amber-500/90 py-0.5 text-[10px] text-white">{t.lowQuality}</span> : null}
                  </button>
                ))}
              </div>
            ) : null}
            <Link href={`/books/${bookId}/photos`} className="mt-2 inline-flex items-center gap-1.5 text-sm text-wine hover:underline">
              <ImagePlus className="size-4" /> {photos.length ? t.uploadMore : t.uploadFirst}
            </Link>
          </div>
        ) : null}

        <Field label={t.bookTitle} value={state.title} max={80} onChange={(v) => update({ title: v })} disabled={!editable} />
        <Field label={t.subtitle} placeholder={t.subtitlePlaceholder} value={state.subtitle} max={80} onChange={(v) => update({ subtitle: v })} disabled={!editable} />
        <Field label={t.authorName} value={state.authorName} max={60} onChange={(v) => update({ authorName: v })} disabled={!editable} />
        <div>
          <Field label={recipientLabel} value={state.recipientName} max={60} onChange={(v) => update({ recipientName: v })} disabled={!editable} />
          <label className="mt-3 flex items-center gap-2.5 text-sm text-ink-soft">
            <input
              type="checkbox"
              className="size-4 accent-wine"
              checked={state.hideRecipientOnCover}
              onChange={(e) => update({ hideRecipientOnCover: e.target.checked })}
              disabled={!editable}
            />
            {t.hideRecipient}
          </label>
        </div>
        <div>
          <label className="label" htmlFor="backText">{t.backText}</label>
          <textarea
            id="backText"
            className="input"
            rows={3}
            maxLength={400}
            placeholder={t.backTextPlaceholder}
            value={state.backText}
            onChange={(e) => update({ backText: e.target.value })}
            disabled={!editable}
          />
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, max, placeholder, disabled }: { label: string; value: string; onChange: (v: string) => void; max: number; placeholder?: string; disabled?: boolean }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input className="input" value={value} maxLength={max} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} disabled={disabled} />
    </div>
  );
}
