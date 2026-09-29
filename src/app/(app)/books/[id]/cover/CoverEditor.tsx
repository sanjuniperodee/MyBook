"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Check, ImagePlus } from "lucide-react";
import { CoverPreview } from "@/components/cover/CoverPreview";
import { SaveIndicator } from "@/components/SaveIndicator";
import { useAutosave } from "@/hooks/useAutosave";
import { apiFetch } from "@/lib/client-api";
import { coverNamesLine, coverTemplates } from "@/lib/book/covers";
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
            />
          </div>
          <div className="mt-4 flex items-center justify-center gap-3 text-sm text-muted">
            <span className="font-medium text-ink">{template.name}</span>·<SaveIndicator status={status} error={error} />
          </div>
        </div>
      </div>

      <div className="space-y-8">
        <section>
          <h2 className="text-lg font-semibold">Дизайн</h2>
          <div ref={strip} className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4 xl:grid-cols-6">
            {coverTemplates.map((t) => (
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
                <div className={cn("mt-1.5 truncate text-xs", t.id === state.coverTemplate ? "font-medium text-ink" : "text-muted")}>{t.name}</div>
              </button>
            ))}
          </div>
        </section>

        <h2 className="text-lg font-semibold">Текст на обложке</h2>

        {template.requiresPhoto ? (
          <div>
            <span className="label">Фото для обложки</span>
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
                    {p.width < 1800 ? <span className="absolute inset-x-0 bottom-0 bg-amber-500/90 py-0.5 text-[10px] text-white">низкое качество</span> : null}
                  </button>
                ))}
              </div>
            ) : null}
            <Link href={`/books/${bookId}/photos`} className="mt-2 inline-flex items-center gap-1.5 text-sm text-wine hover:underline">
              <ImagePlus className="size-4" /> {photos.length ? "Загрузить ещё фото" : "Сначала загрузите фото"}
            </Link>
          </div>
        ) : null}

        <Field label="Название книги" value={state.title} max={80} onChange={(v) => update({ title: v })} disabled={!editable} />
        <Field label="Подзаголовок" placeholder="Например, «Четыре года вместе»" value={state.subtitle} max={80} onChange={(v) => update({ subtitle: v })} disabled={!editable} />
        <Field label="Ваше полное имя" value={state.authorName} max={60} onChange={(v) => update({ authorName: v })} disabled={!editable} />
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
            Не отображать на обложке
          </label>
        </div>
        <div>
          <label className="label" htmlFor="backText">Текст на задней обложке</label>
          <textarea
            id="backText"
            className="input"
            rows={3}
            maxLength={400}
            placeholder="Короткая фраза или цитата — по желанию"
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
