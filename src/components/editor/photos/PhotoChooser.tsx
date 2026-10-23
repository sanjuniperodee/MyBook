"use client";

import { useMemo } from "react";
import { Check, ImagePlus, LoaderCircle } from "lucide-react";
import { useMessages } from "@/i18n/client";
import { SUGGEST_TOP } from "@/lib/book/opener-suggest";
import type { PhotoPlace } from "@/lib/book/photo-place";
import { cn } from "@/lib/class-names";
import { photoUrl } from "@/lib/urls";
import { openerOf, type PlaceNames, type SheetPhoto } from "./model";
import { PlaceBadge } from "./PlaceBadge";

/** Выбор фото главы (одно, сразу ставится) или фото на страницы (несколько, кнопкой «Добавить»). */
export type ChooserMode = "opener" | "after";
/** Что выбирают: для главы (ChooserMode) или в альбом в конце (несколько, как «после главы»). */
export type PickMode = ChooserMode | "album";
export type GroupId = "fit" | "here" | "unplaced" | "otherChapters" | "album" | "answers" | "cover" | "off";
const GROUP_ORDER: GroupId[] = ["fit", "here", "unplaced", "otherChapters", "album", "answers", "cover", "off"];

/**
 * Группы выбора фото для главы chapterKey: «Подходят по форме» (только для фото главы — лучшие из suggestOpener,
 * сами не ставятся), «После главы» (этой), «Без места», «После других глав», «В альбоме», «В ответах», «На обложке»,
 * «Не печатаются». Нынешнее фото главы не предлагается; для «после главы» — и уже закреплённые после неё; для
 * альбома (chapterKey не нужен) — фото, которые уже в альбоме.
 */
export function chooserGroups(photos: readonly SheetPhoto[], places: ReadonlyMap<string, PhotoPlace>, chapterKey: string, mode: PickMode, fit: readonly string[] = []): { id: GroupId; photos: SheetPhoto[] }[] {
  const current = mode === "album" ? undefined : openerOf(places, chapterKey)?.id;
  const fitAt = new Map(fit.filter((id) => id !== current).slice(0, SUGGEST_TOP).map((id, i) => [id, i]));
  const out = new Map<GroupId, SheetPhoto[]>(GROUP_ORDER.map((g) => [g, []]));
  for (const p of photos) {
    const pl = places.get(p.id);
    if (!pl || p.id === current || (mode === "album" && pl.kind === "album")) continue;
    const hereAfter = mode !== "album" && pl.kind === "after" && pl.chapterKey === chapterKey;
    if (mode === "after" && hereAfter && !pl.auto) continue;
    const g: GroupId =
      mode === "opener" && fitAt.has(p.id)
        ? "fit"
        : pl.kind === "answer"
          ? "answers"
          : hereAfter
            ? "here"
            : pl.kind === "off" && pl.auto && pl.onCover
              ? "cover"
              : pl.auto || pl.waitingFor
                ? "unplaced"
                : pl.kind === "album"
                  ? "album"
                  : pl.kind === "off"
                    ? "off"
                    : "otherChapters";
    out.get(g)!.push(p);
  }
  out.get("fit")!.sort((a, b) => fitAt.get(a.id)! - fitAt.get(b.id)!);
  return GROUP_ORDER.map((id) => ({ id, photos: out.get(id)! })).filter((g) => g.photos.length);
}

/** Сетка выбора: первой — «Загрузить», дальше группы; под каждым фото — где оно стоит сейчас. В альбом chapterKey — "". */
export function PhotoChooser({
  mode,
  photos,
  places,
  chapterKey,
  fit,
  picked,
  names,
  blank,
  openerDesign,
  editable,
  uploading,
  onPick,
  onUpload,
}: {
  mode: PickMode;
  photos: readonly SheetPhoto[];
  places: ReadonlyMap<string, PhotoPlace>;
  chapterKey: string;
  fit?: readonly string[];
  picked: readonly string[];
  names: PlaceNames;
  blank: boolean;
  openerDesign: boolean;
  editable: boolean;
  uploading: { done: number; total: number } | null;
  onPick: (id: string) => void;
  onUpload: () => void;
}) {
  const m = useMessages();
  const cp = m.editor.chapterPhoto;
  const groups = useMemo(() => chooserGroups(photos, places, chapterKey, mode, fit), [photos, places, chapterKey, mode, fit]);
  const groupTitle = (id: GroupId) => (id === "here" ? cp.after : id === "answers" ? (blank ? cp.groups.answersBlank : cp.groups.answers) : cp.groups[id]);
  return (
    <div className="space-y-5">
      {mode === "after" ? <p className="text-sm text-muted">{cp.afterHint}</p> : null}
      <button
        type="button"
        disabled={!editable || !!uploading}
        onClick={onUpload}
        className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line bg-cream/30 px-4 text-sm font-medium text-ink hover:bg-cream/60 disabled:opacity-60"
      >
        {uploading ? <LoaderCircle className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
        {uploading ? (uploading.total > 1 ? m.editor.photoPicker.progress(uploading.done, uploading.total) : cp.uploading) : cp.upload}
      </button>
      {groups.map((g) => (
        <section key={g.id}>
          <div className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">{groupTitle(g.id)}</div>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {g.photos.map((p) => {
              const on = picked.includes(p.id);
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    disabled={!editable}
                    onClick={() => onPick(p.id)}
                    aria-pressed={mode !== "opener" ? on : undefined}
                    className={cn("relative block aspect-square w-full overflow-hidden rounded-xl bg-cream ring-offset-2 transition", on ? "ring-2 ring-wine" : "ring-1 ring-line hover:ring-ink/30")}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- фото клиента */}
                    <img src={photoUrl(p.id)} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />
                    {g.id === "fit" ? <span className="absolute top-1.5 left-1.5 rounded-full bg-wine px-2 py-0.5 text-[10px] font-medium text-white">{cp.fitChip}</span> : null}
                    {on ? (
                      <span className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full bg-wine text-white">
                        <Check className="size-3.5" />
                      </span>
                    ) : null}
                  </button>
                  <PlaceBadge place={places.get(p.id)} names={names} blank={blank} marked={p.opener} openerDesign={openerDesign} className="mt-1" />
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
